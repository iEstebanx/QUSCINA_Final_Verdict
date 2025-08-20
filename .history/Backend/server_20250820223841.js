// server.js
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Firebase Admin init ---
/*
  Option A (recommended): set GOOGLE_APPLICATION_CREDENTIALS to the path
  of your service-account JSON (never commit this file).
  Or Option B below to load from env var string.
*/
if (!admin.apps.length) {
  if (process.env.FB_ADMIN_JSON) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FB_ADMIN_JSON)),
    });
  } else {
    admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
  }
}
const db = admin.firestore();

// List
app.get("/api/discounts", async (_req, res) => {
  const snap = await db.collection("discounts").orderBy("createdAt", "desc").get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  res.json(items);
});

// Create (doc id = code)
app.post("/api/discounts", async (req, res) => {
  try {
    const { code, name, type = "percent", value, scope = "order",
            isStackable = false, requiresApproval = false, isActive = true } = req.body;

    if (!code || !name || typeof value !== "number") {
      return res.status(400).json({ error: "code, name, value required" });
    }

    const ref = db.collection("discounts").doc(code);
    const exists = await ref.get();
    if (exists.exists) return res.status(409).json({ error: "Code exists" });

    await ref.set({
      code, name, type, value, scope,
      isStackable, requiresApproval, isActive,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: false });

    res.status(201).json({ ok: true, id: code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update (partial)
app.patch("/api/discounts/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const patch = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    await db.collection("discounts").doc(code).set(patch, { merge: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete one
app.delete("/api/discounts/:code", async (req, res) => {
  try {
    await db.collection("discounts").doc(req.params.code).delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk delete
app.post("/api/discounts:bulkDelete", async (req, res) => {
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));