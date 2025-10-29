// Backend/src/routes/Categories/categories.js
const express = require("express");
const multer = require("multer");
const { db } = require("../../shared/firebase/firebaseAdmin"); // Firestore Admin

const router = express.Router();

/* ----------------------------- Multer config ----------------------------- */
// In-memory; we store a base64 data URL in Firestore (consider Cloud Storage later)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB request cap
  fileFilter: (_req, file, cb) => {
    // basic image whitelist
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

// Firestore doc limit ~1 MiB; base64 ≈ +33%. Keep raw image ≤ ~600 KB.
const MAX_RAW_IMAGE_BYTES = 600 * 1024;

// Server-side validation to mirror client
const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;

function normalizeName(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
function isValidName(s) {
  if (!s) return false;
  if (s.length === 0 || s.length > NAME_MAX) return false;
  if (!NAME_ALLOWED.test(s)) return false;
  return true;
}

/**
 * Return how many items still reference a given categoryId.
 * Uses the new count() aggregation when available; falls back to existence check.
 */
async function categoryUsageCount(categoryId) {
  const itemsColl = db.collection("items").where("categoryId", "==", categoryId);

  // Newer Admin SDKs expose .count()
  if (typeof itemsColl.count === "function") {
    const agg = await itemsColl.count().get();
    const n = agg?.data()?.count ?? 0;
    return Number(n) || 0;
  }

  // Fallback for older SDKs: cheap existence probe
  const snap = await itemsColl.limit(1).get();
  return snap.empty ? 0 : 1;
}

/* --------------------------------- Routes -------------------------------- */

/** GET /api/categories */
router.get("/", async (_req, res, next) => {
  try {
    // Newest updated first
    const snap = await db.collection("categories").orderBy("updatedAt", "desc").get();

    const rows = snap.docs.map((d) => {
      const x = d.data() || {};
      const updatedAtIso =
        x.updatedAt && typeof x.updatedAt.toDate === "function"
          ? x.updatedAt.toDate().toISOString()
          : x.updatedAt || null;
      const createdAtIso =
        x.createdAt && typeof x.createdAt.toDate === "function"
          ? x.createdAt.toISOString?.() ?? x.createdAt.toDate().toISOString()
          : x.createdAt || null;

      return {
        id: d.id,
        name: x.name || "",
        imageUrl: x.imageUrl || x.imageDataUrl || "",
        createdAt: createdAtIso,
        updatedAt: updatedAtIso,
      };
    });

    res.json({ ok: true, categories: rows });
  } catch (e) {
    next(e);
  }
});

/** POST /api/categories  (multipart: name + optional file "image") */
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    const nameRaw = normalizeName(req.body?.name);
    if (!isValidName(nameRaw)) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Invalid name. Max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /",
        });
    }

    const now = new Date();
    const baseDoc = {
      name: nameRaw,
      nameLower: nameRaw.toLowerCase(),
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
          .json({ ok: false, error: "Image too large for Firestore. Please upload ≤ 600 KB." });
      }
      const dataUrl = bufferToDataUrl(raw, req.file.mimetype);
      await ref.update({ imageDataUrl: dataUrl, updatedAt: new Date() });
      imageUrl = dataUrl;
    }

    return res.status(201).json({ ok: true, id: ref.id, imageUrl });
  } catch (e) {
    // Multer fileFilter errors land here too
    return res.status(400).json({ ok: false, error: e?.message || "Failed to create category" });
  }
});

/** PATCH /api/categories/:id  (multipart: name + optional file "image") */
router.patch("/:id", upload.single("image"), async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

    const updates = { updatedAt: new Date() };

    if (typeof req.body?.name === "string") {
      const n = normalizeName(req.body.name);
      if (!isValidName(n)) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Invalid name. Max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /",
          });
      }
      updates.name = n;
      updates.nameLower = n.toLowerCase();
    }

    if (req.file && req.file.buffer && req.file.mimetype) {
      const raw = req.file.buffer;
      if (raw.length > MAX_RAW_IMAGE_BYTES) {
        return res
          .status(413)
          .json({ ok: false, error: "Image too large for Firestore. Please upload ≤ 600 KB." });
      }
      updates.imageDataUrl = bufferToDataUrl(raw, req.file.mimetype);
    }

    await db.collection("categories").doc(id).update(updates);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || "Failed to update category" });
  }
});

/** DELETE /api/categories/:id  — single delete with referential check */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

    const inUse = await categoryUsageCount(id);
    if (inUse > 0) {
      return res
        .status(409) // Conflict
        .json({ ok: false, error: `Cannot delete category; ${inUse} item(s) still reference it.` });
    }

    await db.collection("categories").doc(id).delete();
    return res.json({ ok: true, deleted: 1 });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/categories  — bulk delete
 * Deletes only categories that are not in use; reports blocked ones.
 * Body: { ids: string[] }
 * Response: { ok: true, deleted: number, blocked: [{id, reason:"in-use", count}] }
 */
router.delete("/", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: "ids array required" });

    const deletable = [];
    const blocked = [];

    // Check usage. For small N this sequential loop is fine; you can parallelize if needed.
    for (const id of ids) {
      const count = await categoryUsageCount(id);
      if (count > 0) blocked.push({ id, reason: "in-use", count });
      else deletable.push(id);
    }

    if (deletable.length) {
      const batch = db.batch();
      deletable.forEach((id) => batch.delete(db.collection("categories").doc(String(id))));
      await batch.commit();
    }

    return res.json({ ok: true, deleted: deletable.length, blocked });
  } catch (e) {
    next(e);
  }
});

module.exports = router;