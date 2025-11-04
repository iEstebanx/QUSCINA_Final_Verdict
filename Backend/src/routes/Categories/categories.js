// Backend/src/routes/Categories/categories.js
const express = require("express");
const multer = require("multer");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch { /* ignore until DI provides db */ }

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();
  // Ensure JSON body is parsed for DELETE (bulk) even if app-level parser changes.
  router.use(express.json());

  /* ----------------------------- Multer config ----------------------------- */
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB hard cap at transport level
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

  let _itemsTableKnownMissing = false;
  async function categoryUsageCount(categoryId) {
    if (_itemsTableKnownMissing) return 0;
    try {
      // NOTE: expects items.category_id (snake_case). If your column is different, adjust here.
      const rows = await db.query(
        `SELECT COUNT(*) AS n FROM items WHERE category_id = ?`,
        [categoryId]
      );
      return Number(rows[0]?.n || 0);
    } catch (err) {
      if (err?.code === "ER_NO_SUCH_TABLE") {
        _itemsTableKnownMissing = true; // cache to avoid re-checking each call
        return 0;
      }
      throw err;
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
        `INSERT INTO categories (name, name_lower, image_data_url, active, created_at, updated_at)
         VALUES (?, ?, '', 1, ?, ?)`,
        [nameRaw, nameRaw.toLowerCase(), now, now]
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
          `UPDATE categories SET image_data_url = ?, updated_at = ? WHERE id = ?`,
          [dataUrl, new Date(), id]
        );
        imageUrl = dataUrl;
      }

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
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

      const sets = ["updated_at = ?"];
      const params = [new Date()];

      if (typeof req.body?.name === "string") {
        const n = normalizeName(req.body.name);
        if (!isValidName(n)) {
          return res.status(400).json({
            ok: false,
            error: `Invalid name. Must be at least ${NAME_MIN} characters (max ${NAME_MAX}); allowed letters, numbers, spaces, - ' & . , ( ) /.`,
          });
        }
        sets.push("name = ?", "name_lower = ?");
        params.push(n, n.toLowerCase());
      }

      if (req.file && req.file.buffer && req.file.mimetype) {
        const raw = req.file.buffer;
        if (raw.length > MAX_RAW_IMAGE_BYTES) {
          return res.status(413).json({ ok: false, error: "Image too large. Please upload ≤ 600 KB." });
        }
        const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
        sets.push("image_data_url = ?");
        params.push(dataUrl);
      }

      params.push(id);
      await db.query(`UPDATE categories SET ${sets.join(", ")} WHERE id = ?`, params);
      return res.json({ ok: true });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062) {
        return res
          .status(409)
          .json({ ok: false, error: "That category name already exists (names are case-insensitive)." });
      }
      return res.status(400).json({ ok: false, error: e?.message || "Failed to update category" });
    }
  });

  /** DELETE /api/categories/:id  — single delete with referential check */
  router.delete("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

      const inUse = await categoryUsageCount(id);
      if (inUse > 0) {
        return res
          .status(409)
          .json({ ok: false, error: `Cannot delete category; ${inUse} item(s) still reference it.` });
      }

      await db.query(`DELETE FROM categories WHERE id = ?`, [id]);
      return res.json({ ok: true, deleted: 1 });
    } catch (e) {
      next(e);
    }
  });

  /**
   * DELETE /api/categories  — bulk delete
   * Body: { ids: string[] | number[] }
   * Only deletes categories not in use; reports blocked ones.
   */
  router.delete("/", async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter(Number.isFinite) : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: "ids array required" });

      const deletable = [];
      const blocked = [];

      for (const id of ids) {
        const count = await categoryUsageCount(id);
        if (count > 0) blocked.push({ id: String(id), reason: "in-use", count });
        else deletable.push(id);
      }

      if (deletable.length) {
        const placeholders = deletable.map(() => "?").join(",");
        await db.query(`DELETE FROM categories WHERE id IN (${placeholders})`, deletable);
      }

      return res.json({ ok: true, deleted: deletable.length, blocked });
    } catch (e) {
      next(e);
    }
  });

  return router;
};