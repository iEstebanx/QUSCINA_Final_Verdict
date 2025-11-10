// Backend/src/routes/Items/items.js
const express = require("express");
const multer = require("multer");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch { /* ignore until DI provides db */ }

// Multer in-memory; we'll convert to base64 and store in MySQL LONGTEXT
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB req cap
});

/* ---------------------- Helpers ---------------------- */
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
    const qty = Number(it?.qty || 0);
    const pr = Number(it?.price || 0);
    return s + (qty * pr);
  }, 0);
}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();
  // Ensure JSON body is parsed for bulk DELETE (and any JSON posts without multipart)
  router.use(express.json());

  /* ===================== GET /api/items ===================== */
  router.get("/", async (req, res, next) => {
    try {
      const categoryId = String(req.query.categoryId || "").trim();
      const categoryKey = String(req.query.category || "all").trim().toLowerCase();

      let sql = `SELECT id, name, description, categoryId, categoryName, imageDataUrl,
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
        ingredients: typeof x.ingredients === "string" ? JSON.parse(x.ingredients || "[]") : (x.ingredients || []),
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
          error: "Invalid item name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }

      // 🔴 Category is REQUIRED on CREATE
      const rawCategoryId = Number(b.categoryId);
      const categoryId = Number.isFinite(rawCategoryId) && rawCategoryId > 0 ? rawCategoryId : null;
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
          name, description, categoryId, categoryName, categoryKey,
          price, JSON.stringify(ingredients || []), costOverall, profit, now, now,
        ]
      );

      const id = result.insertId;

      // optional image
      let imageUrl = "";
      if (req.file && req.file.buffer && req.file.mimetype) {
        const raw = req.file.buffer;
        if (raw.length > MAX_RAW_IMAGE_BYTES) {
          return res.status(413).json({ ok: false, error: "Image too large. Please upload ≤ 600 KB." });
        }
        const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
        await db.query(`UPDATE items SET imageDataUrl = ?, updatedAt = ? WHERE id = ?`, [dataUrl, new Date(), id]);
        imageUrl = dataUrl;
      }

      res.status(201).json({ ok: true, id: String(id), imageUrl });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" && /uq_items_name_lower/i.test(e?.message || "")) {
        return res.status(409).json({
          ok: false,
          code: "name_taken",
          error: "That item name already exists. Names are not case-sensitive. Try a different name.",
        });
      }
      next(e);
    }
  });

  /* ===================== PATCH /api/items/:id ===================== */
  router.patch("/:id", upload.single("image"), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

      const b = req.body || {};
      const sets = ["updatedAt = ?"];
      const params = [new Date()];

      if (typeof b.name === "string") {
        const n = normalize(b.name);
        if (!isValidName(n)) {
          return res.status(400).json({
            ok: false,
            error: "Invalid item name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
          });
        }
        sets.push("name = ?");
        params.push(n);
      }

      if (typeof b.description === "string") {
        sets.push("description = ?");
        params.push(String(b.description).trim().slice(0, 300));
      }

      // 🔴 If either categoryId or categoryName is present, require BOTH and validate
      const touchingCatId = Object.prototype.hasOwnProperty.call(b, "categoryId");
      const touchingCatName = Object.prototype.hasOwnProperty.call(b, "categoryName");
      if (touchingCatId || touchingCatName) {
        const rawCategoryId = Number(b.categoryId);
        const categoryId = Number.isFinite(rawCategoryId) && rawCategoryId > 0 ? rawCategoryId : null;
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
        sets.push("price = ?");
        params.push(cleanMoney(b.price));
      }

      // ingredients + cost/profit (unchanged)
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
      if (ingredients) { sets.push("ingredients = ?"); params.push(JSON.stringify(ingredients)); }
      if (costOverall != null) { sets.push("costOverall = ?"); params.push(costOverall); }
      if (sets.some(s => s.startsWith("price =")) || sets.some(s => s.startsWith("costOverall ="))) {
        sets.push("profit = (COALESCE(price,0) - COALESCE(costOverall,0))");
      }

      if (req.file && req.file.buffer && req.file.mimetype) {
        const raw = req.file.buffer;
        if (raw.length > MAX_RAW_IMAGE_BYTES) {
          return res.status(413).json({ ok: false, error: "Image too large. Please upload ≤ 600 KB." });
        }
        const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
        sets.push("imageDataUrl = ?");
        params.push(dataUrl);
      }

      params.push(id);
      await db.query(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`, params);

      // Extra safety: ensure item has a category after update
      if (!touchingCatId && !touchingCatName) {
        const chk = await db.query(`SELECT categoryId, categoryName FROM items WHERE id = ?`, [id]);
        const row = Array.isArray(chk) ? chk[0] : null;
        if (!row || !row.categoryId || !row.categoryName) {
          return res.status(409).json({ ok: false, error: "Item must have a category." });
        }
      }

      res.json({ ok: true });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" && /uq_items_name_lower/i.test(e?.message || "")) {
        return res.status(409).json({
          ok: false,
          code: "name_taken",
          error: "That item name already exists. Names are not case-sensitive. Try a different name.",
        });
      }
      next(e);
    }
  });

  /* ===================== DELETE /api/items (bulk) ===================== */
  router.delete("/", async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter(Number.isFinite) : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: "ids is required" });

      const placeholders = ids.map(() => "?").join(",");
      await db.query(`DELETE FROM items WHERE id IN (${placeholders})`, ids);

      res.json({ ok: true, deleted: ids.length });
    } catch (e) {
      next(e);
    }
  });

  /* ===================== DELETE /api/items/:id ===================== */
  router.delete("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id is required" });

      await db.query(`DELETE FROM items WHERE id = ?`, [id]);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
};