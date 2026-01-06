// QUSCINA_BACKOFFICE/Backend/src/routes/Items/items.js
const express = require("express");
const multer = require("multer");

const { requireAuth } = require("../../auth/requireAuth");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch {
  /* ignore until DI provides db */
}

// Multer in-memory; we'll convert to base64 and store in MySQL LONGTEXT
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB req cap
});

/* ============================================================
   COMMON HELPERS
   ============================================================ */

const ITEM_FIELD_LABELS = {
  name: "name",
  description: "description",
  categoryId: "category",
  categoryName: "category",
  price: "price",
  stockMode: "stock mode",
  inventoryIngredientId: "inventory link",
  inventoryDeductQty: "deduct qty",
  active: "active",
};

function summarizeItemChangedFields(changedKeys = []) {
  const labels = [];
  for (const key of changedKeys) {
    const label = ITEM_FIELD_LABELS[key];
    if (!label) continue;
    if (!labels.includes(label)) labels.push(label);
  }
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return labels.join(", ");
}

function bufferToDataUrl(buffer, mime) {
  const b64 = buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}

const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

// Keep raw image ≤ ~600 KB
const MAX_RAW_IMAGE_BYTES = 600 * 1024;

function cleanMoney(x) {
  if (x == null) return 0;
  return Number(String(x).replace(/[^0-9.]/g, "")) || 0;
}

