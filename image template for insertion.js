// Backend/src/routes/Items/items.js
const express = require("express");
const multer = require("multer");
const { db } = require("../../shared/Firebase/firebaseAdmin"); // Firestore only

const router = express.Router();

// Multer in-memory; we'll convert to base64 and store in Firestore
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB request cap (raw image still checked below)
});

/* ---------------------- Helpers (same pattern as categories) ---------------------- */
function bufferToDataUrl(buffer, mime) {
  const b64 = buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}

// Firestore doc size ~1 MiB; base64 adds ~33% overhead.
// Keep raw image <= ~600 KB so the document stays comfortably under the limit.
const MAX_RAW_IMAGE_BYTES = 600 * 1024;
/* --------------------------------------------------------------------------------- */

// ---------- GET /api/items ----------
// Optional filtering by categoryId (preferred) or legacy ?category=<key>
router.get("/", async (req, res, next) => {
  try {
    const categoryId = String(req.query.categoryId || "").trim();
    const categoryKey = String(req.query.category || "all").trim().toLowerCase();

    let q = db.collection("items");
    if (categoryId) {
      q = q.where("categoryId", "==", categoryId);
    } else if (categoryKey && categoryKey !== "all") {
      q = q.where("categoryKey", "==", categoryKey);
    }

    const snap = await q.get();
    const items = snap.docs.map((d) => {
      const x = d.data() || {};
      return {
        id: d.id,
        name: x.name ?? x.itemName ?? "",
        categoryId: x.categoryId || "",
        categoryName: x.categoryName ?? x.category ?? x.categoryKey ?? "",
        imageUrl: x.imageUrl || x.imageDataUrl || "", // prefer explicit url, else embedded data URL
      };
    });

    items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

// ---------- POST /api/items ----------
// multipart/form-data fields: name (required), categoryId (optional), categoryName (optional), image (optional)
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const categoryId = String(b.categoryId || "").trim();
    const categoryName = String(b.categoryName || "").trim();
    const categoryKey = categoryName ? categoryName.toLowerCase() : "";

    const now = new Date();
    const baseDoc = {
      name,
      nameLower: name.toLowerCase(),
      categoryId: categoryId || "",
      categoryName: categoryName || "",
      categoryNameLower: categoryName ? categoryName.toLowerCase() : "",
      categoryKey, // legacy filter key
      imageDataUrl: "", // store embedded image here (no Firebase Storage)
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    const ref = await db.collection("items").add(baseDoc);

    // Optional image → embed as data URL in Firestore (same as categories)
    let imageUrl = "";
    if (req.file && req.file.buffer && req.file.mimetype) {
      const raw = req.file.buffer;
      if (raw.length > MAX_RAW_IMAGE_BYTES) {
        return res
          .status(413)
          .json({ error: "Image too large for Firestore. Please upload ≤ 600 KB." });
      }
      const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
      await ref.update({ imageDataUrl: dataUrl, updatedAt: new Date() });
      imageUrl = dataUrl;
    }

    res.status(201).json({ ok: true, id: ref.id, imageUrl });
  } catch (e) {
    next(e);
  }
});

// ---------- PATCH /api/items/:id ----------
// Allow updating name/category and optionally replacing the embedded image
router.patch("/:id", upload.single("image"), async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "invalid id" });

    const updates = { updatedAt: new Date() };

    if (typeof req.body?.name === "string") {
      const n = req.body.name.trim();
      if (!n) return res.status(400).json({ error: "name is required" });
      updates.name = n;
      updates.nameLower = n.toLowerCase();
    }
    if (typeof req.body?.categoryId === "string") {
      updates.categoryId = String(req.body.categoryId || "").trim();
    }
    if (typeof req.body?.categoryName === "string") {
      const cn = String(req.body.categoryName || "").trim();
      updates.categoryName = cn;
      updates.categoryNameLower = cn ? cn.toLowerCase() : "";
      updates.categoryKey = cn ? cn.toLowerCase() : "";
    }

    if (req.file && req.file.buffer && req.file.mimetype) {
      const raw = req.file.buffer;
      if (raw.length > MAX_RAW_IMAGE_BYTES) {
        return res
          .status(413)
          .json({ error: "Image too large for Firestore. Please upload ≤ 600 KB." });
      }
      updates.imageDataUrl = bufferToDataUrl(raw, req.file.mimetype);
    }

    await db.collection("items").doc(id).update(updates);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- DELETE /api/items  (bulk) ----------
router.delete("/", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "ids is required" });

    const batch = db.batch();
    ids.forEach((id) => batch.delete(db.collection("items").doc(String(id))));
    await batch.commit();

    res.json({ ok: true, deleted: ids.length });
  } catch (e) {
    next(e);
  }
});

// ---------- DELETE /api/items/:id  (single) ----------
router.delete("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    await db.collection("items").doc(id).delete();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;