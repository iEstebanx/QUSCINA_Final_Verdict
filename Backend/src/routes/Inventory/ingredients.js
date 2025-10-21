// Backend/src/routes/Inventory/ingredients.js
const express = require("express");
const {
  db,
  FieldValue,
} = require("../../shared/firebase/firebaseAdmin");

const router = express.Router();
const COLL = "inventory_ingredients";

/* ---------- helpers ---------- */
const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);
/* -------------------------------- */

/** GET /api/inventory/ingredients */
router.get("/", async (_req, res) => {
  try {
    const snap = await db.collection(COLL).orderBy("name").get();
    const ingredients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, ingredients });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "List failed" });
  }
});

/** POST /api/inventory/ingredients  { name, category, type } */
router.post("/", async (req, res) => {
  try {
    const name = normalize(req.body?.name);
    const category = normalize(req.body?.category);
    const type = normalize(req.body?.type) || "";

    if (!isValidName(name)) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
      });
    }
    if (!category) {
      return res.status(400).json({ ok: false, error: "Category is required." });
    }

    const now = FieldValue.serverTimestamp();
    const ref = await db.collection(COLL).add({
      name,
      category,
      type,         // store unit/type
      currentStock: 0,
      lowStock: 0,
      price: 0,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ ok: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Create failed" });
  }
});

module.exports = router;