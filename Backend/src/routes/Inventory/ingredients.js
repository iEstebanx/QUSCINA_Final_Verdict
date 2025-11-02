// Backend/src/routes/Inventory/ingredients.js
const express = require("express");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try { sharedDb = require("../../shared/db/mysql").db; } catch {}

const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) => !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  // GET /api/inventory/ingredients  (newest first)
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, name, category, type, currentStock, lowStock, price, createdAt, updatedAt
           FROM inventory_ingredients
          ORDER BY createdAt DESC, updatedAt DESC, name ASC`
      );
      // Mirror your old shape
      const ingredients = rows.map(r => ({
        id: String(r.id),
        name: r.name,
        category: r.category,
        type: r.type || "",
        currentStock: Number(r.currentStock || 0),
        lowStock: Number(r.lowStock || 0),
        price: Number(r.price || 0),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }));
      res.json({ ok: true, ingredients });
    } catch (e) {
      console.error("[ingredients] list failed:", e);
      res.status(500).json({ ok: false, error: e.message || "List failed" });
    }
  });

  // Helper: check if an ingredient is used by any item JSON
  async function ingredientUsage(ingredientId) {
    // 1) array of strings: JSON_CONTAINS(ingredients, JSON_QUOTE(?))
    // 2) array of objects: JSON_SEARCH(... '$[*].ingredientId')
    const rows = await db.query(
      `SELECT id, name
         FROM items
        WHERE JSON_CONTAINS(ingredients, JSON_QUOTE(?))
           OR JSON_SEARCH(ingredients, 'one', ?, NULL, '$[*].ingredientId') IS NOT NULL
        LIMIT 5`,
      [ingredientId, ingredientId]
    );
    return rows;
  }

  // GET /api/inventory/ingredients/:id/usage
  router.get("/:id/usage", async (req, res) => {
    try {
      const ingredientId = String(req.params.id || "");
      if (!ingredientId) return res.json({ ok: true, isUsed: false, usedInItems: [] });

      const rows = await ingredientUsage(ingredientId);
      const isUsed = rows.length > 0;
      const usedInItems = [...new Set(rows.map(r => r.name || "Unnamed Item"))];

      res.json({ ok: true, isUsed, usedInItems });
    } catch (e) {
      console.error("[ingredients] usage check failed:", e);
      res.status(500).json({ ok: false, error: e.message || "Usage check failed" });
    }
  });

  // POST /api/inventory/ingredients  { name, category, type }
  router.post("/", async (req, res) => {
    try {
      const name = normalize(req.body?.name);
      const category = normalize(req.body?.category);
      const type = normalize(req.body?.type) || "";

      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }
      if (!category) return res.status(400).json({ ok: false, error: "Category is required." });

      const now = new Date();
      const result = await db.query(
        `INSERT INTO inventory_ingredients
         (name, category, type, currentStock, lowStock, price, createdAt, updatedAt)
         VALUES (?, ?, ?, 0, 0, 0, ?, ?)`,
        [name, category, type, now, now]
      );
      res.status(201).json({ ok: true, id: String(result.insertId) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || "Create failed" });
    }
  });

  // PATCH /api/inventory/ingredients/:id
  router.patch("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

      const u = {};
      if (req.body?.name !== undefined) {
        const name = normalize(req.body.name);
        if (!isValidName(name)) {
          return res.status(400).json({
            ok: false,
            error: "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
          });
        }
        u.name = name;
      }
      if (req.body?.category !== undefined) u.category = normalize(req.body.category);
      if (req.body?.type !== undefined) u.type = normalize(req.body.type);
      if (req.body?.currentStock !== undefined) u.currentStock = Number(req.body.currentStock);
      if (req.body?.lowStock !== undefined) u.lowStock = Number(req.body.lowStock);
      if (req.body?.price !== undefined) u.price = Number(req.body.price);

      const sets = ["updatedAt = ?"];
      const params = [new Date()];
      for (const [k, v] of Object.entries(u)) { sets.push(`${k} = ?`); params.push(v); }
      params.push(id);

      await db.query(`UPDATE inventory_ingredients SET ${sets.join(", ")} WHERE id = ?`, params);
      res.json({ ok: true, message: "Ingredient updated successfully" });
    } catch (e) {
      console.error("[ingredients] update failed:", e);
      res.status(500).json({ ok: false, error: e.message || "Update failed" });
    }
  });

  // DELETE /api/inventory/ingredients/:id
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

      // usage check
      const usedIn = await ingredientUsage(String(id));
      if (usedIn.length) {
        const names = [...new Set(usedIn.map(r => r.name || "Unnamed Item"))];
        return res.status(400).json({
          ok: false,
          error: `Cannot delete ingredient: It is currently used in menu items (${names.join(", ")}).`,
        });
      }

      await db.query(`DELETE FROM inventory_ingredients WHERE id = ?`, [id]);
      res.json({ ok: true, message: "Ingredient deleted successfully" });
    } catch (e) {
      console.error("[ingredients] delete failed:", e);
      res.status(500).json({ ok: false, error: e.message || "Delete failed" });
    }
  });

  return router;
};