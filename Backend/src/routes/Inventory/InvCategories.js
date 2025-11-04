// Backend/src/routes/Inventory/invCategories.js
const express = require("express");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try { sharedDb = require("../../shared/db/mysql").db; } catch {}

const NAME_MAX = 60;
const NAME_MIN = 3;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;

const normalizeName = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length >= NAME_MIN && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

const toISO = (v) => {
  try {
    if (!v) return null;
    return typeof v === "string" ? v : new Date(v).toISOString();
  } catch { return null; }
};

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();
  router.use(express.json());

  // GET /api/inventory/inv-categories
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, name, name_lower, active, created_at, updated_at
           FROM inventory_categories
          ORDER BY updated_at DESC`
      );
      const categories = rows.map((r) => ({
        id: String(r.id),
        name: r.name,
        createdAt: toISO(r.created_at),
        updatedAt: toISO(r.updated_at),
        active: r.active ? 1 : 0,
      }));
      res.json({ ok: true, categories });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || "List failed" });
    }
  });

  // POST /api/inventory/inv-categories  { name }
  router.post("/", async (req, res) => {
    try {
      const raw = normalizeName(req.body?.name);
      if (!isValidName(raw)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid name. Must be at least ${NAME_MIN} characters (max ${NAME_MAX}); allowed letters, numbers, spaces, - ' & . , ( ) /.`,
        });
      }

      const now = new Date();
      const nameLower = raw.toLowerCase();

      const result = await db.query(
        `INSERT INTO inventory_categories (name, name_lower, active, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?)`,
        [raw, nameLower, now, now]
      );

      const id = result.insertId;
      const row = await db.query(
        `SELECT id, name, name_lower, active, created_at, updated_at
           FROM inventory_categories WHERE id = ?`,
        [id]
      );
      const r = row[0] || {};
      const category = {
        id: String(r.id),
        name: r.name,
        createdAt: toISO(r.created_at),
        updatedAt: toISO(r.updated_at),
        active: r.active ? 1 : 0,
      };

      return res.status(201).json({ ok: true, category });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062) {
        return res
          .status(409)
          .json({ ok: false, error: "That category name already exists (names are case-insensitive)." });
      }
      return res.status(400).json({ ok: false, error: e?.message || "Create failed" });
    }
  });

  // PATCH /api/inventory/inv-categories/:id  { name }
  router.patch("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }

      const raw = normalizeName(req.body?.name);
      if (!isValidName(raw)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid name. Must be at least ${NAME_MIN} characters (max ${NAME_MAX}); allowed letters, numbers, spaces, - ' & . , ( ) /.`,
        });
      }

      const now = new Date();
      await db.query(
        `UPDATE inventory_categories
            SET name = ?, name_lower = ?, updated_at = ?
          WHERE id = ?`,
        [raw, raw.toLowerCase(), now, id]
      );

      // return the updated row for nicer UX
      const row = await db.query(
        `SELECT id, name, name_lower, active, created_at, updated_at
           FROM inventory_categories WHERE id = ?`,
        [id]
      );
      const r = row[0] || {};
      const category = {
        id: String(r.id),
        name: r.name,
        createdAt: toISO(r.created_at),
        updatedAt: toISO(r.updated_at),
        active: r.active ? 1 : 0,
      };

      return res.json({ ok: true, category });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062) {
        return res
          .status(409)
          .json({ ok: false, error: "That category name already exists (names are case-insensitive)." });
      }
      return res.status(400).json({ ok: false, error: e?.message || "Update failed" });
    }
  });

  // DELETE /api/inventory/inv-categories/:id — single
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }
      await db.query(`DELETE FROM inventory_categories WHERE id = ?`, [id]);
      return res.json({ ok: true, deleted: 1 });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e?.message || "Delete failed" });
    }
  });

  // DELETE /api/inventory/inv-categories  { ids: string[] } — bulk
  router.delete("/", async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((x) => Number(x)).filter(Number.isFinite)
        : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: "ids array required" });

      const placeholders = ids.map(() => "?").join(",");
      await db.query(`DELETE FROM inventory_categories WHERE id IN (${placeholders})`, ids);

      return res.json({ ok: true, deleted: ids.length });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e?.message || "Delete failed" });
    }
  });

  return router;
};