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
// Friendly labels for audit "changed fields"
const ITEM_FIELD_LABELS = {
  name: "name",
  description: "description",
  categoryId: "category",
  categoryName: "category",
  price: "price",
  costOverall: "cost",
  profit: "profit",
};

/**
 * Turn raw changed keys into a nice comma-separated list:
 *   ['description','categoryId','categoryName','price','profit']
 * → 'description, category, price, profit'
 */
function summarizeItemChangedFields(changedKeys = []) {
  // Map → friendly labels, de-duplicate (categoryId + categoryName → category)
  const labels = [];
  for (const key of changedKeys) {
    const label = ITEM_FIELD_LABELS[key];
    if (!label) continue;
    if (!labels.includes(label)) labels.push(label);
  }

  if (!labels.length) return "";

  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;

  // 3+ → "a, b, c" etc.
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

function computeCostOverall(ingredients) {
  if (!Array.isArray(ingredients)) return 0;
  return ingredients.reduce((s, it) => {
    if (!it) return s;
    const hasCost = it.cost != null && it.cost !== "";
    const cost = hasCost
      ? Number(it.cost) || 0
      : (Number(it.qty || 0) * Number(it.price || 0)) || 0; // fallback
    return s + cost;
  }, 0);
}

/* ============================================================
   AUDIT HELPERS FOR ITEMS
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
  } catch {
    // ignore bad JSON
  }

  return {
    id: String(row.id),
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    price: Number(row.price || 0),
    costOverall: Number(row.costOverall || 0),
    profit: Number(row.profit || 0),
    ingredientsCount,
  };
}

/**
 * Core audit writer for items module.
 * All logs go to audit_trail with: employee, role, action, detail(JSON)
 */
async function logItemsAudit(
  db,
  req,
  {
    action, // e.g. "Inventory - Item Created"
    actionType, // "create" | "update" | "delete" | "bulk-delete"
    item, // single row
    items, // array of rows (for bulk delete)
    before,
    after,
    changes,
    extra = {}, // { statusMessage, actionDetails: {...} }
  }
) {
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

  // Ensure JSON body is parsed for bulk DELETE (and any JSON posts without multipart)
  router.use(express.json());

  // 🔐 protect all item routes so req.user is populated
  router.use(requireAuth);

  /* ===================== GET /api/items ===================== */
  router.get("/", async (req, res, next) => {
    try {
      const categoryId = String(req.query.categoryId || "").trim();
      const categoryKey = String(req.query.category || "all")
        .trim()
        .toLowerCase();

      let sql = `SELECT id, name, description, categoryId, categoryName, categoryKey, imageDataUrl,
                        createdAt, updatedAt, price, ingredients, costOverall, profit
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
      const rows = await db.query(sql, params);

      const items = rows.map((x) => ({
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
        costOverall: Number(x.costOverall || 0),
        profit: Number(x.profit || 0),
      }));

      res.json({ ok: true, items });
    } catch (e) {
      next(e);
    }
  });

  /* ===================== POST /api/items ===================== */
  router.post("/", upload.single("image"), async (req, res, next) => {
    try {
      const b = req.body || {};

      // name
      const name = normalize(b.name);
      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid item name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }

      // 🔴 Category is REQUIRED on CREATE
      const rawCategoryId = Number(b.categoryId);
      const categoryId =
        Number.isFinite(rawCategoryId) && rawCategoryId > 0
          ? rawCategoryId
          : null;
      const categoryName = normalize(b.categoryName);
      if (!categoryId || !categoryName) {
        return res
          .status(400)
          .json({ ok: false, error: "Category is required." });
      }
      if (!isValidName(categoryName)) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid category name." });
      }
      const categoryKey = categoryName.toLowerCase();

      const description = String(b.description || "").trim().slice(0, 300);
      const price = cleanMoney(b.price);

      // ingredients + cost
      let ingredients = [];
      if (typeof b.ingredients === "string" && b.ingredients.trim()) {
        try {
          const parsed = JSON.parse(b.ingredients);
          if (Array.isArray(parsed)) ingredients = parsed;
        } catch {}
      } else if (Array.isArray(b.ingredients)) {
        ingredients = b.ingredients;
      }
      const costOverall = computeCostOverall(ingredients);
      const profit = Number((price - costOverall).toFixed(2));
      const now = new Date();

      const result = await db.query(
        `INSERT INTO items
          (name, description, categoryId, categoryName, categoryKey,
           imageDataUrl, price, ingredients, costOverall, profit, active, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 1, ?, ?)`,
        [
          name,
          description,
          categoryId,
          categoryName,
          categoryKey,
          price,
          JSON.stringify(ingredients || []),
          costOverall,
          profit,
          now,
          now,
        ]
      );

      const id = result.insertId;

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

      // Fetch full row for audit
      const createdRows = await db.query(
        `SELECT * FROM items WHERE id = ? LIMIT 1`,
        [id]
      );
      const created = createdRows[0] || null;

      const statusMessage = created
        ? `Item "${created.name}" created.`
        : "Item created.";

      await logItemsAuditSafe(db, req, {
        action: "Item Created",
        actionType: "create",
        item: created || { id },
        extra: {
          statusMessage,
          actionDetails: created
            ? {
                itemId: String(created.id),
                name: created.name,
                categoryId: created.categoryId,
                categoryName: created.categoryName,
                price: created.price,
                costOverall: created.costOverall,
                profit: created.profit,
              }
            : { itemId: String(id) },
        },
      });

      res.status(201).json({ ok: true, id: String(id), imageUrl });
    } catch (e) {
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

      // Fetch "before" snapshot for audit
      const beforeRows = await db.query(
        `SELECT * FROM items WHERE id = ? LIMIT 1`,
        [id]
      );
      const before = beforeRows[0] || null;
      if (!before) {
        return res.status(404).json({ ok: false, error: "not found" });
      }

      const b = req.body || {};
      const sets = ["updatedAt = ?"];
      const params = [new Date()];
      const patchForAudit = {};

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
        patchForAudit.name = n;
      }

      if (typeof b.description === "string") {
        const desc = String(b.description).trim().slice(0, 300);
        sets.push("description = ?");
        params.push(desc);
        patchForAudit.description = desc;
      }

      // If either categoryId or categoryName is present, require BOTH and validate
      const touchingCatId = Object.prototype.hasOwnProperty.call(b, "categoryId");
      const touchingCatName = Object.prototype.hasOwnProperty.call(
        b,
        "categoryName"
      );
      if (touchingCatId || touchingCatName) {
        const rawCategoryId = Number(b.categoryId);
        const categoryId =
          Number.isFinite(rawCategoryId) && rawCategoryId > 0
            ? rawCategoryId
            : null;
        const categoryName = normalize(b.categoryName);

        if (!categoryId || !categoryName) {
          return res
            .status(400)
            .json({ ok: false, error: "Category is required." });
        }
        if (!isValidName(categoryName)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid category name." });
        }

        sets.push("categoryId = ?", "categoryName = ?", "categoryKey = ?");
        params.push(categoryId, categoryName, categoryName.toLowerCase());

        patchForAudit.categoryId = categoryId;
        patchForAudit.categoryName = categoryName;
      }

      if (typeof b.price !== "undefined") {
        const price = cleanMoney(b.price);
        sets.push("price = ?");
        params.push(price);
        patchForAudit.price = price;
      }

      // ingredients + cost/profit
      let ingredients = null;
      let costOverall = null;

      if (typeof b.ingredients === "string") {
        try {
          const parsed = JSON.parse(b.ingredients);
          if (Array.isArray(parsed)) {
            ingredients = parsed;
            costOverall = computeCostOverall(parsed);
          }
        } catch {}
      } else if (Array.isArray(b.ingredients)) {
        ingredients = b.ingredients;
        costOverall = computeCostOverall(b.ingredients);
      } else if (typeof b.costOverall !== "undefined") {
        costOverall = cleanMoney(b.costOverall);
      }

      if (ingredients) {
        sets.push("ingredients = ?");
        params.push(JSON.stringify(ingredients));
        patchForAudit.ingredients = ingredients;
      }
      if (costOverall != null) {
        sets.push("costOverall = ?");
        params.push(costOverall);
        patchForAudit.costOverall = costOverall;
      }

      if (
        sets.some((s) => s.startsWith("price =")) ||
        sets.some((s) => s.startsWith("costOverall ="))
      ) {
        sets.push(
          "profit = (COALESCE(price,0) - COALESCE(costOverall,0))"
        );
        // profit is computed by SQL, no param
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
        patchForAudit.imageUpdated = true;
      }

      if (sets.length === 1) {
        return res.status(400).json({ ok: false, error: "no changes" });
      }

      params.push(id);
      await db.query(
        `UPDATE items SET ${sets.join(", ")} WHERE id = ?`,
        params
      );

      // Extra safety: ensure item has a category after update
      if (!touchingCatId && !touchingCatName) {
        const chk = await db.query(
          `SELECT categoryId, categoryName FROM items WHERE id = ?`,
          [id]
        );
        const row = chk && chk[0];
        if (!row || !row.categoryId || !row.categoryName) {
          return res
            .status(409)
            .json({ ok: false, error: "Item must have a category." });
        }
      }

      // Fetch "after" snapshot
      const afterRows = await db.query(
        `SELECT * FROM items WHERE id = ? LIMIT 1`,
        [id]
      );
      const after = afterRows[0] || null;

      // Compute field-level changes for audit
      const fieldsToCompare = [
        "name",
        "description",
        "categoryId",
        "categoryName",
        "price",
        "costOverall",
        "profit",
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

      // ✅ use friendly labels instead of raw field names
      const friendlyFields = summarizeItemChangedFields(changedKeys);

      const statusMessage = friendlyFields
        ? `Item "${targetName}" updated (${friendlyFields}).`
        : `Item "${targetName}" updated.`;

      // ✅ actually USE statusMessage → no more TS warning
      await logItemsAuditSafe(db, req, {
        action: "Item Updated",
        actionType: "update",
        item: after || before,
        before,
        after,
        changes: changedKeys.length ? changes : undefined,
        extra: {
          statusMessage,
          actionDetails: {
            itemId: String(before.id),
            name: targetName,
            changedFields: friendlyFields || undefined,
          },
        },
      });

      res.json({ ok: true });
    } catch (e) {
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
        return res
          .status(400)
          .json({ ok: false, error: "ids is required" });

      const placeholders = ids.map(() => "?").join(",");

      // Fetch rows for audit before deletion
      const existingRows = await db.query(
        `SELECT * FROM items WHERE id IN (${placeholders})`,
        ids
      );

      await db.query(
        `DELETE FROM items WHERE id IN (${placeholders})`,
        ids
      );

      await logItemsAuditSafe(db, req, {
        action: "Items Bulk Deleted",
        actionType: "bulk-delete",
        items: existingRows || [],
        extra: {
          statusMessage: `Deleted ${ids.length} item(s).`,
          actionDetails: {
            ids,
            deleted:
              (existingRows || []).map((r) => ({
                id: String(r.id),
                name: r.name,
              })) || [],
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

      // Fetch row for audit before deletion
      const rows = await db.query(
        `SELECT * FROM items WHERE id = ? LIMIT 1`,
        [id]
      );
      const itemRow = rows[0] || null;
      if (!itemRow) {
        return res.status(404).json({ ok: false, error: "not found" });
      }

      await db.query(`DELETE FROM items WHERE id = ?`, [id]);

      const displayName = itemRow.name || `ID ${id}`;
      const statusMessage = `Item "${displayName}" deleted.`;

      await logItemsAuditSafe(db, req, {
        action: "Item Deleted",
        actionType: "delete",
        item: itemRow,
        extra: {
          statusMessage,
          actionDetails: {
            itemId: String(id),
            name: itemRow.name,
          },
        },
      });

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
};