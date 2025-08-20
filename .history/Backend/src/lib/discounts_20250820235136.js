// discounts.js
const express = require("express");
const router = express.Router();
const { db, FieldValue } = require("../lib/firebaseAdmin");

// helper: sequential code (DISC-000001, auto-expands)
function formatDiscCode(n) {
  const width = Math.max(6, String(n).length);
  return `DISC-${String(n).padStart(width, "0")}`;
}

// GET /api/discounts
router.get("/", async (_req, res) => {
  try {
    const snap = await db.collection("discounts").orderBy("createdAt", "desc").get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/discounts  (auto-generate code via transaction)
router.post("/", async (req, res) => {
  try {
    const {
      name,
      value,
      type = "percent",
      scope = "order",
      isStackable = false,
      requiresApproval = false,
      isActive = true,
    } = req.body;

    if (!name || typeof value !== "number") {
      return res.status(400).json({ error: "name and numeric value are required" });
    }

    const countersRef = db.collection("_meta").doc("counters");

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(countersRef);
      if (!snap.exists) {
        tx.set(countersRef, { discountsSeq: 0 }, { merge: true });
      }
      const current = (snap.data()?.discountsSeq ?? 0) + 1;
      tx.update(countersRef, { discountsSeq: FieldValue.increment(1) });

      const code = formatDiscCode(current);
      const discRef = db.collection("discounts").doc(code);

      const exists = await tx.get(discRef);
      if (exists.exists) throw new Error("Code collision, retry");

      tx.set(discRef, {
        code,
        name: name.trim(),
        type,
        value,
        scope,
        isStackable,
        requiresApproval,
        isActive,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { code };
    });

    res.status(201).json({ ok: true, code: result.code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/discounts/:code
router.patch("/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const patch = { ...req.body, updatedAt: FieldValue.serverTimestamp() };
    await db.collection("discounts").doc(code).set(patch, { merge: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/discounts/:code
router.delete("/:code", async (req, res) => {
  try {
    await db.collection("discounts").doc(req.params.code).delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/discounts:bulkDelete
router.post(":bulkDelete", async (req, res) => {
  try {
    const { codes = [] } = req.body;
    const batch = db.batch();
    codes.forEach((c) => batch.delete(db.collection("discounts").doc(c)));
    await batch.commit();
    res.json({ ok: true, count: codes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;