// QUSCINA_BACKOFFICE/Backend/src/routes/Inventory/ingredients.js
const express = require("express");

const { requireAuth } = require("../../auth/requireAuth");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch {}

/* ============================================================
   AUDIT HELPERS FOR INVENTORY INGREDIENTS
   ============================================================ */

function getAuditUserFromReq(req) {
  // JWT payload from requireAuth.js (mounted at /api in server.js)
  const authUser = req?.user || null;
  if (!authUser) return null;

  const employeeName =
    authUser.employeeName ||
    authUser.name ||
    authUser.username ||
    authUser.email ||
    `Employee #${authUser.employeeId || authUser.sub || "Unknown"}`;

  return {
    employeeName,
    role: authUser.role || "—",
    id: authUser.employeeId || authUser.sub || null,
    username: authUser.username || null,
  };
}

/**
 * Map raw ingredient row (inventory_ingredients) into a small object
 * for auditTrail.detail.affectedData.items[]
 */
function mapIngredientItem(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    kind: row.kind || "ingredient",
    category: row.category,
    type: row.type,
    currentStock: Number(row.currentStock || 0),
    lowStock: Number(row.lowStock || 0),
  };
}

/**
 * Core audit writer for inventory ingredients module.
 * All logs go to audit_trail with:
 *   employee, role, action, detail(JSON)
 */
async function logInventoryIngredientAudit(
  db,
  req,
  {
    action,      // e.g. "Inventory - Ingredient Created"
    actionType,  // "create" | "update" | "delete" | "bulkDelete"
    ingredient,  // single ingredient row
    ingredients, // array of ingredient rows (for bulk delete)
    before,      // before snapshot (for updates)
    after,       // after snapshot (for updates)
    changes,     // { field: { before, after } } for updates
    extra = {},  // { statusMessage, actionDetails: {...} }
  }
) {
  const user = getAuditUserFromReq(req);
  const employee = user?.employeeName || "System";
  const role = user?.role || "—";

  const items = [];
  const singleItem = mapIngredientItem(ingredient);
  if (singleItem) items.push(singleItem);

  if (Array.isArray(ingredients)) {
    for (const r of ingredients) {
      const mapped = mapIngredientItem(r);
      if (mapped) items.push(mapped);
    }
  }

  const detail = {
    statusMessage: extra.statusMessage || undefined,

    actionDetails: {
      app: "backoffice",
      module: "inventory_ingredients",
      actionType,
      ...(extra.actionDetails || {}),
      ...(changes ? { changes } : {}),
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    },

    affectedData: {
      items,
      // For ingredients we don't tie into AUTH_STATUS_LEGEND → keep "NONE"
      statusChange: "NONE",
    },

    meta: {
      app: "backoffice",
      userId: user?.id ?? null,
      username: user?.username || null,
      role,
      ip: req?.ip,
      userAgent: req?.headers?.["user-agent"] || "",
    },
  };

  await db.query(
    `INSERT INTO audit_trail (employee, role, action, detail)
     VALUES (?, ?, ?, ?)`,
    [employee, role, action, JSON.stringify(detail)]
  );
}

/** Safe wrapper – never break API if audit logging fails. */
async function logInventoryIngredientAuditSafe(db, req, payload) {
  try {
    await logInventoryIngredientAudit(db, req, payload);
  } catch (err) {
    console.error("[ingredients] failed to write audit trail:", err);
  }
}

/* ============================================================
   MAIN ROUTER
   ============================================================ */

const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

