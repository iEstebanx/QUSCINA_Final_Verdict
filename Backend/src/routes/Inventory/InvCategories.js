// Backend/src/routes/Inventory/invCategories.js
const express = require("express");

// 👇 Import the named exports from your helper
const {
  db,                // Firestore instance
  FieldValue,        // admin.firestore.FieldValue
} = require("../../shared/firebase/firebaseAdmin");

const router = express.Router();
const COLL = "inventory_categories";

/* ---------- helpers ---------- */
const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalizeName = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

function tsToISO(ts) {
  // Firestore Timestamp -> ISO, or null
  try {
    if (!ts) return null;
    // if it's already a JS Date or ISO string, handle gracefully
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === "string") return ts;
    if (typeof ts.toDate === "function") return ts.toDate().toISOString();
    return null;
  } catch (e) {
    return null;
  }
}
/* ------------------------------ */

/** GET /api/inventory/inv-categories */
router.get("/", async (_req, res) => {
  try {
    // order by createdAt descending so newest items come first
    const snap = await db.collection(COLL).orderBy("createdAt", "desc").get();
    const categories = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        createdAt: tsToISO(data.createdAt),
        updatedAt: tsToISO(data.updatedAt),
        // include any other fields you expect, but explicitly list them to avoid non-serializable values
      };
    });
    res.json({ ok: true, categories });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "List failed" });
  }
});

/** POST /api/inventory/inv-categories  { name } */
router.post("/", async (req, res) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!isValidName(name)) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
      });
    }
    const now = FieldValue.serverTimestamp();
    const ref = await db.collection(COLL).add({ name, createdAt: now, updatedAt: now });

    // read the created doc to return the actual stored timestamps (as ISO strings)
    const doc = await ref.get();
    const data = doc.data() || {};
    const category = {
      id: doc.id,
      name: data.name,
      createdAt: tsToISO(data.createdAt),
      updatedAt: tsToISO(data.updatedAt),
    };

    res.status(201).json({ ok: true, category });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Create failed" });
  }
});

/** PATCH /api/inventory/inv-categories/:id  { name } */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const name = normalizeName(req.body?.name);
    if (!isValidName(name)) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
      });
    }

    const ref = db.collection(COLL).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: "Not found" });

    await ref.update({ name, updatedAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Update failed" });
  }
});

/** DELETE /api/inventory/inv-categories  { ids: string[] } */
router.delete("/", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: "No ids provided" });

    const batch = db.batch();
    ids.forEach((id) => batch.delete(db.collection(COLL).doc(id)));
    await batch.commit();

    res.json({ ok: true, deleted: ids.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Delete failed" });
  }
});

module.exports = router;