function cleanDecimalQty(x, fallback = 1.0) {
  if (x == null || x === "") return fallback;
  const n = Number(String(x).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return fallback;
  // 3 dp like your schema, but keep as Number here
  return n;
}

function parseJsonArrayMaybe(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

function unwrapRows(q) {
  // mysql2/promise returns [rows, fields]
  if (Array.isArray(q) && Array.isArray(q[0])) return q[0];
  return q; // already rows
}

async function getInventoryRow(db, id) {
  const q = await db.query(
    `SELECT id, name, inventory_type_id, currentStock
       FROM inventory_ingredients
      WHERE id = ?
      LIMIT 1`,
    [id]
  );
  const rows = unwrapRows(q);
  return rows?.[0] || null;
}

function cleanDirectProducts(raw) {
  const arr = parseJsonArrayMaybe(raw);

  return arr
    .map((r) => ({
      inventoryIngredientId: Number(r?.inventoryIngredientId || r?.id || 0),
      name: normalize(r?.name),
      qty: cleanDecimalQty(r?.qty, 0),
    }))
    .filter((r) => Number.isFinite(r.inventoryIngredientId) && r.inventoryIngredientId > 0 && r.qty > 0);
}

/**
 * Enforce Option 2 rules for stockMode.
 * - ingredients: must have recipe (>=1 ingredient row)
 * - direct: must have inventoryIngredientId and (optionally) kind='product'
 * - none/manual: clear inventory link + reset deduct qty
 *
 * Returns normalized fields ready for INSERT/UPDATE:
 * { stockMode, inventoryIngredientId, inventoryDeductQty, ingredients }
 */
function deriveStockMode(ingredients, directProducts) {
  const hasIng = Array.isArray(ingredients) && ingredients.length > 0;
  const hasDirect = Array.isArray(directProducts) && directProducts.length > 0;

  if (hasIng && hasDirect) return "hybrid";
  if (hasIng) return "ingredients";
  if (hasDirect) return "direct";
  return "none";
}

async function validateAndNormalizeStockFields(db, input) {
  // Normalize recipe ingredients
  const rawIngredients = parseJsonArrayMaybe(input.ingredients);
  const ingredients = rawIngredients
    .map((r) => ({
      ingredientId: String(r?.ingredientId ?? "").trim(),
      name: normalize(r?.name),
      category: normalize(r?.category),
      unit: normalize(r?.unit),
      qty: cleanDecimalQty(r?.qty, 0),
    }))
    .filter((r) => r.ingredientId && r.qty > 0);

  // ✅ NEW: directProducts array (preferred)
  let directProducts = cleanDirectProducts(input.directProducts);

  // ✅ BACKWARD COMPAT (optional):
  // if no directProducts provided but old fields exist, convert to array
  if ((!directProducts || directProducts.length === 0) && input.inventoryIngredientId) {
    const idNum = Number(input.inventoryIngredientId);
    const dq = cleanDecimalQty(input.inventoryDeductQty, 1.0);
    if (Number.isFinite(idNum) && idNum > 0 && dq > 0) {
      directProducts = [{ inventoryIngredientId: idNum, name: "", qty: dq }];
    }
  }

  // Validate each direct product is Product type (inventory_type_id = 2)
  for (const dp of directProducts) {
    if (dp.qty <= 0) throw new Error("Direct product qty must be greater than 0.");
    if (dp.qty > 999999999.999) throw new Error("Direct product qty is too large.");

    const inv = await getInventoryRow(db, dp.inventoryIngredientId);
    if (!inv) throw new Error("Selected inventory product does not exist.");
    if (Number(inv.inventory_type_id || 1) !== 2) {
      throw new Error("Direct inventory link can only use inventory items marked as Product.");
    }

    // fill name if missing
    if (!dp.name) dp.name = inv.name || "";
  }

  // Keep your rule: must have at least one source
  if (!ingredients.length && !directProducts.length) {
    throw new Error("Item must have at least one stock source (ingredients or direct inventory).");
  }

  const stockMode = deriveStockMode(ingredients, directProducts);

  return { stockMode, ingredients, directProducts };
}

/* ============================================================
   AUDIT HELPERS
   ============================================================ */

function getAuditUserFromReq(req) {
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

function mapItemForAudit(row) {
  if (!row) return null;

  let ingredientsCount = 0;
  try {
    const raw =
      typeof row.ingredients === "string"
        ? JSON.parse(row.ingredients || "[]")
        : row.ingredients || [];
    if (Array.isArray(raw)) ingredientsCount = raw.length;
  } catch {}

  return {
    id: String(row.id),
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    price: Number(row.price || 0),
    stockMode: row.stockMode || "ingredients",
    inventoryIngredientId: row.inventoryIngredientId != null ? Number(row.inventoryIngredientId) : null,
    inventoryDeductQty: row.inventoryDeductQty != null ? Number(row.inventoryDeductQty) : 1,
    ingredientsCount,
  };
}

async function logItemsAudit(db, req, payload) {
  const {
    action,
    actionType,
    item,
    items,
    before,
    after,
    changes,
    extra = {},
  } = payload;

  const user = getAuditUserFromReq(req);
  const employee = user?.employeeName || "System";
  const role = user?.role || "—";

  const affectedItems = [];
  const single = mapItemForAudit(item);
  if (single) affectedItems.push(single);

  if (Array.isArray(items)) {
    for (const r of items) {
      const mapped = mapItemForAudit(r);
      if (mapped) affectedItems.push(mapped);
    }
  }

  const detail = {
    statusMessage: extra.statusMessage || undefined,

    actionDetails: {
      app: "backoffice",
      module: "items",
      actionType,
      ...(extra.actionDetails || {}),
      ...(changes ? { changes } : {}),
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    },

    affectedData: {
      items: affectedItems,
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

async function logItemsAuditSafe(db, req, payload) {
  try {
    await logItemsAudit(db, req, payload);
  } catch (err) {
    console.error("[items] failed to write audit trail:", err);
  }
}

/* ============================================================
   ROUTER
   ============================================================ */

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  router.use(express.json());
  router.use(requireAuth);

  /* ===================== GET /api/items ===================== */
  router.get("/", async (req, res, next) => {
    try {
      const categoryId = String(req.query.categoryId || "").trim();
      const categoryKey = String(req.query.category || "all")
        .trim()
        .toLowerCase();

      let sql = `SELECT id, name, description, categoryId, categoryName, categoryKey, imageDataUrl,
                        createdAt, updatedAt, price, ingredients, directProducts,
                        stockMode, inventoryIngredientId, inventoryDeductQty,
                        active
                   FROM items`;
      const params = [];
      const where = [];

      if (categoryId) {
        where.push("categoryId = ?");
        params.push(Number(categoryId));
      } else if (categoryKey && categoryKey !== "all") {
        where.push("categoryKey = ?");
        params.push(categoryKey);
      }

      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY updatedAt DESC, nameLower ASC";
      const q = await db.query(sql, params);
      const rows = unwrapRows(q);

      const items = rows.map((x) => {
        const parsedIngredients =
          typeof x.ingredients === "string"
            ? JSON.parse(x.ingredients || "[]")
            : x.ingredients || [];

        const normalizedIngredients = Array.isArray(parsedIngredients)
          ? parsedIngredients.map((r) => ({
              ...r,
              ingredientId: String(r?.ingredientId ?? "").trim(),
            }))
          : [];

        return {
          id: String(x.id),
          name: x.name || "",
          description: x.description || "",
          categoryId: x.categoryId || "",
          categoryName: x.categoryName || "",
          imageUrl: x.imageDataUrl || "",
          createdAt: x.createdAt ? new Date(x.createdAt).getTime() : 0,
          updatedAt: x.updatedAt ? new Date(x.updatedAt).getTime() : 0,
          price: Number(x.price || 0),
          ingredients: normalizedIngredients,
          stockMode: x.stockMode || "ingredients",
          directProducts:
            typeof x.directProducts === "string"
              ? JSON.parse(x.directProducts || "[]")
              : x.directProducts || [],
          inventoryIngredientId:
            x.inventoryIngredientId != null ? String(x.inventoryIngredientId) : "",
          inventoryDeductQty: Number(x.inventoryDeductQty || 1),
          active: Number(x.active || 0) ? 1 : 0,
        };
      });

      res.json({ ok: true, items });
    } catch (e) {
      next(e);
    }
  });

  /* ===================== GET /api/items/:id ===================== */
  router.get("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }

      const q = await db.query(
        `SELECT id, name, description, categoryId, categoryName, categoryKey, imageDataUrl,
                createdAt, updatedAt, price, ingredients, directProducts,
                stockMode, inventoryIngredientId, inventoryDeductQty,
                active
          FROM items
          WHERE id = ?
          LIMIT 1`,
        [id]
      );

      const rows = unwrapRows(q);
      const x = rows?.[0];
      if (!x) return res.status(404).json({ ok: false, error: "not found" });

      const item = {
        id: String(x.id),
        name: x.name || "",
        description: x.description || "",
        categoryId: x.categoryId || "",
        categoryName: x.categoryName || "",
        imageUrl: x.imageDataUrl || "",
        createdAt: x.createdAt ? new Date(x.createdAt).getTime() : 0,
        updatedAt: x.updatedAt ? new Date(x.updatedAt).getTime() : 0,
        price: Number(x.price || 0),
        ingredients:
          typeof x.ingredients === "string"
            ? JSON.parse(x.ingredients || "[]")
            : x.ingredients || [],
        directProducts:
          typeof x.directProducts === "string"
            ? JSON.parse(x.directProducts || "[]")
            : x.directProducts || [],
        stockMode: x.stockMode || "ingredients",
        inventoryIngredientId: x.inventoryIngredientId != null ? String(x.inventoryIngredientId) : "",
        inventoryDeductQty: Number(x.inventoryDeductQty || 1),
        active: Number(x.active || 0) ? 1 : 0,
      };

      res.json({ ok: true, item });
    } catch (e) {
      next(e);
    }
  });

  /* ===================== POST /api/items ===================== */
  router.post("/", upload.single("image"), async (req, res, next) => {
    try {
      const b = req.body || {};

      const name = normalize(b.name);
      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid item name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }

      // Category required
      const rawCategoryId = Number(b.categoryId);
      const categoryId =
        Number.isFinite(rawCategoryId) && rawCategoryId > 0
          ? rawCategoryId
          : null;
      const categoryName = normalize(b.categoryName);
      if (!categoryId || !categoryName) {
        return res.status(400).json({ ok: false, error: "Category is required." });
      }
      if (!isValidName(categoryName)) {
        return res.status(400).json({ ok: false, error: "Invalid category name." });
      }
      const categoryKey = categoryName.toLowerCase();

      const description = String(b.description || "").trim().slice(0, 300);
      const price = cleanMoney(b.price);

      // ✅ Stock normalization (Option 2)
      const norm = await validateAndNormalizeStockFields(db, {
        ingredients: b.ingredients,
        directProducts: b.directProducts,
        inventoryIngredientId: b.inventoryIngredientId,
        inventoryDeductQty: b.inventoryDeductQty,
      });

      const now = new Date();

      // derive legacy single link for backward compat (first direct product)
      const legacyInvId = norm.directProducts?.[0]?.inventoryIngredientId
        ? Number(norm.directProducts[0].inventoryIngredientId)
        : null;

      const legacyDeductQty = norm.directProducts?.[0]?.qty
        ? Number(norm.directProducts[0].qty)
        : null;

      const result = await db.query(
        `INSERT INTO items
          (name, description, categoryId, categoryName, categoryKey,
          imageDataUrl, price, ingredients, directProducts,
          stockMode, inventoryIngredientId, inventoryDeductQty,
          costOverall, profit, active, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, '', ?, ?, ?,
                ?, ?, ?,
                0, 0, 1, ?, ?)`,
        [
          name,
          description,
          categoryId,
          categoryName,
          categoryKey,
          price,
          JSON.stringify(norm.ingredients || []),
          JSON.stringify(norm.directProducts || []),
          norm.stockMode,
          legacyInvId,
          legacyDeductQty,
          now,
          now,
        ]
      );

      const ok = Array.isArray(result) ? result[0] : result;
      const id = ok?.insertId;

      // optional image
      let imageUrl = "";
      if (req.file && req.file.buffer && req.file.mimetype) {
        const raw = req.file.buffer;
        if (raw.length > MAX_RAW_IMAGE_BYTES) {
          return res.status(413).json({
            ok: false,
            error: "Image too large. Please upload ≤ 600 KB.",
          });
        }
        const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
        await db.query(
          `UPDATE items SET imageDataUrl = ?, updatedAt = ? WHERE id = ?`,
          [dataUrl, new Date(), id]
        );
        imageUrl = dataUrl;
      }

      const createdQ = await db.query(
        `SELECT * FROM items WHERE id = ? LIMIT 1`,
        [id]
      );
      const createdRows = unwrapRows(createdQ);
      const created = createdRows?.[0] || null;

      await logItemsAuditSafe(db, req, {
        action: "Item Created",
        actionType: "create",
        item: created || { id },
        extra: {
          statusMessage: created ? `Item "${created.name}" created.` : "Item created.",
          actionDetails: created
            ? {
                itemId: String(created.id),
                name: created.name,
                categoryId: created.categoryId,
                categoryName: created.categoryName,
                price: created.price,
                stockMode: created.stockMode,
                inventoryIngredientId: created.inventoryIngredientId,
                inventoryDeductQty: created.inventoryDeductQty,
              }
            : { itemId: String(id) },
        },
      });

      res.status(201).json({ ok: true, id: String(id), imageUrl });
    } catch (e) {
      if (e?.message) {
        // validation-style errors
        if (
          /stockMode=ingredients requires|stockMode=direct requires|Direct stock mode|Selected inventory item does not exist|inventoryDeductQty/i.test(
            e.message
          )
        ) {
          return res.status(400).json({ ok: false, error: e.message });
        }
      }

      if (
        e?.code === "ER_DUP_ENTRY" &&
        /uq_items_name_lower/i.test(e?.message || "")
      ) {
        return res.status(409).json({
          ok: false,
          code: "name_taken",
          error:
            "That item name already exists. Names are not case-sensitive. Try a different name.",
        });
      }
      next(e);
    }
  });

  /* ===================== PATCH /api/items/:id ===================== */
  router.patch("/:id", upload.single("image"), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res.status(400).json({ ok: false, error: "invalid id" });

      const beforeQ = await db.query(`SELECT * FROM items WHERE id = ? LIMIT 1`, [id]);
      const beforeRows = unwrapRows(beforeQ);
      const before = beforeRows?.[0] || null;

      if (!before) {
        return res.status(404).json({ ok: false, error: "not found" });
      }

      const b = req.body || {};
      const sets = ["updatedAt = ?"];
      const params = [new Date()];

      // track if stock-related fields were touched so we can normalize
      const touchingStock =
        Object.prototype.hasOwnProperty.call(b, "directProducts") ||
        Object.prototype.hasOwnProperty.call(b, "inventoryIngredientId") ||
        Object.prototype.hasOwnProperty.call(b, "inventoryDeductQty") ||
        Object.prototype.hasOwnProperty.call(b, "ingredients");

      if (typeof b.name === "string") {
        const n = normalize(b.name);
        if (!isValidName(n)) {
          return res.status(400).json({
            ok: false,
            error:
              "Invalid item name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
          });
        }
        sets.push("name = ?");
        params.push(n);
      }

      if (typeof b.description === "string") {
        const desc = String(b.description).trim().slice(0, 300);
        sets.push("description = ?");
        params.push(desc);
      }

      const touchingCatId = Object.prototype.hasOwnProperty.call(b, "categoryId");
      const touchingCatName = Object.prototype.hasOwnProperty.call(b, "categoryName");
      if (touchingCatId || touchingCatName) {
        const rawCategoryId = Number(b.categoryId);
        const categoryId =
          Number.isFinite(rawCategoryId) && rawCategoryId > 0
            ? rawCategoryId
            : null;
        const categoryName = normalize(b.categoryName);

        if (!categoryId || !categoryName) {
          return res.status(400).json({ ok: false, error: "Category is required." });
        }
        if (!isValidName(categoryName)) {
          return res.status(400).json({ ok: false, error: "Invalid category name." });
        }

        sets.push("categoryId = ?", "categoryName = ?", "categoryKey = ?");
        params.push(categoryId, categoryName, categoryName.toLowerCase());
      }

      if (typeof b.price !== "undefined") {
        const price = cleanMoney(b.price);
        sets.push("price = ?");
        params.push(price);
      }

      // ✅ Stock normalization if any related field touched
      if (touchingStock) {
        // Use incoming values if present, otherwise fallback to existing row
          const incoming = {
            directProducts:
              Object.prototype.hasOwnProperty.call(b, "directProducts")
                ? b.directProducts
                : before.directProducts,
            ingredients:
              Object.prototype.hasOwnProperty.call(b, "ingredients")
                ? b.ingredients
                : before.ingredients,
            inventoryIngredientId:
              Object.prototype.hasOwnProperty.call(b, "inventoryIngredientId")
                ? b.inventoryIngredientId
                : before.inventoryIngredientId,
            inventoryDeductQty:
              Object.prototype.hasOwnProperty.call(b, "inventoryDeductQty")
                ? b.inventoryDeductQty
                : before.inventoryDeductQty,
          };

        const norm = await validateAndNormalizeStockFields(db, incoming);

        const legacyInvId = norm.directProducts?.[0]?.inventoryIngredientId
          ? Number(norm.directProducts[0].inventoryIngredientId)
          : null;

        const legacyDeductQty = norm.directProducts?.[0]?.qty
          ? Number(norm.directProducts[0].qty)
          : null;

        sets.push(
          "stockMode = ?",
          "directProducts = ?",
          "ingredients = ?",
          "inventoryIngredientId = ?",
          "inventoryDeductQty = ?"
        );

        params.push(
          norm.stockMode,
          JSON.stringify(norm.directProducts || []),
          JSON.stringify(norm.ingredients || []),
          legacyInvId,
          legacyDeductQty
        );
      } else {
        // If ingredients came alone (shouldn't), keep old behavior: ignore
        // (touchingStock covers it)
      }

      if (req.file && req.file.buffer && req.file.mimetype) {
        const raw = req.file.buffer;
        if (raw.length > MAX_RAW_IMAGE_BYTES) {
          return res.status(413).json({
            ok: false,
            error: "Image too large. Please upload ≤ 600 KB.",
          });
        }
        const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
        sets.push("imageDataUrl = ?");
        params.push(dataUrl);
      }

      if (sets.length === 1) {
        return res.status(400).json({ ok: false, error: "no changes" });
      }

      params.push(id);
      await db.query(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`, params);

      // category safety
      if (!touchingCatId && !touchingCatName) {
        const chkQ = await db.query(`SELECT categoryId, categoryName FROM items WHERE id = ?`, [id]);
        const chkRows = unwrapRows(chkQ);
        const row = chkRows?.[0];
        if (!row || !row.categoryId || !row.categoryName) {
          return res.status(409).json({ ok: false, error: "Item must have a category." });
        }
      }

      const afterQ = await db.query(`SELECT * FROM items WHERE id = ? LIMIT 1`, [id]);
      const afterRows = unwrapRows(afterQ);
      const after = afterRows?.[0] || null;

      const fieldsToCompare = [
        "name",
        "description",
        "categoryId",
        "categoryName",
        "price",
        "stockMode",
        "inventoryIngredientId",
        "inventoryDeductQty",
        "active",
      ];
      const changes = {};
      for (const field of fieldsToCompare) {
        const beforeVal = before[field];
        const afterVal = after ? after[field] : undefined;
        if (String(beforeVal) !== String(afterVal)) {
          changes[field] = { before: beforeVal, after: afterVal };
        }
      }

      const changedKeys = Object.keys(changes);
      const targetName = (after && after.name) || before.name;
      const friendlyFields = summarizeItemChangedFields(changedKeys);

      await logItemsAuditSafe(db, req, {
        action: "Item Updated",
        actionType: "update",
        item: after || before,
        before,
        after,
        changes: changedKeys.length ? changes : undefined,
        extra: {
          statusMessage: friendlyFields
            ? `Item "${targetName}" updated (${friendlyFields}).`
            : `Item "${targetName}" updated.`,
          actionDetails: {
            itemId: String(before.id),
            name: targetName,
            changedFields: friendlyFields || undefined,
          },
        },
      });

      res.json({ ok: true });
    } catch (e) {
      if (e?.message) {
        if (
          /stockMode=ingredients requires|stockMode=direct requires|Direct stock mode|Selected inventory item does not exist|inventoryDeductQty/i.test(
            e.message
          )
        ) {
          return res.status(400).json({ ok: false, error: e.message });
        }
      }

      if (
        e?.code === "ER_DUP_ENTRY" &&
        /uq_items_name_lower/i.test(e?.message || "")
      ) {
        return res.status(409).json({
          ok: false,
          code: "name_taken",
          error:
            "That item name already exists. Names are not case-sensitive. Try a different name.",
        });
      }
      next(e);
    }
  });

  /* ===================== DELETE /api/items (bulk) ===================== */
  router.delete("/", async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((x) => Number(x)).filter(Number.isFinite)
        : [];
      if (!ids.length)
        return res.status(400).json({ ok: false, error: "ids is required" });

      const placeholders = ids.map(() => "?").join(",");

      const existingQ = await db.query(
        `SELECT * FROM items WHERE id IN (${placeholders})`,
        ids
      );
      const existingRows = unwrapRows(existingQ);

      await db.query(`DELETE FROM items WHERE id IN (${placeholders})`, ids);

      await logItemsAuditSafe(db, req, {
        action: "Items Bulk Deleted",
        actionType: "bulk-delete",
        items: existingRows || [],
        extra: {
          statusMessage: `Deleted ${ids.length} item(s).`,
          actionDetails: {
            ids,
            deleted: (existingRows || []).map((r) => ({ id: String(r.id), name: r.name })) || [],
          },
        },
      });

      res.json({ ok: true, deleted: ids.length });
    } catch (e) {
      next(e);
    }
  });

  /* ===================== DELETE /api/items/:id ===================== */
  router.delete("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res.status(400).json({ ok: false, error: "id is required" });

      const q = await db.query(`SELECT * FROM items WHERE id = ? LIMIT 1`, [id]);
      const rows = unwrapRows(q);
      const itemRow = rows?.[0] || null;
      if (!itemRow) return res.status(404).json({ ok: false, error: "not found" });

      await db.query(`DELETE FROM items WHERE id = ?`, [id]);

      const displayName = itemRow.name || `ID ${id}`;
      await logItemsAuditSafe(db, req, {
        action: "Item Deleted",
        actionType: "delete",
        item: itemRow,
        extra: {
          statusMessage: `Item "${displayName}" deleted.`,
          actionDetails: { itemId: String(id), name: itemRow.name },
        },
      });

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
};