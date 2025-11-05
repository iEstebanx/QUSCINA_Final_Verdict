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
      const name = String(b.name || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "name is required" });

      const description = String(b.description || "").trim().slice(0, 300);
      const categoryId = Number(b.categoryId || 0) || null;
      const categoryName = String(b.categoryName || "").trim();
      const categoryKey = categoryName ? categoryName.toLowerCase() : "";

      const price = cleanMoney(b.price);

      let ingredients = [];
      if (typeof b.ingredients === "string" && b.ingredients.trim()) {
        try {
          const parsed = JSON.parse(b.ingredients);
          if (Array.isArray(parsed)) ingredients = parsed;
        } catch { /* ignore */ }
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

      let imageUrl = "";
      if (req.file && req.file.buffer && req.file.mimetype) {
        const raw = req.file.buffer;
        if (raw.length > MAX_RAW_IMAGE_BYTES) {
          return res.status(413).json({ ok: false, error: "Image too large. Please upload ≤ 600 KB." });
        }
        const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
        await db.query(
          `UPDATE items SET imageDataUrl = ?, updatedAt = ? WHERE id = ?`,
          [dataUrl, new Date(), id]
        );
        imageUrl = dataUrl;
      }

      res.status(201).json({ ok: true, id: String(id), imageUrl });
    } catch (e) {
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
        const n = b.name.trim();
        if (!n) return res.status(400).json({ ok: false, error: "name is required" });
        sets.push("name = ?");
        params.push(n);
      }

      if (typeof b.description === "string") {
        sets.push("description = ?");
        params.push(String(b.description).trim().slice(0, 300));
      }

      if (typeof b.categoryId !== "undefined") {
        const cid = Number(b.categoryId || 0) || null;
        sets.push("categoryId = ?");
        params.push(cid);
      }

      if (typeof b.categoryName === "string") {
        const cn = String(b.categoryName || "").trim();
        sets.push("categoryName = ?", "categoryKey = ?");
        params.push(cn, cn ? cn.toLowerCase() : "");
      }

      if (typeof b.price !== "undefined") {
        sets.push("price = ?");
        params.push(cleanMoney(b.price));
      }

      // ingredients & cost/profit recompute
      let ingredients = null;
      let costOverall = null;

      if (typeof b.ingredients === "string") {
        try {
          const parsed = JSON.parse(b.ingredients);
          if (Array.isArray(parsed)) {
            ingredients = parsed;
            costOverall = computeCostOverall(parsed);
          }
        } catch { /* ignore */ }
      } else if (Array.isArray(b.ingredients)) {
        ingredients = b.ingredients;
        costOverall = computeCostOverall(b.ingredients);
      } else if (typeof b.costOverall !== "undefined") {
        costOverall = cleanMoney(b.costOverall);
      }

      if (ingredients) {
        sets.push("ingredients = ?");
        params.push(JSON.stringify(ingredients));
      }
      if (costOverall != null) {
        sets.push("costOverall = ?");
        params.push(costOverall);
      }

      // compute profit if we changed either price or costOverall
      const changedPrice = sets.some((s) => s.startsWith("price ="));
      const changedCost = sets.some((s) => s.startsWith("costOverall ="));
      if (changedPrice || changedCost) {
        // profit = price - costOverall
        // Do it in SQL using current/updated values:
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
      res.json({ ok: true });
    } catch (e) {
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