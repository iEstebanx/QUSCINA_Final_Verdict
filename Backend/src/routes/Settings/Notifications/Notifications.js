// Backend/src/routes/Settings/Notifications/Notifications.js
const express = require("express");

let sharedDb = null;
try { sharedDb = require("../../../shared/db/mysql").db; } catch {}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");
  const router = express.Router();

  /**
   * GET /api/settings/notifications/stock-limits
   * Query:
   *   - categoryId (optional)  -> resolved to category name (inventory_categories)
   *   - q (optional)           -> search in name/category/type
   *   - lowOnly (optional)     -> "1" to show only rows where lowStock>0 AND current<=low
   */
  router.get("/stock-limits", async (req, res) => {
    try {
      let { categoryId = "", q = "", lowOnly = "" } = req.query || {};
      categoryId = String(categoryId || "").trim();
      q = String(q || "").trim();
      const onlyLow = String(lowOnly || "") === "1";

      // Resolve categoryId → category name
      let categoryName = "";
      if (categoryId) {
        const r = await db.query(
          `SELECT name FROM inventory_categories WHERE id = ? LIMIT 1`,
          [Number(categoryId)]
        );
        if (r?.length) categoryName = String(r[0].name || "");
      }

      const where = [];
      const params = [];

      if (categoryName) {
        where.push(`category_lower = LOWER(?)`);
        params.push(categoryName);
      }

      if (q) {
        const like = `%${q}%`;
        where.push(`(name LIKE ? OR category LIKE ? OR type LIKE ?)`);
        params.push(like, like, like);
      }

      if (onlyLow) {
        where.push(`lowStock > 0`, `currentStock <= lowStock`);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const rows = await db.query(
        `
        SELECT id, name, category, type AS unit, currentStock AS quantity, lowStock
        FROM inventory_ingredients
        ${whereSql}
        ORDER BY updatedAt DESC, name ASC
        `,
        params
      );

      res.json({
        ok: true,
        rows: (rows || []).map(r => ({
          id: String(r.id),
          name: r.name,
          category: r.category,
          unit: r.unit || "",
          quantity: Number(r.quantity || 0),
          lowStock: Number(r.lowStock || 0),
        })),
      });
    } catch (e) {
      console.error("[notifications/stock-limits] GET failed:", e);
      res.status(500).json({ ok: false, error: e.message || "Failed to load stock limits" });
    }
  });

  /**
   * PATCH /api/settings/notifications/stock-limits/:id
   * Body: { lowStock: number }
   */
  router.patch("/stock-limits/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

      const low = Number(req.body?.lowStock);
      if (!Number.isFinite(low) || low < 0) {
        return res.status(400).json({ ok: false, error: "lowStock must be a non-negative number" });
      }

      await db.query(
        `UPDATE inventory_ingredients SET lowStock = ?, updatedAt = ? WHERE id = ?`,
        [low, new Date(), id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error("[notifications/stock-limits] PATCH failed:", e);
      res.status(500).json({ ok: false, error: e.message || "Update failed" });
    }
  });

  return router;
};