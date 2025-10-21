// Backend/src/routes/Items/items.js
const express = require("express");
const multer = require("multer");
const { db } = require("../../shared/firebase/firebaseAdmin"); // Firestore only

const router = express.Router();

// Multer in-memory; we'll convert to base64 and store in Firestore
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB request cap
});

/* ---------------------- Helpers ---------------------- */
function bufferToDataUrl(buffer, mime) {
  const b64 = buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}

// Firestore doc size ~1 MiB; base64 adds ~33%. Keep raw image <= ~600 KB.
const MAX_RAW_IMAGE_BYTES = 600 * 1024;

/** Safely serialize Firestore Timestamps to epoch millis */
function tsMillis(t) {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (t._seconds != null) {
    return t._seconds * 1000 + Math.floor((t._nanoseconds || 0) / 1e6);
  }
  if (t instanceof Date) return t.getTime();
  return 0;
}
/* ----------------------------------------------------- */

/* ===================== GET /api/items ===================== */
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
      const costOverall =
        typeof x.costOverall === "number"
          ? x.costOverall
          : x.costOverall != null
          ? Number(x.costOverall)
          : 0;
      const price =
        typeof x.price === "number"
          ? x.price
          : x.price != null
          ? Number(x.price)
          : 0;
      const profit =
        typeof x.profit === "number"
          ? x.profit
          : Number((price - costOverall).toFixed(2));

      return {
        id: d.id,
        name: x.name ?? x.itemName ?? "",
        description: x.description || "",
        categoryId: x.categoryId || "",
        categoryName: x.categoryName ?? x.category ?? x.categoryKey ?? "",
        imageUrl: x.imageUrl || x.imageDataUrl || "",
        createdAt: tsMillis(x.createdAt),
        updatedAt: tsMillis(x.updatedAt),
        price,
        ingredients: Array.isArray(x.ingredients) ? x.ingredients : [],
        costOverall,
        profit, // ⬅️ new field exposed to frontend
      };
    });

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
    const categoryId = String(b.categoryId || "").trim();
    const categoryName = String(b.categoryName || "").trim();
    const categoryKey = categoryName ? categoryName.toLowerCase() : "";

    const price = Number(String(b.price || "0").replace(/[^0-9.]/g, "")) || 0;

    let ingredients = [];
    if (typeof b.ingredients === "string" && b.ingredients.trim()) {
      try {
        const parsed = JSON.parse(b.ingredients);
        if (Array.isArray(parsed)) ingredients = parsed;
      } catch {}
    } else if (Array.isArray(b.ingredients)) {
      ingredients = b.ingredients;
    }

    let costOverall = 0;
    if (Array.isArray(ingredients)) {
      costOverall = ingredients.reduce((s, it) => {
        const qty = Number(it.qty || 0);
        const pr = Number(it.price || 0);
        return s + qty * pr;
      }, 0);
    }

    const profit = Number((price - costOverall).toFixed(2)); // ⬅️ compute profit

    const now = new Date();
    const baseDoc = {
      name,
      nameLower: name.toLowerCase(),
      description,
      categoryId: categoryId || "",
      categoryName: categoryName || "",
      categoryNameLower: categoryName ? categoryName.toLowerCase() : "",
      categoryKey,
      imageDataUrl: "",
      price,
      ingredients,
      costOverall,
      profit, // ⬅️ store profit
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    const ref = await db.collection("items").add(baseDoc);

    let imageUrl = "";
    if (req.file && req.file.buffer && req.file.mimetype) {
      const raw = req.file.buffer;
      if (raw.length > MAX_RAW_IMAGE_BYTES) {
        return res
          .status(413)
          .json({ ok: false, error: "Image too large for Firestore. Please upload ≤ 600 KB." });
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

/* ===================== PATCH /api/items/:id ===================== */
router.patch("/:id", upload.single("image"), async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

    const updates = { updatedAt: new Date() };
    const b = req.body || {};

    if (typeof b.name === "string") {
      const n = b.name.trim();
      if (!n) return res.status(400).json({ ok: false, error: "name is required" });
      updates.name = n;
      updates.nameLower = n.toLowerCase();
    }

    if (typeof b.description === "string") {
      updates.description = String(b.description).trim().slice(0, 300);
    }

    if (typeof b.categoryId === "string") updates.categoryId = String(b.categoryId || "").trim();
    if (typeof b.categoryName === "string") {
      const cn = String(b.categoryName || "").trim();
      updates.categoryName = cn;
      updates.categoryNameLower = cn ? cn.toLowerCase() : "";
      updates.categoryKey = cn ? cn.toLowerCase() : "";
    }

    const price =
      typeof b.price !== "undefined"
        ? Number(String(b.price || "0").replace(/[^0-9.]/g, "")) || 0
        : undefined;
    if (typeof price === "number") updates.price = price;

    // Handle ingredients + costOverall
    let costOverall = 0;
    if (typeof b.ingredients === "string") {
      try {
        const parsed = JSON.parse(b.ingredients);
        if (Array.isArray(parsed)) {
          updates.ingredients = parsed;
          costOverall = parsed.reduce(
            (s, it) => s + (Number(it.qty || 0) * Number(it.price || 0) || 0),
            0
          );
          updates.costOverall = costOverall;
        }
      } catch {}
    } else if (Array.isArray(b.ingredients)) {
      updates.ingredients = b.ingredients;
      costOverall = b.ingredients.reduce(
        (s, it) => s + (Number(it.qty || 0) * Number(it.price || 0) || 0),
        0
      );
      updates.costOverall = costOverall;
    } else if (typeof b.costOverall !== "undefined") {
      costOverall = Number(String(b.costOverall || "0").replace(/[^0-9.]/g, "")) || 0;
      updates.costOverall = costOverall;
    }

    // compute profit
    const finalPrice = typeof price === "number" ? price : Number(b.price || 0);
    updates.profit = Number((finalPrice - costOverall).toFixed(2));

    if (req.file && req.file.buffer && req.file.mimetype) {
      const raw = req.file.buffer;
      if (raw.length > MAX_RAW_IMAGE_BYTES) {
        return res
          .status(413)
          .json({ ok: false, error: "Image too large for Firestore. Please upload ≤ 600 KB." });
      }
      updates.imageDataUrl = bufferToDataUrl(raw, req.file.mimetype);
    }

    await db.collection("items").doc(id).update(updates);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ===================== DELETE /api/items (bulk) ===================== */
router.delete("/", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: "ids is required" });

    const batch = db.batch();
    ids.forEach((id) => batch.delete(db.collection("items").doc(String(id))));
    await batch.commit();

    res.json({ ok: true, deleted: ids.length });
  } catch (e) {
    next(e);
  }
});

/* ===================== DELETE /api/items/:id ===================== */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id is required" });
    await db.collection("items").doc(id).delete();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;