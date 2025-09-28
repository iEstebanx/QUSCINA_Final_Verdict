// Backend/src/routes/Categories/categories.js
const express = require("express");
const multer = require("multer");
const { db } = require("../../shared/firebase/firebaseAdmin"); // Firestore only

const router = express.Router();

// Multer in-memory; we’ll convert to base64 and store in Firestore
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// ---- Helpers -------------------------------------------------

function bufferToDataUrl(buffer, mime) {
  const b64 = buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}

// Firestore doc limit ~1 MiB (base64 ≈ +33%). Keep raw image <= ~600KB.
const MAX_RAW_IMAGE_BYTES = 600 * 1024;

// ---- Routes --------------------------------------------------

// GET /api/categories
router.get("/", async (_req, res, next) => {
  try {
    const snap = await db.collection("categories").get();
    const rows = snap.docs.map((d) => {
      const x = d.data() || {};
      return {
        id: d.id,
        name: x.name || "",
        imageUrl: x.imageUrl || x.imageDataUrl || "",
      };
    });
    rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    res.json({ ok: true, categories: rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/categories  (multipart: name + optional file "image")
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const now = new Date();
    const baseDoc = {
      name,
      nameLower: name.toLowerCase(),
      imageDataUrl: "",
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    const ref = await db.collection("categories").add(baseDoc);

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

    return res.status(201).json({ ok: true, id: ref.id, imageUrl });
  } catch (e) {
    console.error("[categories POST]", e);
    next(e);
  }
});

// PATCH /api/categories/:id  (multipart: name + optional file "image")
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

    if (req.file && req.file.buffer && req.file.mimetype) {
      const raw = req.file.buffer;
      if (raw.length > MAX_RAW_IMAGE_BYTES) {
        return res
          .status(413)
          .json({ error: "Image too large for Firestore. Please upload ≤ 600 KB." });
      }
      updates.imageDataUrl = bufferToDataUrl(raw, req.file.mimetype);
    }

    await db.collection("categories").doc(id).update(updates);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[categories PATCH]", e);
    next(e);
  }
});

// DELETE /api/categories/:id  (single)
router.delete("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "invalid id" });
    await db.collection("categories").doc(id).delete();
    return res.json({ ok: true, deleted: 1 });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/categories  (bulk; body: { ids: string[] })
router.delete("/", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "ids array required" });

    const batch = db.batch();
    ids.forEach((id) => batch.delete(db.collection("categories").doc(String(id))));
    await batch.commit();

    return res.json({ ok: true, deleted: ids.length });
  } catch (e) {
    next(e);
  }
});

module.exports = router;