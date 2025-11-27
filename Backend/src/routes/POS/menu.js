// QUSCINA_BACKOFFICE/Backend/src/routes/POS/menu.js
const express = require("express");

// Safe JSON parse helper
function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// Normalize any db.query result into an array of rows
function asArray(result) {
  if (!result) return [];
  // Case 1: mysql2/promise style: [rows, fields]
  if (Array.isArray(result[0]) && result.length >= 1) {
    return result[0];
  }
  // Case 2: already rows array
  if (Array.isArray(result)) return result;
  // Fallback: unknown shape
  return [];
}

// Safe JSON parse helper
function safeJsonParse(value, fallback) {
  if (value == null) return fallback;

  // If it's already an object/array (MySQL JSON column auto-parsed)
  if (typeof value === "object") return value;

  // If it's not a string, we can't JSON.parse it
  if (typeof value !== "string") return fallback;

  const str = value.trim();
  if (!str) return fallback;

  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = function posMenuRouterFactory({ db } = {}) {
  const router = express.Router();

  if (!db) {
    console.error("[POS menu] WARNING: DB pool is missing, endpoints will 500.");
  } else {
    console.log("[POS menu] Router initialized with DB");
  }

  /**
   * GET /pos/menu
   *
   * Used by Frontend POS Menu.jsx via /api/pos/menu
   */
  router.get("/", async (_req, res) => {
    if (!db) {
      return res
        .status(500)
        .json({ ok: false, error: "DB not available for POS menu." });
    }

    try {
      // 1) Load base items (non-deleted / active)
      const rawItems = await db.query(
        `
        SELECT
          i.id,
          i.name,
          i.description,
          i.price,
          i.imageDataUrl     AS imageUrl,
          i.ingredients      AS ingredientsJson,
          i.costOverall      AS costOverall,
          i.profit           AS profit,
          i.manualAvailable  AS manualAvailable,
          i.active           AS isActive,
          c.name             AS category
        FROM items i
        LEFT JOIN categories c
          ON c.id = i.categoryId
        WHERE i.active = 1
        `
      );

      // 2) Load inventory stocks
      const rawInv = await db.query(
        `
        SELECT
          id,
          currentStock
        FROM inventory_ingredients
        `
      );

      const itemRows = asArray(rawItems);
      const invRows = asArray(rawInv);

      const stockById = new Map(
        invRows.map((r) => [Number(r.id), Number(r.currentStock || 0)])
      );

      // 3) Build final items array
      const items = itemRows.map((row) => {
        // Parse ingredients JSON safely
        let ingredients = safeJsonParse(row.ingredientsJson, []);
        if (!Array.isArray(ingredients)) ingredients = [];

        const hasIngredients = ingredients.length > 0;

        // We compute stock, but we’re NOT blocking availability with it for now
        let hasStock = false;
        if (hasIngredients) {
          hasStock = ingredients.every((ing) => {
            const ingId = Number(
              ing.ingredientId ?? ing.id ?? ing.inventoryId ?? 0
            );
            if (!ingId) return false;

            const current = stockById.get(ingId) ?? 0;

            const neededRaw = ing.qty ?? ing.quantity ?? ing.amount;
            const needed =
              neededRaw != null && neededRaw !== ""
                ? Number(neededRaw)
                : null;

            if (needed && needed > 0) {
              return current >= needed;
            }
            return current >= 1;
          });
        }

        const price = Number(row.price ?? 0);

        // ⚠️ This might be the culprit – manualAvailable from DB
        const manualAvailable =
          row.manualAvailable == null
            ? 1
            : Number(row.manualAvailable)
            ? 1
            : 0;

        const isActive = Number(row.isActive || 0) === 1;

        // Base availability (stock not enforced here)
        const baseAvailable =
          isActive &&
          price > 0 &&
          hasIngredients &&
          !!manualAvailable;

        // Also log in backend console so you can see it in Node terminal
        console.log("[POS menu] item availability check:", {
          id: row.id,
          name: row.name,
          price,
          isActive,
          manualAvailable,
          hasIngredients,
          hasStock,
          baseAvailable,
          rawIngredients: row.ingredientsJson,
        });

        return {
          id: row.id,
          name: row.name,
          description: row.description || "",
          price,
          imageUrl: row.imageUrl || null,
          category: row.category || "Uncategorized",
          costOverall: Number(row.costOverall ?? 0),
          profit: Number(row.profit ?? 0),
          manualAvailable,
          isActive: isActive ? 1 : 0,
          available: baseAvailable ? 1 : 0,

          // 🔹 DEBUG: include why this item is / isn’t available
          debug: {
            price,
            isActive,
            manualAvailable,
            hasIngredients,
            hasStock,
            baseAvailable,
          },

          ingredients,
        };
      });

      return res.json({ ok: true, items });
    } catch (err) {
      console.error("[POS menu] GET /pos/menu failed:", err);
      return res.status(500).json({
        ok: false,
        error: "Failed to load menu items.",
        debug: err.message || String(err),
        code: err.code || null,
      });
    }
  });

  /**
   * POST /pos/menu/toggle
   * Body: { id, available }
   */
  router.post("/toggle", async (req, res) => {
    if (!db) {
      return res
        .status(500)
        .json({ ok: false, error: "DB not available for POS menu." });
    }

    try {
      const { id, available } = req.body || {};

      const itemId = Number(id);
      if (!itemId || typeof available === "undefined") {
        return res.status(400).json({
          ok: false,
          error: "id and available are required.",
        });
      }

      const wantAvailable =
        available === true ||
        available === 1 ||
        available === "1" ||
        available === "true";

      // Load item including ingredients JSON
      const rawSelect = await db.query(
        `
          SELECT
            id,
            price,
            manualAvailable,
            active AS isActive,
            ingredients AS ingredientsJson
          FROM items
          WHERE id = ?
          LIMIT 1
          `,
        [itemId]
      );

      const rows = asArray(rawSelect);
      const item = rows[0];

      if (!item) {
        return res
          .status(404)
          .json({ ok: false, error: "Item not found." });
      }

      const price = Number(item.price ?? 0);

      if (wantAvailable) {
        // 1) Must have positive price
        if (price <= 0) {
          return res.status(400).json({
            ok: false,
            error:
              "Cannot mark this item as available because it has no valid price.",
          });
        }

        // 2) Must have at least one ingredient
        let ingredients = safeJsonParse(item.ingredientsJson, []);
        if (!Array.isArray(ingredients)) ingredients = [];

        const cleaned = ingredients.filter(
          (ing) =>
            ing &&
            (ing.ingredientId != null ||
              ing.id != null ||
              ing.inventoryId != null)
        );

        if (cleaned.length === 0) {
          return res.status(400).json({
            ok: false,
            error:
              "This item cannot be marked available because it has no ingredients.",
          });
        }

        // 3) All ingredients must have enough stock
        const ids = cleaned.map((ing) =>
          Number(ing.ingredientId ?? ing.id ?? ing.inventoryId)
        );
        const placeholders = ids.map(() => "?").join(",");

        // 🔹 Only load the ingredients we care about, and use correct column names
        const rawInv = await db.query(
          `
            SELECT
              id,
              currentStock
            FROM inventory_ingredients
            WHERE id IN (${placeholders})
          `,
          ids
        );

        const invRows = asArray(rawInv);
        const stockById = new Map(
          invRows.map((r) => [Number(r.id), Number(r.currentStock || 0)])
        );

        const hasEnoughIngredients = cleaned.every((ing) => {
          const ingId = Number(
            ing.ingredientId ?? ing.id ?? ing.inventoryId ?? 0
          );
          const current = stockById.get(ingId) ?? 0;
          if (current <= 0) return false;

          const neededRaw =
            ing.qty ?? ing.quantity ?? ing.amount;
          const needed =
            neededRaw != null && neededRaw !== ""
              ? Number(neededRaw)
              : null;

          if (needed && needed > 0) {
            return current >= needed;
          }
          return current >= 1;
        });

        if (!hasEnoughIngredients) {
          return res.status(400).json({
            ok: false,
            error:
              "This item cannot be marked available because one or more ingredients are out of stock.",
          });
        }
      }

      // If we get here: either turning OFF, or turning ON and all checks passed
      await db.query(
        `
          UPDATE items
          SET manualAvailable = ?
          WHERE id = ?
          `,
        [wantAvailable ? 1 : 0, itemId]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error("[POS menu] POST /pos/menu/toggle failed:", err);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to update availability." });
    }
  });

  return router;
};