const KIND_ALLOWED = new Set(["ingredient", "product"]);
const normalizeKind = (v) => {
  const k = String(v ?? "").trim().toLowerCase();
  return KIND_ALLOWED.has(k) ? k : null;
};

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  router.use(requireAuth);  

  const UNIT_ALLOWED = new Set(["pack", "pcs"]);
  const SAMPLE_LIMIT = 6;

  // near the top
  const LOW_STOCK_MIN_RATIO_CRITICAL = 0.25;

  const convertStockOnUnitChange = (value, from, to) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return n;
  };

  // GET /api/inventory/ingredients/low-stock
  router.get("/low-stock", async (req, res) => {
    try {
      const { category, limit } = req.query;

      // allow: ingredient | product | all
      const rawKind = String(req.query.kind ?? "").trim().toLowerCase();
      const kind =
        rawKind === "all" ? "all" : (normalizeKind(rawKind) || "ingredient");

      const L = Math.min(Number(limit) || 50, 200);

      const params = [];
      let where = `
        lowStock > 0
        AND currentStock > 0
        AND currentStock <= lowStock
      `;

      // only filter by kind when NOT "all"
      if (kind !== "all") {
        where = `kind = ? AND ` + where;
        params.push(kind);
      }

      if (category) {
        where += " AND LOWER(category) = ?";
        params.push(String(category).toLowerCase());
      }

      const rows = await db.query(
        `
        SELECT id, name, kind, category, type, currentStock, lowStock, updatedAt
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
          kind: r.kind || "ingredient",
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
      res
        .status(500)
        .json({ ok: false, error: e?.message || "Low stock query failed" });
    }
  });

  // GET /api/inventory/ingredients  (newest first)
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, name, kind, category, type, currentStock, lowStock, createdAt, updatedAt
           FROM inventory_ingredients
          ORDER BY updatedAt DESC, createdAt DESC, name ASC`
      );

      const ingredients = rows.map((r) => ({
        id: String(r.id),
        name: r.name,
        kind: r.kind || "ingredient",
        category: r.category,
        type: r.type || "",
        currentStock: Number(r.currentStock || 0),
        lowStock: Number(r.lowStock || 0),
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

  // Helper: check if an inventory id is used inside item recipes (stockMode=ingredients)
  async function ingredientUsage(ingredientId) {
    const idStr = String(ingredientId || "").trim();
    const idNum = Number(ingredientId);

    if (!idStr) return [];

    const params = [];
    let whereJson = "";

    // Match numeric ingredientId (5)
    if (Number.isFinite(idNum)) {
      whereJson += `
        JSON_CONTAINS(
          JSON_EXTRACT(ingredients, '$[*].ingredientId'),
          CAST(? AS JSON)
        )
      `;
      params.push(idNum);
    }

    // Match string ingredientId ("5") — covers older/bad data
    whereJson += (whereJson ? " OR " : "") + `
      JSON_CONTAINS(
        JSON_EXTRACT(ingredients, '$[*].ingredientId'),
        JSON_QUOTE(?)
      )
    `;
    params.push(idStr);

    const rows = await db.query(
      `
      SELECT id, name
      FROM items
      WHERE (stockMode IS NULL OR stockMode = 'ingredients')
        AND (${whereJson})
      LIMIT 5
      `,
      params
    );

    return rows || [];
  }

  async function directUsage(inventoryId) {
    const idNum = Number(inventoryId);
    if (!Number.isFinite(idNum)) return [];
    const rows = await db.query(
      `SELECT id, name
        FROM items
        WHERE stockMode = 'direct'
          AND inventoryIngredientId = ?
        LIMIT 5`,
      [idNum]
    );
    return rows || [];
  }

  // GET /api/inventory/ingredients/:id/usage
  router.get("/:id/usage", async (req, res) => {
    try {
      const ingredientId = String(req.params.id || "");
      if (!ingredientId) {
        return res.json({ ok: true, isUsed: false, usedInItems: [] });
      }

      const usedRecipe = await ingredientUsage(ingredientId);
      const usedDirect = await directUsage(ingredientId);

      const usedInItems = [
        ...new Set([
          ...usedRecipe.map((r) => r.name || "Unnamed Item"),
          ...usedDirect.map((r) => r.name || "Unnamed Item"),
        ]),
      ];

      const isUsed = usedInItems.length > 0;

      return res.json({
        ok: true,
        isUsed,
        usedInItems,
        usedRecipeCount: usedRecipe.length,
        usedDirectCount: usedDirect.length,
      });
    } catch (e) {
      console.error("[ingredients] usage check failed:", e);
      return res
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
      const kind = normalizeKind(req.body?.kind) || "ingredient";

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

      const now = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
      );
      const result = await db.query(
        `INSERT INTO inventory_ingredients
          (name, kind, category, type, currentStock, lowStock, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
        [name, kind, category, type, now, now]
      );

      const newId = result.insertId;

      // Fetch full row for audit detail
      const createdRows = await db.query(
        `SELECT * FROM inventory_ingredients WHERE id = ? LIMIT 1`,
        [newId]
      );
      const created = createdRows[0] || null;

      const statusMessage = created
        ? `Ingredient "${created.name}" created.`
        : "Ingredient created.";

      await logInventoryIngredientAuditSafe(db, req, {
        action: "Inventory - Ingredient Created",
        actionType: "create",
        ingredient: created,
        extra: {
          statusMessage,
          actionDetails: created
            ? {
                ingredientId: String(created.id),
                name: created.name,
                category: created.category,
                type: created.type,
              }
            : undefined,
        },
      });

      res.status(201).json({ ok: true, id: String(newId) });
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

      // Fetch "before" snapshot for audit
      const beforeRows = await db.query(
        `SELECT * FROM inventory_ingredients WHERE id = ? LIMIT 1`,
        [id]
      );
      const before = beforeRows[0] || null;
      if (!before) {
        return res.status(404).json({ ok: false, error: "not found" });
      }

      const u = {};
      let incomingType = undefined;

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

      if (req.body?.kind !== undefined) {
        const k = normalizeKind(req.body.kind);
        if (!k) {
          return res.status(400).json({ ok: false, error: "kind must be 'ingredient' or 'product'." });
        }

        // needs directUsage() to be INSIDE module.exports so it can use db
        if ((before.kind || "ingredient") !== k && k === "product") {
          const usedInRecipe = await ingredientUsage(String(id));
          if (usedInRecipe.length) {
            return res.status(409).json({
              ok: false,
              error: "Cannot set kind='product' because this inventory record is used in item recipes.",
              reason: "recipe-linked",
              sample: [...new Set(usedInRecipe.map(r => r.name || "Unnamed Item"))].slice(0, 5),
            });
          }
        }

        if ((before.kind || "ingredient") !== k && k === "ingredient") {
          const usedDirect = await directUsage(id);
          if (usedDirect.length) {
            return res.status(409).json({
              ok: false,
              error: "Cannot set kind='ingredient' because this inventory record is linked to items in Direct mode.",
              reason: "direct-linked",
              sample: [...new Set(usedDirect.map(r => r.name || "Unnamed Item"))].slice(0, 5),
            });
          }
        }

        u.kind = k;
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
        incomingType = t;
      }

      // currentStock
      const userSentCurrentStock = req.body?.currentStock !== undefined;
      if (userSentCurrentStock) {
        const n = Number(req.body.currentStock);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({
            ok: false,
            error: "currentStock must be a non-negative number",
          });
        }
        u.currentStock = n;
      }

      // lowStock
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

      // SCALE LOGIC: convert currentStock if unit changed, but user did NOT override stock
      if (incomingType !== undefined && !userSentCurrentStock) {
        u.currentStock = convertStockOnUnitChange(
          before.currentStock,
          before.type,
          incomingType
        );
      }

      // Build update query
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

      // Fetch "after" snapshot
      const afterRows = await db.query(
        `SELECT * FROM inventory_ingredients WHERE id = ? LIMIT 1`,
        [id]
      );
      const after = afterRows[0] || null;

      // Compute field-level changes for audit
      const fieldsToCompare = [
        "name",
        "kind",
        "category",
        "type",
        "currentStock",
        "lowStock",
      ];
      const changes = {};
      for (const field of fieldsToCompare) {
        const beforeVal = before[field];
        const afterVal = after ? after[field] : undefined;
        if (String(beforeVal) !== String(afterVal)) {
          changes[field] = {
            before: beforeVal,
            after: afterVal,
          };
        }
      }

      const changedKeys = Object.keys(changes);
      const targetName = (after && after.name) || before.name;

      // 🔹 We only want this route to log **metadata** edits
      //    (name, category, unit, lowStock). Stock movements are
      //    logged exclusively by inv-activity.js.
      const META_FIELDS = ["name", "kind", "category", "type", "lowStock"];
      const metaChangedKeys = changedKeys.filter((k) =>
        META_FIELDS.includes(k)
      );

      // If only stock changed → skip audit log to avoid duplicates.
      if (!metaChangedKeys.length) {
        return res.json({ ok: true, message: "Ingredient updated successfully" });
      }

      // Build status message only from metadata fields
      let statusMessage;
      if (metaChangedKeys.length) {
        statusMessage = `Ingredient "${targetName}" updated (${metaChangedKeys.join(
          ", "
        )}).`;
      } else {
        statusMessage = `Ingredient "${targetName}" updated.`;
      }

      // Single generic metadata-update log
      await logInventoryIngredientAuditSafe(db, req, {
        action: "Inventory - Ingredient Updated",
        actionType: "update",
        ingredient: after,
        before,
        after,
        changes,
        extra: {
          statusMessage,
          actionDetails: {
            ingredientId: String(after.id),
          },
        },
      });

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

      // Fetch row for logging (before delete)
      const rows = await db.query(
        `SELECT * FROM inventory_ingredients WHERE id = ? LIMIT 1`,
        [id]
      );
      const ingredientRow = rows[0] || null;
      if (!ingredientRow) {
        return res.status(404).json({ ok: false, error: "not found" });
      }

      const currentStock = Number(ingredientRow.currentStock || 0);

      // (1) Check if used in menu items (recipe JSON)
      const usedIn = await ingredientUsage(String(id));
      if (usedIn.length) {
        const names = [...new Set(usedIn.map((r) => r.name || "Unnamed Item"))];
        return res.status(409).json({
          ok: false,
          error: `Cannot delete ingredient: It is currently used in menu items (${names.join(", ")}).`,
          reason: "item-linked",
          sample: names.slice(0, 5),
        });
      }

      // (1b) Check if used as DIRECT inventory link
      const usedDirect = await directUsage(id);
      if (usedDirect.length) {
        const names = [...new Set(usedDirect.map((r) => r.name || "Unnamed Item"))];
        return res.status(409).json({
          ok: false,
          error: `Cannot delete inventory record: It is linked to items in Direct mode (${names.join(", ")}).`,
          reason: "direct-linked",
          sample: names.slice(0, 5),
        });
      }

      // (2) Check inventory_activity logs ONLY IF it still has stock
      const activityRows = await db.query(
        `SELECT id, reason FROM inventory_activity WHERE ingredientId = ? LIMIT 5`,
        [id]
      );
      
      const hasActivity = activityRows.length > 0;
      if (hasActivity && currentStock > 0) {
        const reasons = activityRows.map(
          (a) => a.reason || `Activity #${a.id}`
        );
        return res.status(409).json({
          ok: false,
          reason: "activity-linked",
          error: "Cannot delete inventory item because it still has stock.",
          activityCount: activityRows.length,
          hasStock: currentStock > 0,
        });
      }

      // OPTIONAL: if you want to "detach" old activity logs from this ingredient
      // but keep history, you can null the ingredientId:
      //
      // if (hasActivity && currentStock <= 0) {
      //   await db.query(
      //     `UPDATE inventory_activity SET ingredientId = NULL WHERE ingredientId = ?`,
      //     [id]
      //   );
      // }

      await db.query(`DELETE FROM inventory_ingredients WHERE id = ?`, [id]);

      const statusMessage = ingredientRow
        ? `Ingredient "${ingredientRow.name}" deleted.`
        : `Ingredient with id ${id} deleted.`;

      await logInventoryIngredientAuditSafe(db, req, {
        action: "Inventory - Ingredient Deleted",
        actionType: "delete",
        ingredient: ingredientRow || { id },
        extra: {
          statusMessage,
          actionDetails: {
            ingredientId: String(id),
          },
        },
      });

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
   * Deletes ingredients only if:
   *   - not used in menu items
   *   - AND (no activity OR has activity but currentStock = 0)
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

      /** Load ingredient rows */
      const ingRows = await db.query(
        `SELECT * FROM inventory_ingredients WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
      );

      // Map { id → ingredient row }
      const ingMap = new Map();
      for (const r of ingRows) {
        ingMap.set(Number(r.id), r);
      }

      /** Preload activity counts */
      const actMap = await activityCountsMap(db, ids);

      const finalDeletable = [];
      const blocked = [];

      for (const id of ids) {
        const ingredient = ingMap.get(id);
        if (!ingredient) {
          blocked.push({
            id: String(id),
            reason: "not-found",
            count: 0,
            sample: [],
          });
          continue;
        }

        const currentStock = Number(ingredient.currentStock || 0);
        const actN = actMap.get(id) || 0;

        /** 1) Block if used in menu items */
        const usedIn = await ingredientUsage(String(id));
        if (usedIn.length) {
          blocked.push({
            id: String(id),
            reason: "item-linked",
            count: usedIn.length,
            sample: [...new Set(usedIn.map((r) => r.name || "Unnamed Item"))].slice(0, SAMPLE_LIMIT),
          });
          continue;
        }

        const usedDirect = await directUsage(id);
        if (usedDirect.length) {
          blocked.push({
            id: String(id),
            reason: "direct-linked",
            count: usedDirect.length,
            sample: [...new Set(usedDirect.map((r) => r.name || "Unnamed Item"))].slice(0, SAMPLE_LIMIT),
          });
          continue;
        }

        /** 2) Block only if it has activity AND stock > 0 */
        if (actN > 0 && currentStock > 0) {
          blocked.push({
            id: String(id),
            reason: "activity-linked",
            count: actN,
            sample: [],
          });
          continue;
        }

        /** If no activity OR activity exists but stock is zero → OK */
        finalDeletable.push(id);
      }

      /** Fetch rows to log */
      let deletedRows = [];
      if (finalDeletable.length) {
        const rows = await db.query(
          `SELECT * FROM inventory_ingredients WHERE id IN (${finalDeletable.map(() => "?").join(",")})`,
          finalDeletable
        );
        deletedRows = rows || [];
      }

      /** Delete ingredients */
      if (finalDeletable.length) {
        await db.query(
          `DELETE FROM inventory_ingredients WHERE id IN (${finalDeletable.map(() => "?").join(",")})`,
          finalDeletable
        );
      }

      /** Write audit log only if something was deleted */
      if (finalDeletable.length > 0) {
        const statusMessage = `Deleted ${finalDeletable.length} ingredient(s).`;

        await logInventoryIngredientAuditSafe(db, req, {
          action: "Inventory - Ingredients Bulk Deleted",
          actionType: "bulkDelete",
          ingredients: deletedRows,
          extra: {
            statusMessage,
            actionDetails: {
              count: finalDeletable.length,
              ids: finalDeletable.map(String),
              blocked,
            },
          },
        });
      }

      return res.json({
        ok: true,
        deleted: finalDeletable.length,
        blocked,
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