// QUSCINA_BACKOFFICE/Backend/src/routes/POS/menu.js
const express = require("express");

// Normalize any db.query result into an array of rows
function asArray(result) {
  if (!result) return [];
  // mysql2/promise style: [rows, fields]
  if (Array.isArray(result[0]) && result.length >= 1) return result[0];
  // already rows array
  if (Array.isArray(result)) return result;
  return [];
}

// Safe JSON parse helper (supports MySQL JSON returning object)
function safeJsonParse(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  const str = value.trim();
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
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
   * Used by POS frontend via /api/pos/menu
   */
  router.get("/", async (req, res) => {
    if (!db) {
      return res
        .status(500)
        .json({ ok: false, error: "DB not available for POS menu." });
    }

    const wantDebug =
      String(req.query.debug || "").trim() === "1" ||
      String(req.query.debug || "").trim().toLowerCase() === "true";

    try {
      // 1) Load active items (categoryName is denormalized already)
      const rawItems = await db.query(
        `
        SELECT
          id,
          name,
          description,
          price,
          imageDataUrl     AS imageUrl,
          ingredients      AS ingredientsJson,
          stockMode,
          inventoryIngredientId,
          inventoryDeductQty,
          costOverall,
          profit,
          manualAvailable,
          active           AS isActive,
          categoryName     AS category
        FROM items
        WHERE active = 1
        ORDER BY updatedAt DESC, nameLower ASC
        `
      );

      // 2) Load inventory stocks + kind
      const rawInv = await db.query(
        `
        SELECT id, inventory_type_id, currentStock
        FROM inventory_ingredients
        `
      );

      const itemRows = asArray(rawItems);
      const invRows = asArray(rawInv);

      const invById = new Map(
        invRows.map((r) => [
          Number(r.id),
          {
            id: Number(r.id),
            inventoryTypeId: Number(r.inventory_type_id || 1),
            currentStock: num(r.currentStock, 0),
          },
        ])
      );

      const items = itemRows.map((row) => {
        const price = num(row.price, 0);
        const isActive = num(row.isActive, 0) === 1;

        const manualAvailable =
          row.manualAvailable == null ? 1 : num(row.manualAvailable, 0) ? 1 : 0;

        const stockMode = String(row.stockMode || "ingredients").toLowerCase();

        let ingredients = safeJsonParse(row.ingredientsJson, []);
        if (!Array.isArray(ingredients)) ingredients = [];

        // Normalize ingredientId as string (matches your Option 2 normalization)
        ingredients = ingredients
          .map((r) => ({
            ...r,
            ingredientId: String(r?.ingredientId ?? "").trim(),
            qty: num(r?.qty ?? r?.quantity ?? r?.amount, 0),
          }))
          .filter((r) => r.ingredientId && r.qty > 0);

        // ---------- stock checks ----------
        let hasStock = true;
        let stockReason = "ok";

        if (stockMode === "ingredients") {
          const hasIngredients = ingredients.length > 0;

          if (!hasIngredients) {
            hasStock = false;
            stockReason = "no-recipe";
          } else {
            hasStock = ingredients.every((ing) => {
              const ingId = Number(ing.ingredientId);
              if (!Number.isFinite(ingId) || ingId <= 0) return false;

              const inv = invById.get(ingId);
              const current = inv?.currentStock ?? 0;
              const needed = num(ing.qty, 0);

              // need >= qty (qty already > 0 due to filter)
              return current >= needed;
            });

            if (!hasStock) stockReason = "insufficient-ingredients-stock";
          }
        } else if (stockMode === "direct") {
          const invIdNum = num(row.inventoryIngredientId, 0);
          const deductQty = num(row.inventoryDeductQty, 1);

          if (!invIdNum) {
            hasStock = false;
            stockReason = "no-direct-link";
          } else {
            const inv = invById.get(invIdNum);
            if (!inv) {
              hasStock = false;
              stockReason = "direct-link-missing";
            } else if (Number(inv.inventoryTypeId || 1) !== 2) {
              // direct must link to Product (inventory_type_id=2)
              hasStock = false;
              stockReason = "direct-link-not-product";
            } else {
              const current = num(inv.currentStock, 0);
              hasStock = current >= (deductQty > 0 ? deductQty : 1);
              if (!hasStock) stockReason = "insufficient-direct-stock";
            }
          }
        } else if (stockMode === "hybrid") {
          // HYBRID = must satisfy BOTH recipe ingredients AND direct product stock
          const hasIngredients = ingredients.length > 0;

          const invIdNum = num(row.inventoryIngredientId, 0);
          const deductQty = num(row.inventoryDeductQty, 1);

          // 1) recipe check
          let okRecipe = false;
          if (!hasIngredients) {
            okRecipe = false;
          } else {
            okRecipe = ingredients.every((ing) => {
              const ingId = Number(ing.ingredientId);
              if (!Number.isFinite(ingId) || ingId <= 0) return false;

              const inv = invById.get(ingId);
              const current = inv?.currentStock ?? 0;
              const needed = num(ing.qty, 0);

              return current >= needed;
            });
          }

          // 2) direct check (must be Product)
          let okDirect = false;
          if (!invIdNum) {
            okDirect = false;
          } else {
            const inv = invById.get(invIdNum);
            if (!inv) okDirect = false;
            else if (Number(inv.inventoryTypeId || 1) !== 2) okDirect = false;
            else {
              const current = num(inv.currentStock, 0);
              okDirect = current >= (deductQty > 0 ? deductQty : 1);
            }
          }

          hasStock = okRecipe && okDirect;

          // debug reason
          if (!hasIngredients) stockReason = "hybrid-missing-recipe";
          else if (!invIdNum) stockReason = "hybrid-missing-direct";
          else if (!okRecipe) stockReason = "insufficient-ingredients-stock";
          else if (!okDirect) stockReason = "insufficient-direct-stock";
          else stockReason = "ok";
        } else {
          // Unknown/unsupported stockMode → safest is mark unavailable
          hasStock = false;
          stockReason = "unknown-stockmode";
        }

        // Base availability gates
        const baseAvailable = isActive && price > 0 && !!manualAvailable;

        // Final availability (now *enforced* by stock mode concept)
        const available = baseAvailable && hasStock;

        const out = {
          id: String(row.id),
          name: row.name,
          description: row.description || "",
          price,
          imageUrl: row.imageUrl || null,
          category: row.category || "Uncategorized",
          costOverall: num(row.costOverall, 0),
          profit: num(row.profit, 0),
          manualAvailable,
          isActive: isActive ? 1 : 0,
          stockMode,
          inventoryIngredientId:
            row.inventoryIngredientId != null ? String(row.inventoryIngredientId) : "",
          inventoryDeductQty: num(row.inventoryDeductQty, 1),
          available: available ? 1 : 0,
          ingredients,
        };

        if (wantDebug) {
          out.debug = {
            price,
            isActive,
            manualAvailable,
            stockMode,
            hasStock,
            stockReason,
            baseAvailable,
          };
        }

        return out;
      });

      return res.json({ ok: true, items });
    } catch (err) {
      console.error("[POS menu] GET /pos/menu failed:", err);
      return res.status(500).json({
        ok: false,
        error: "Failed to load menu items.",
        debug: err?.message || String(err),
        code: err?.code || null,
      });
    }
  });

  /**
   * POST /pos/menu/toggle
   * Body: { id, available }
   *
   * Turning ON requires:
   *  - price > 0
   *  - stockMode rules satisfied + hasStock
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
        return res.status(400).json({ ok: false, error: "id and available are required." });
      }

      const wantAvailable =
        available === true ||
        available === 1 ||
        available === "1" ||
        String(available).toLowerCase() === "true";

      const rawSelect = await db.query(
        `
        SELECT
          id,
          price,
          active AS isActive,
          manualAvailable,
          ingredients AS ingredientsJson,
          stockMode,
          inventoryIngredientId,
          inventoryDeductQty
        FROM items
        WHERE id = ?
        LIMIT 1
        `,
        [itemId]
      );

      const rows = asArray(rawSelect);
      const item = rows[0];

      if (!item) return res.status(404).json({ ok: false, error: "Item not found." });

      const price = num(item.price, 0);
      const isActive = num(item.isActive, 0) === 1;

      if (!isActive) {
        return res.status(400).json({
          ok: false,
          error: "Cannot change availability: item is not active.",
        });
      }

      if (wantAvailable) {
        if (price <= 0) {
          return res.status(400).json({
            ok: false,
            error: "Cannot mark this item as available because it has no valid price.",
          });
        }

        const stockMode = String(item.stockMode || "ingredients").toLowerCase();

        // /pos/menu/toggle — stockMode gates (UPDATED with HYBRID support)
        if (stockMode === "ingredients") {
          let ingredients = safeJsonParse(item.ingredientsJson, []);
          if (!Array.isArray(ingredients)) ingredients = [];

          ingredients = ingredients
            .map((r) => ({
              ingredientId: String(r?.ingredientId ?? "").trim(),
              qty: num(r?.qty ?? r?.quantity ?? r?.amount, 0),
            }))
            .filter((r) => r.ingredientId && r.qty > 0);

          if (ingredients.length === 0) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because it has no recipe ingredients.",
            });
          }

          const ids = ingredients
            .map((r) => Number(r.ingredientId))
            .filter((n) => Number.isFinite(n) && n > 0);

          if (!ids.length) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because its recipe has invalid ingredient ids.",
            });
          }

          const placeholders = ids.map(() => "?").join(",");
          const rawInv = await db.query(
            `
            SELECT id, currentStock
            FROM inventory_ingredients
            WHERE id IN (${placeholders})
            `,
            ids
          );

          const invRows = asArray(rawInv);
          const stockById = new Map(
            invRows.map((r) => [Number(r.id), num(r.currentStock, 0)])
          );

          const okStock = ingredients.every((ing) => {
            const ingId = Number(ing.ingredientId);
            const current = stockById.get(ingId) ?? 0;
            return current >= num(ing.qty, 0);
          });

          if (!okStock) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because one or more ingredients are out of stock.",
            });
          }

        } else if (stockMode === "direct") {
          const invIdNum = num(item.inventoryIngredientId, 0);
          const deductQty = num(item.inventoryDeductQty, 1);

          if (!invIdNum) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because it has no Direct inventory link.",
            });
          }

          const invRows = await db.query(
            `SELECT id, inventory_type_id, currentStock FROM inventory_ingredients WHERE id = ? LIMIT 1`,
            [invIdNum]
          );
          const inv = asArray(invRows)[0];

          if (!inv) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because its linked inventory record was not found.",
            });
          }

          if (Number(inv.inventory_type_id || 1) !== 2) {
            return res.status(400).json({
              ok: false,
              error: "Direct stock mode can only link to inventory items marked as Product (inventory_type_id=2).",
            });
          }

          const current = num(inv.currentStock, 0);
          const need = deductQty > 0 ? deductQty : 1;

          if (current < need) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because the linked inventory is out of stock.",
            });
          }

        } else if (stockMode === "hybrid") {
          // ✅ HYBRID: require BOTH (ingredients in stock) AND (direct product in stock)

          // --- (A) ingredients check ---
          let ingredients = safeJsonParse(item.ingredientsJson, []);
          if (!Array.isArray(ingredients)) ingredients = [];

          ingredients = ingredients
            .map((r) => ({
              ingredientId: String(r?.ingredientId ?? "").trim(),
              qty: num(r?.qty ?? r?.quantity ?? r?.amount, 0),
            }))
            .filter((r) => r.ingredientId && r.qty > 0);

          if (ingredients.length === 0) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because it has no recipe ingredients.",
            });
          }

          const ids = ingredients
            .map((r) => Number(r.ingredientId))
            .filter((n) => Number.isFinite(n) && n > 0);

          if (!ids.length) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because its recipe has invalid ingredient ids.",
            });
          }

          const placeholders = ids.map(() => "?").join(",");
          const rawInv = await db.query(
            `
            SELECT id, currentStock
            FROM inventory_ingredients
            WHERE id IN (${placeholders})
            `,
            ids
          );

          const invRows = asArray(rawInv);
          const stockById = new Map(
            invRows.map((r) => [Number(r.id), num(r.currentStock, 0)])
          );

          const okRecipe = ingredients.every((ing) => {
            const ingId = Number(ing.ingredientId);
            const current = stockById.get(ingId) ?? 0;
            return current >= num(ing.qty, 0);
          });

          if (!okRecipe) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because one or more ingredients are out of stock.",
            });
          }

          // --- (B) direct check ---
          const invIdNum = num(item.inventoryIngredientId, 0);
          const deductQty = num(item.inventoryDeductQty, 1);

          if (!invIdNum) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because it has no Direct inventory link.",
            });
          }

          const invRows2 = await db.query(
            `SELECT id, inventory_type_id, currentStock FROM inventory_ingredients WHERE id = ? LIMIT 1`,
            [invIdNum]
          );
          const inv2 = asArray(invRows2)[0];

          if (!inv2) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because its linked inventory record was not found.",
            });
          }

          if (Number(inv2.inventory_type_id || 1) !== 2) {
            return res.status(400).json({
              ok: false,
              error: "Hybrid mode direct link must be a Product (inventory_type_id=2).",
            });
          }

          const current2 = num(inv2.currentStock, 0);
          const need2 = deductQty > 0 ? deductQty : 1;

          if (current2 < need2) {
            return res.status(400).json({
              ok: false,
              error: "This item cannot be marked available because the linked inventory is out of stock.",
            });
          }

        } else {
          return res.status(400).json({
            ok: false,
            error: "This item cannot be marked available because it has an unsupported stockMode.",
          });
        }

      }

      // Persist manual toggle
      await db.query(
        `UPDATE items SET manualAvailable = ? WHERE id = ?`,
        [wantAvailable ? 1 : 0, itemId]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error("[POS menu] POST /pos/menu/toggle failed:", err);
      return res.status(500).json({ ok: false, error: "Failed to update availability." });
    }
  });

  return router;
};