// Backoffice/Backend/src/routes/Inventory/ingredients.js
const express = require("express");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch {}

const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  const UNIT_ALLOWED = new Set(["kg", "g", "l", "ml", "pack", "pcs"]);
  const SAMPLE_LIMIT = 6;

  // near the top
  const LOW_STOCK_MIN_RATIO_CRITICAL = 0.25;

  // GET /api/inventory/ingredients/low-stock
  router.get("/low-stock", async (req, res) => {
    try {
      const { category, limit } = req.query;
      const L = Math.min(Number(limit) || 50, 200);

      const params = [];
      let where = `
        lowStock > 0
        AND currentStock > 0
        AND currentStock <= lowStock
      `;

      if (category) {
        where += " AND category_lower = ?";
        params.push(String(category).toLowerCase());
      }

      const rows = await db.query(
        `
        SELECT id, name, category, type, currentStock, lowStock, updatedAt
        FROM inventory_ingredients
        WHERE ${where}
        ORDER BY (currentStock / lowStock) ASC, updatedAt DESC
        LIMIT ${L}
        `,
        params
      );

      const items = rows.map((r) => {
        const currentStock = Number(r.currentStock || 0);
        const lowStock = Number(r.lowStock || 0);

        const ratio = lowStock > 0 ? currentStock / lowStock : 1;

        let alert = null;
        if (lowStock > 0 && currentStock > 0 && currentStock <= lowStock) {
          if (ratio <= LOW_STOCK_MIN_RATIO_CRITICAL) alert = "critical";
          else alert = "warning";
        }

        return {
          id: r.id,
          name: r.name,
          category: r.category,
          type: r.type,
          currentStock,
          lowStock,
          alert,
          ratio,
          updatedAt: r.updatedAt,
        };
      });

      res.json({ ok: true, items });
    } catch (e) {
      console.error("[low-stock] failed:", e);
      res.status(500).json({ ok: false, error: e?.message || "Low stock query failed" });
    }
  });

  // GET /api/inventory/ingredients  (newest first)
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, name, category, type, currentStock, lowStock, price, createdAt, updatedAt
           FROM inventory_ingredients
          ORDER BY updatedAt DESC, createdAt DESC, name ASC`
      );

      const ingredients = rows.map((r) => ({
        id: String(r.id),
        name: r.name,
        category: r.category,
        type: r.type || "",
        currentStock: Number(r.currentStock || 0),
        lowStock: Number(r.lowStock || 0),
        price: Number(r.price || 0),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      res.json({ ok: true, ingredients });
    } catch (e) {
      console.error("[ingredients] list failed:", e);
      res
        .status(500)
        .json({ ok: false, error: e.message || "List failed" });
    }
  });

  // Helper: check if an ingredient is used by any item JSON
  async function ingredientUsage(ingredientId) {
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
      if (!ingredientId) {
        return res.json({ ok: true, isUsed: false, usedInItems: [] });
      }

      const rows = await ingredientUsage(ingredientId);
      const isUsed = rows.length > 0;
      const usedInItems = [...new Set(rows.map((r) => r.name || "Unnamed Item"))];

      res.json({ ok: true, isUsed, usedInItems });
    } catch (e) {
      console.error("[ingredients] usage check failed:", e);
      res
        .status(500)
        .json({ ok: false, error: e.message || "Usage check failed" });
    }
  });

  // POST /api/inventory/ingredients
  router.post("/", async (req, res) => {
    try {
      const name = normalize(req.body?.name);
      const category = normalize(req.body?.category);
      const type = normalize(req.body?.type);

      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }
      if (!category) {
        return res
          .status(400)
          .json({ ok: false, error: "Category is required." });
      }
      if (!type) {
        return res
          .status(400)
          .json({ ok: false, error: "Unit is required." });
      }
      if (UNIT_ALLOWED.size && !UNIT_ALLOWED.has(type)) {
        return res
          .status(400)
          .json({ ok: false, error: "Unit is not allowed." });
      }

      const now = new Date();
      const result = await db.query(
        `INSERT INTO inventory_ingredients
          (name, category, type, currentStock, lowStock, price, createdAt, updatedAt)
         VALUES (?, ?, ?, 0, 0, 0, ?, ?)`,
        [name, category, type, now, now]
      );

      res.status(201).json({ ok: true, id: String(result.insertId) });
    } catch (e) {
      // Friendly duplicate error
      if (
        e?.code === "ER_DUP_ENTRY" &&
        /inventory_ingredients\.uq_inventory_ingredients_name_lower/i.test(
          e?.message || ""
        )
      ) {
        return res.status(409).json({
          ok: false,
          code: "name_taken",
          error: `That ingredient name already exists. Names are not case-sensitive. Try a different name.`,
        });
      }
      console.error("[ingredients] create failed:", e);
      res.status(500).json({ ok: false, error: "Create failed" });
    }
  });

  // PATCH /api/inventory/ingredients/:id
  router.patch("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }

      const u = {};

      // Name
      if (req.body?.name !== undefined) {
        const name = normalize(req.body.name);
        if (!isValidName(name)) {
          return res.status(400).json({
            ok: false,
            error:
              "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
          });
        }
        u.name = name;
      }

      // Category
      if (req.body?.category !== undefined) {
        const cat = normalize(req.body.category);
        if (!cat) {
          return res
            .status(400)
            .json({ ok: false, error: "Category cannot be empty." });
        }
        u.category = cat;
      }

      // Unit / type
      if (req.body?.type !== undefined) {
        const t = normalize(req.body.type);
        if (!t) {
          return res
            .status(400)
            .json({ ok: false, error: "Unit cannot be empty." });
        }
        if (UNIT_ALLOWED.size && !UNIT_ALLOWED.has(t)) {
          return res
            .status(400)
            .json({ ok: false, error: "Unit is not allowed." });
        }
        u.type = t;
      }

      // currentStock
      if (req.body?.currentStock !== undefined) {
        const n = Number(req.body.currentStock);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({
            ok: false,
            error: "currentStock must be a non-negative number",
          });
        }
        u.currentStock = n;
      }

      // lowStock (notification threshold)
      if (req.body?.lowStock !== undefined) {
        const n = Number(req.body.lowStock);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({
            ok: false,
            error: "lowStock must be a non-negative number",
          });
        }
        u.lowStock = n;
      }

      // price
      if (req.body?.price !== undefined) {
        const n = Number(req.body.price);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({
            ok: false,
            error: "price must be a non-negative number",
          });
        }
        u.price = n;
      }

      const sets = ["updatedAt = ?"];
      const params = [new Date()];

      for (const [k, v] of Object.entries(u)) {
        sets.push(`${k} = ?`);
        params.push(v);
      }
      params.push(id);

      await db.query(
        `UPDATE inventory_ingredients SET ${sets.join(", ")} WHERE id = ?`,
        params
      );

      res.json({ ok: true, message: "Ingredient updated successfully" });
    } catch (e) {
      // Friendly duplicate error on rename
      if (
        e?.code === "ER_DUP_ENTRY" &&
        /inventory_ingredients\.uq_inventory_ingredients_name_lower/i.test(
          e?.message || ""
        )
      ) {
        return res.status(409).json({
          ok: false,
          code: "name_taken",
          error: `That ingredient name already exists. Names are not case-sensitive. Try a different name.`,
        });
      }
      console.error("[ingredients] update failed:", e);
      res.status(500).json({ ok: false, error: "Update failed" });
    }
  });

  // DELETE /api/inventory/ingredients/:id
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }

      // (1) Check if used in menu items
      const usedIn = await ingredientUsage(String(id));
      if (usedIn.length) {
        const names = [...new Set(usedIn.map((r) => r.name || "Unnamed Item"))];
        return res.status(409).json({
          ok: false,
          error: `Cannot delete ingredient: It is currently used in menu items (${names.join(
            ", "
          )}).`,
          reason: "item-linked",
          sample: names.slice(0, 5),
        });
      }

      // (2) Check if used in inventory_activity logs
      const activityRows = await db.query(
        `SELECT id, remarks FROM inventory_activity WHERE ingredientId = ? LIMIT 5`,
        [id]
      );
      if (activityRows.length) {
        const remarks = activityRows.map(
          (a) => a.remarks || `Activity #${a.id}`
        );
        return res.status(409).json({
          ok: false,
          error: `Cannot delete ingredient: It has ${activityRows.length} linked activity record(s).`,
          reason: "activity-linked",
          sample: remarks,
        });
      }

      await db.query(`DELETE FROM inventory_ingredients WHERE id = ?`, [id]);
      res.json({ ok: true, message: "Ingredient deleted successfully" });
    } catch (e) {
      console.error("[ingredients] delete failed:", e);
      res
        .status(500)
        .json({ ok: false, error: e.message || "Delete failed" });
    }
  });

  // Helper: count activity per ingredient for a set of ids (one SQL roundtrip)
  async function activityCountsMap(dbConn, ids) {
    if (!ids.length) return new Map();
    const placeholders = ids.map(() => "?").join(",");
    const rows = await dbConn.query(
      `SELECT ingredientId AS id, COUNT(*) AS n
         FROM inventory_activity
        WHERE ingredientId IN (${placeholders})
        GROUP BY ingredientId`,
      ids
    );
    const map = new Map();
    for (const r of rows || []) {
      map.set(Number(r.id), Number(r.n || 0));
    }
    return map;
  }

  /**
   * DELETE /api/inventory/ingredients
   * Body: { ids: string[] | number[] }
   * Deletes only ingredients not in use; reports blocked (with counts & samples).
   */
  router.delete("/", async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((x) => Number(x)).filter(Number.isFinite)
        : [];

      if (!ids.length) {
        return res
          .status(400)
          .json({ ok: false, error: "ids array required" });
      }

      // Preload activity counts in one shot
      const actMap = await activityCountsMap(db, ids);

      const deletable = [];
      const blocked = []; // { id, reason: 'item-linked'|'activity-linked', count, sample[] }

      // First pass: mark activity-linked immediately
      for (const id of ids) {
        const actN = actMap.get(id) || 0;
        if (actN > 0) {
          blocked.push({
            id: String(id),
            reason: "activity-linked",
            count: actN,
            sample: [],
          });
        } else {
          deletable.push(id);
        }
      }

      // Second pass: for the ones not blocked by activity, check item JSON usage
      const finalDeletable = [];
      for (const id of deletable) {
        const usedIn = await ingredientUsage(String(id));
        if (usedIn.length) {
          blocked.push({
            id: String(id),
            reason: "item-linked",
            count: usedIn.length,
            sample: [...new Set(usedIn.map((r) => r.name || "Unnamed Item"))].slice(
              0,
              SAMPLE_LIMIT
            ),
          });
        } else {
          finalDeletable.push(id);
        }
      }

      // Delete whatever is safe
      if (finalDeletable.length) {
        const placeholders = finalDeletable.map(() => "?").join(",");
        await db.query(
          `DELETE FROM inventory_ingredients WHERE id IN (${placeholders})`,
          finalDeletable
        );
      }

      return res.json({
        ok: true,
        deleted: finalDeletable.length,
        blocked, // array of {id, reason, count, sample[]}
      });
    } catch (e) {
      console.error("[ingredients] bulk delete failed:", e);
      res
        .status(500)
        .json({ ok: false, error: e.message || "Bulk delete failed" });
    }
  });

  return router;
};