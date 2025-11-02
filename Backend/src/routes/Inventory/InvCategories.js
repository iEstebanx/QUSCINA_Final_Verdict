// Backend/src/routes/Inventory/invCategories.js
const express = require("express");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try { sharedDb = require("../../shared/db/mysql").db; } catch {}

const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalizeName = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) => !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

const toISO = (v) => {
  try {
    if (!v) return null;
    if (typeof v === "string") return v;
    return new Date(v).toISOString();
  } catch { return null; }
};

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  // GET /api/inventory/inv-categories
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, name, createdAt, updatedAt
           FROM inventory_categories
          ORDER BY createdAt DESC`
      );
      const categories = rows.map(r => ({
        id: String(r.id),
        name: r.name,
        createdAt: toISO(r.createdAt),
        updatedAt: toISO(r.updatedAt)
      }));
      res.json({ ok: true, categories });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || "List failed" });
    }
  });

  // POST /api/inventory/inv-categories { name }
  router.post("/", async (req, res) => {
    try {
      const name = normalizeName(req.body?.name);
      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }
      const now = new Date();
      const result = await db.query(
        `INSERT INTO inventory_categories (name, createdAt, updatedAt)
         VALUES (?, ?, ?)`,
        [name, now, now]
      );
      const id = result.insertId;
      const row = await db.query(
        `SELECT id, name, createdAt, updatedAt FROM inventory_categories WHERE id = ?`,
        [id]
      );
      const d = row[0];
      const category = {
        id: String(d.id),
        name: d.name,
        createdAt: toISO(d.createdAt),
        updatedAt: toISO(d.updatedAt)
      };
      res.status(201).json({ ok: true, category });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || "Create failed" });
    }
  });

  // PATCH /api/inventory/inv-categories/:id { name }
  router.patch("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Not found" });

      const name = normalizeName(req.body?.name);
      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }

      await db.query(
        `UPDATE inventory_categories SET name = ?, updatedAt = ? WHERE id = ?`,
        [name, new Date(), id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || "Update failed" });
    }
  });

  // DELETE /api/inventory/inv-categories  { ids: string[] }
  router.delete("/", async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((x) => Number(x)).filter(Number.isFinite)
        : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: "No ids provided" });

      const placeholders = ids.map(() => "?").join(",");
      await db.query(`DELETE FROM inventory_categories WHERE id IN (${placeholders})`, ids);

      res.json({ ok: true, deleted: ids.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || "Delete failed" });
    }
  });

  return router;
};