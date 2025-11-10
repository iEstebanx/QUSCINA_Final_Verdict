// Backend/src/routes/Settings/PaymentType/PaymentType.js
const express = require("express");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try { sharedDb = require("../../../shared/db/mysql").db; } catch {}

const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();
  router.use(express.json());

  /* ========= GET /api/settings/payment-type ========= */
  router.get("/", async (_req, res, next) => {
    try {
      const rows = await db.query(
        `SELECT id, name, active, sort_order, created_at, updated_at
           FROM payment_types
          ORDER BY active DESC, sort_order ASC, name_lower ASC`
      );
      const items = rows.map(r => ({
        id: String(r.id),
        name: r.name,
        active: !!r.active,
        sortOrder: Number(r.sort_order || 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json({ ok: true, paymentTypes: items });
    } catch (e) { next(e); }
  });

  /* ========= POST (create) ========= */
  router.post("/", async (req, res, next) => {
    try {
      const name = normalize(req.body?.name);
      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }
      const active = req.body?.active != null ? (req.body.active ? 1 : 0) : 1;
      const sortOrder = Number.isFinite(+req.body?.sortOrder) ? +req.body.sortOrder : 0;

      const now = new Date();
      const result = await db.query(
        `INSERT INTO payment_types (name, name_lower, active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, name.toLowerCase(), active, sortOrder, now, now]
      );
      res.status(201).json({ ok: true, id: String(result.insertId) });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" && /uq_payment_types_name_lower/i.test(e?.message || "")) {
        return res.status(409).json({ ok: false, code: "name_taken", error: "Payment type already exists." });
      }
      next(e);
    }
  });

  /* ========= PATCH (rename / toggle / sort) ========= */
  router.patch("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

      const sets = ["updated_at = ?"];
      const params = [new Date()];

      if (typeof req.body?.name === "string") {
        const n = normalize(req.body.name);
        if (!isValidName(n)) {
          return res.status(400).json({
            ok: false,
            error:
              "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
          });
        }
        sets.push("name = ?", "name_lower = ?");
        params.push(n, n.toLowerCase());
      }

      if (typeof req.body?.active !== "undefined") {
        sets.push("active = ?");
        params.push(req.body.active ? 1 : 0);
      }

      if (typeof req.body?.sortOrder !== "undefined") {
        const so = Number(req.body.sortOrder);
        sets.push("sort_order = ?");
        params.push(Number.isFinite(so) ? so : 0);
      }

      if (sets.length === 1) {
        return res.status(400).json({ ok: false, error: "no changes" });
      }

      params.push(id);
      await db.query(`UPDATE payment_types SET ${sets.join(", ")} WHERE id = ?`, params);
      res.json({ ok: true });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" && /uq_payment_types_name_lower/i.test(e?.message || "")) {
        return res.status(409).json({ ok: false, code: "name_taken", error: "Payment type already exists." });
      }
      next(e);
    }
  });

  /* ========= DELETE (bulk) ========= */
  router.delete("/", async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: "ids is required" });
      const placeholders = ids.map(() => "?").join(",");
      await db.query(`DELETE FROM payment_types WHERE id IN (${placeholders})`, ids);
      res.json({ ok: true, deleted: ids.length });
    } catch (e) { next(e); }
  });

  /* ========= DELETE (single) ========= */
  router.delete("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      await db.query(`DELETE FROM payment_types WHERE id = ?`, [id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
};