// QUSCINA_BACKOFFICE/Backend/src/routes/Categories/categories.js
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

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  // Ensure JSON body is parsed for DELETE (bulk) even if app-level parser changes.
  router.use(express.json());

  // 🔐 All category routes require auth so audit logs can use req.user
  router.use(requireAuth);

  /* ----------------------------- Multer config ----------------------------- */
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB cap at transport level
    fileFilter: (_req, file, cb) => {
      const ok = /^(image\/png|image\/jpeg|image\/webp)$/i.test(file.mimetype);
      if (!ok) return cb(new Error("Only PNG, JPEG, or WEBP images are allowed"));
      cb(null, true);
    },
  });

  /* -------------------------------- Helpers ------------------------------- */
  function bufferToDataUrl(buffer, mime) {
    const b64 = buffer.toString("base64");
    return `data:${mime};base64,${b64}`;
  }

  const MAX_RAW_IMAGE_BYTES = 600 * 1024; // 600 KB

  const NAME_MAX = 60;
  const NAME_MIN = 3;
  const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;

  function normalizeName(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }
  function isValidName(s) {
    if (!s) return false;
    if (s.length < NAME_MIN || s.length > NAME_MAX) return false;
    if (!NAME_ALLOWED.test(s)) return false;
    return true;
  }

  const SAMPLE_LIMIT = 6;

  function toSafeLimit(v, max = SAMPLE_LIMIT) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return max;
    return Math.min(n, max);
  }

  /* --------- Items.category* column auto-detect (camel vs snake) ---------- */
  let _itemsTableKnownMissing = false;
  let ITEMS_CATEGORY_COL = "categoryId"; // default expectation in your schema

  async function _resolveItemsCategoryColumn(db) {
    try {
      const cols = await db.query(`SHOW COLUMNS FROM items`);
      const fields = new Set((cols || []).map((c) => c.Field));
      if (fields.has("categoryId")) ITEMS_CATEGORY_COL = "categoryId";
      else if (fields.has("category_id")) ITEMS_CATEGORY_COL = "category_id";
      else _itemsTableKnownMissing = true; // items exists but no category column
    } catch {
      _itemsTableKnownMissing = true; // items table may not exist yet
    }
  }

  // Resolve once at router creation; if it fails we retry lazily later.
  _resolveItemsCategoryColumn(db);

  async function _ensureItemsCategoryColumnResolved() {
    if (_itemsTableKnownMissing) return;
    if (!ITEMS_CATEGORY_COL) await _resolveItemsCategoryColumn(db);
  }

  async function categoryUsageCount(categoryId) {
    await _ensureItemsCategoryColumnResolved();
    if (_itemsTableKnownMissing) return 0;
    try {
      const rows = await db.query(
        `SELECT COUNT(*) AS n FROM items WHERE ${ITEMS_CATEGORY_COL} = ?`,
        [categoryId]
      );
      return Number(rows?.[0]?.n || 0);
    } catch (err) {
      if (err?.code === "ER_BAD_FIELD_ERROR") {
        // Column changed after startup; re-detect once and retry
        await _resolveItemsCategoryColumn(db);
        if (_itemsTableKnownMissing) return 0;
        const rows = await db.query(
          `SELECT COUNT(*) AS n FROM items WHERE ${ITEMS_CATEGORY_COL} = ?`,
          [categoryId]
        );
        return Number(rows?.[0]?.n || 0);
      }
      if (err?.code === "ER_NO_SUCH_TABLE") {
        _itemsTableKnownMissing = true;
        return 0;
      }
      throw err;
    }
  }

  // Get up to SAMPLE_LIMIT recent item names for a single category
  async function sampleItemNames(categoryId, limit = SAMPLE_LIMIT) {
    await _ensureItemsCategoryColumnResolved();
    if (_itemsTableKnownMissing) return [];

    // Prefer updatedAt if present; fall back to id
    let orderExpr = "updatedAt DESC, id DESC";
    try {
      const cols = await db.query(`SHOW COLUMNS FROM items`);
      const fields = new Set((cols || []).map((c) => c.Field));
      if (!fields.has("updatedAt")) orderExpr = "id DESC";
    } catch {
      orderExpr = "id DESC";
    }

    const L = toSafeLimit(limit);
    const rows = await db.query(
      `SELECT name
        FROM items
        WHERE ${ITEMS_CATEGORY_COL} = ?
        ORDER BY ${orderExpr}
        LIMIT ${L}`,
      [categoryId]
    );
    return (rows || []).map((r) => r.name).filter(Boolean);
  }

  // Get up to SAMPLE_LIMIT names per category for many categories
  async function sampleItemNamesForMany(categoryIds, limit = SAMPLE_LIMIT) {
    await _ensureItemsCategoryColumnResolved();
    const map = new Map();
    if (_itemsTableKnownMissing || !categoryIds?.length) return map;

    // Prefer updatedAt if present; fall back to id
    let orderExpr = "updatedAt DESC, id DESC";
    try {
      const cols = await db.query(`SHOW COLUMNS FROM items`);
      const fields = new Set((cols || []).map((c) => c.Field));
      if (!fields.has("updatedAt")) orderExpr = "id DESC";
    } catch {
      orderExpr = "id DESC";
    }

    const L = toSafeLimit(limit);
    const placeholders = categoryIds.map(() => "?").join(",");

    // Try MySQL 8+ window function version first
    const sql = `
      SELECT cid, name FROM (
        SELECT ${ITEMS_CATEGORY_COL} AS cid,
              name,
              ROW_NUMBER() OVER (PARTITION BY ${ITEMS_CATEGORY_COL} ORDER BY ${orderExpr}) AS rn
          FROM items
        WHERE ${ITEMS_CATEGORY_COL} IN (${placeholders})
      ) t
      WHERE rn <= ${L}
    `;

    try {
      const rows = await db.query(sql, categoryIds);
      for (const r of rows || []) {
        const key = String(r.cid);
        if (!map.has(key)) map.set(key, []);
        if (r.name) map.get(key).push(r.name);
      }
      return map;
    } catch (e) {
      // Fallback for MariaDB / older MySQL without window functions
      // or any SQL mode that rejects the above.
      if (!["ER_PARSE_ERROR", "ER_NOT_SUPPORTED_YET", "ER_WRONG_FIELD_WITH_GROUP"].includes(e?.code)) {
        throw e;
      }
      for (const id of categoryIds) {
        const names = await sampleItemNames(id, L);
        map.set(String(id), names);
      }
      return map;
    }
  }

  /* ------------------------- AUDIT TRAIL HELPERS ------------------------- */

  function getAuditUser(req) {
    const u = req.user;
    if (!u) {
      return {
        employee: "System",
        role: "—",
        id: null,
      };
    }

    const employee =
      u.employeeName ||
      u.name ||
      u.username ||
      u.email ||
      `Employee #${u.employeeId || u.sub || "Unknown"}`;

    return {
      employee,
      role: u.role || "—",
      id: u.employeeId || u.sub || null,
    };
  }

  async function logCategoryAudit(db, req, { action, detail }) {
    const u = getAuditUser(req);

    const finalDetail = {
      ...(detail || {}),
      actionDetails: {
        app: "backoffice",
        module: "categories",
        ...(detail?.actionDetails || {}),
      },
      meta: {
        app: "backoffice",
        userId: u.id,
        role: u.role,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || "",
        ...(detail?.meta || {}),
      },
    };

    await db.query(
      `INSERT INTO audit_trail (employee, role, action, detail)
       VALUES (?, ?, ?, ?)`,
      [u.employee, u.role, action, JSON.stringify(finalDetail)]
    );
  }

  async function logCategoryAuditSafe(db, req, payload) {
    try {
      await logCategoryAudit(db, req, payload);
    } catch (err) {
      console.error("[categories] failed to write audit trail:", err);
    }
  }

  /* --------------------------------- Routes -------------------------------- */

  /** GET /api/categories */
  router.get("/", async (_req, res, next) => {
    try {
      // Newest updated first
      const rows = await db.query(
        `SELECT id, name, name_lower, image_data_url, active, created_at, updated_at
           FROM categories
          ORDER BY updated_at DESC`
      );

      const out = rows.map((x) => ({
        id: String(x.id),
        name: x.name || "",
        imageUrl: x.image_data_url || "",
        createdAt: x.created_at ? new Date(x.created_at).toISOString() : null,
        updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : null,
      }));
      res.json({ ok: true, categories: out });
    } catch (e) {
      next(e);
    }
  });

  /** POST /api/categories  (multipart: name + optional file "image") */
  router.post("/", upload.single("image"), async (req, res) => {
    try {
      const nameRaw = normalizeName(req.body?.name);
      if (!isValidName(nameRaw)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid name. Must be at least ${NAME_MIN} characters (max ${NAME_MAX}); allowed letters, numbers, spaces, - ' & . , ( ) /.`,
        });
      }

      const now = new Date();
      // Unique by name_lower (case-insensitive)
      const result = await db.query(
        `INSERT INTO categories (name, image_data_url, active, created_at, updated_at)
          VALUES (?, '', 1, ?, ?)`,
        [nameRaw, now, now]
      );
      const id = result.insertId;

      let imageUrl = "";
      if (req.file && req.file.buffer && req.file.mimetype) {
        const raw = req.file.buffer;
        if (raw.length > MAX_RAW_IMAGE_BYTES) {
          return res
            .status(413)
            .json({ ok: false, error: "Image too large. Please upload ≤ 600 KB." });
        }
        const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
        await db.query(
          `UPDATE categories SET image_data_url = ?, updated_at = ? WHERE id = ?`,
          [dataUrl, new Date(), id]
        );
        imageUrl = dataUrl;
      }

      // 🔹 Audit: Category Created
      await logCategoryAuditSafe(db, req, {
        action: "Category Created",
        detail: {
          statusMessage: `Category "${nameRaw}" created.`,
          actionDetails: {
            actionType: "create",
            categoryId: id,
            name: nameRaw,
          },
          affectedData: {
            items: [{ id: String(id), name: nameRaw }],
            statusChange: "NONE",
          },
        },
      });

      return res.status(201).json({ ok: true, id: String(id), imageUrl });
    } catch (e) {
      // Duplicate name (unique index on name_lower)
      if (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062) {
        return res
          .status(409)
          .json({ ok: false, error: "That category name already exists (names are case-insensitive)." });
      }
      // Multer/file validation or other errors
      return res.status(400).json({ ok: false, error: e?.message || "Failed to create category" });
    }
  });

  /** PATCH /api/categories/:id  (multipart: name + optional file "image") */
  router.patch("/:id", upload.single("image"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }

      const sets = ["updated_at = ?"];
      const params = [new Date()];
      let nameChanged = false;
      let newName = null;

      if (typeof req.body?.name === "string") {
        const n = normalizeName(req.body.name);
        if (!isValidName(n)) {
          return res.status(400).json({
            ok: false,
            error: `Invalid name. Must be ${NAME_MIN}-${NAME_MAX} chars; allowed letters, numbers, and simple punctuation.`,
          });
        }
        sets.push("name = ?");
        params.push(n);
        nameChanged = true;
        newName = n;
      }

      if (req.file && req.file.buffer && req.file.mimetype) {
        const raw = req.file.buffer;
        if (raw.length > MAX_RAW_IMAGE_BYTES) {
          return res
            .status(413)
            .json({ ok: false, error: "Image too large. Please upload ≤ 600 KB." });
        }
        const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
        sets.push("image_data_url = ?");
        params.push(dataUrl);
      }

      params.push(id);
      await db.query(`UPDATE categories SET ${sets.join(", ")} WHERE id = ?`, params);

      // Return how many items are linked, plus up to 5 recent item names
      let affectedItems = 0;
      let sample = [];
      if (nameChanged) {
        const rows = await db.query(
          `SELECT COUNT(*) AS n FROM items WHERE ${ITEMS_CATEGORY_COL} = ?`,
          [id]
        );
        affectedItems = Number(rows?.[0]?.n || 0);
        sample = await sampleItemNames(id, 5); // <= add up to 5 names
      }

      // 🔹 Audit: Category Updated
      const statusMessage = newName
        ? `Category "${newName}" updated.`
        : `Category ID ${id} updated.`;

      await logCategoryAuditSafe(db, req, {
        action: "Category Updated",
        detail: {
          statusMessage,
          actionDetails: {
            actionType: "update",
            categoryId: id,
            newName,
            affectedItems,
            itemsSample: sample,
          },
          affectedData: {
            items: [{ id: String(id), name: newName }],
            statusChange: "NONE",
          },
        },
      });

      return res.json({ ok: true, affectedItems, sample });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062) {
        return res.status(409).json({
          ok: false,
          error: "That category name already exists (case-insensitive).",
        });
      }
      return res.status(400).json({ ok: false, error: e?.message || "Failed to update category" });
    }
  });

  /** DELETE /api/categories/:id — single delete with referential check (with samples) */
  router.delete("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res.status(400).json({ ok: false, error: "invalid id" });

      const inUse = await categoryUsageCount(id);
      if (inUse > 0) {
        const sample = await sampleItemNames(id, SAMPLE_LIMIT);
        return res.status(409).json({
          ok: false,
          error: `Cannot delete category; ${inUse} item(s) are assigned to it.`,
          count: inUse,
          sample, // array of item names (up to 6)
        });
      }

      // grab name before delete for nicer message (best-effort)
      let catName = null;
      try {
        const rows = await db.query(
          `SELECT name FROM categories WHERE id = ? LIMIT 1`,
          [id]
        );
        catName = rows?.[0]?.name || null;
      } catch {
        /* ignore */
      }

      await db.query(`DELETE FROM categories WHERE id = ?`, [id]);

      // 🔹 Audit: Category Deleted
      const statusMessage = catName
        ? `Category "${catName}" deleted.`
        : `Category ID ${id} deleted.`;

      await logCategoryAuditSafe(db, req, {
        action: "Category Deleted",
        detail: {
          statusMessage,
          actionDetails: {
            actionType: "delete",
            categoryId: id,
            name: catName,
          },
          affectedData: {
            items: [{ id: String(id), name: catName }],
            statusChange: "NONE",
          },
        },
      });

      return res.json({ ok: true, deleted: 1 });
    } catch (e) {
      next(e);
    }
  });

  /**
   * DELETE /api/categories — bulk delete (with per-category samples)
   * Body: { ids: string[] | number[] }
   * Only deletes categories not in use; reports blocked ones (with counts & samples).
   */
  router.delete("/", async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((x) => Number(x)).filter(Number.isFinite)
        : [];
      if (!ids.length) {
        return res.status(400).json({ ok: false, error: "ids array required" });
      }

      const deletable = [];
      const blocked = []; // { id, reason: "in-use", count, sample[] }

      // First pass: counts
      for (const id of ids) {
        const count = await categoryUsageCount(id);
        if (count > 0) blocked.push({ id: String(id), reason: "in-use", count });
        else deletable.push(id);
      }

      // Fetch samples for the blocked ones in one shot (MySQL 8 window fn)
      const blockedIds = blocked.map((b) => Number(b.id));
      if (blockedIds.length) {
        const map = await sampleItemNamesForMany(blockedIds, SAMPLE_LIMIT);
        for (const b of blocked) {
          b.sample = map.get(String(b.id)) || [];
        }
      }

      if (deletable.length) {
        const placeholders = deletable.map(() => "?").join(",");
        await db.query(`DELETE FROM categories WHERE id IN (${placeholders})`, deletable);
      }

      // 🔹 Audit: Categories Bulk Deleted
      await logCategoryAuditSafe(db, req, {
        action: "Categories Bulk Deleted",
        detail: {
          statusMessage: `Deleted ${deletable.length} category(ies).`,
          actionDetails: {
            actionType: "bulk-delete",
            deletedIds: deletable,
            blocked,
          },
          affectedData: {
            items: deletable.map((id) => ({ id: String(id) })),
            statusChange: "NONE",
          },
        },
      });

      return res.json({ ok: true, deleted: deletable.length, blocked });
    } catch (e) {
      next(e);
    }
  });

  return router;
};