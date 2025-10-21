// Backend/src/routes/Inventory/inv-activity.js
const express = require("express");
const {
  db,
  FieldValue,
} = require("../../shared/firebase/firebaseAdmin");

const router = express.Router();
const COLL = "inventory_activity";
const ING_COLL = "inventory_ingredients";

/**
 * GET /api/inventory/inv-activity?limit=1000
 * Returns rows sorted newest-first by createdAt / ts.
 */
router.get("/", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit || "200", 10)));
    // Try to order by ts if present, otherwise createdAt
    const snap = await db.collection(COLL).orderBy("ts", "desc").limit(limit).get();
    // If the collection doesn't have ts on docs, fallback: read unsorted and sort in memory
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // If ts is missing for some docs, normalize to createdAt
    rows = rows.map((r) => {
      if (!r.ts && r.createdAt && typeof r.createdAt.toDate === "function") {
        r.ts = r.createdAt.toDate().toISOString();
      } else if (!r.ts && r.createdAt && typeof r.createdAt === "string") {
        r.ts = r.createdAt;
      }
      return r;
    });

    // ensure newest-first sort by ts fallback
    rows.sort((a, b) => {
      const ta = a.ts ? new Date(a.ts).getTime() : 0;
      const tb = b.ts ? new Date(b.ts).getTime() : 0;
      return tb - ta;
    });

    res.json({ ok: true, rows });
  } catch (e) {
    // if ordering by "ts" failed (missing index or field), try an un-ordered read and sort
    try {
      const fallbackSnap = await db.collection(COLL).limit(1000).get();
      let rows = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows = rows.map((r) => {
        if (!r.ts && r.createdAt && typeof r.createdAt.toDate === "function") {
          r.ts = r.createdAt.toDate().toISOString();
        } else if (!r.ts && r.createdAt && typeof r.createdAt === "string") {
          r.ts = r.createdAt;
        }
        return r;
      });
      rows.sort((a, b) => {
        const ta = a.ts ? new Date(a.ts).getTime() : 0;
        const tb = b.ts ? new Date(b.ts).getTime() : 0;
        return tb - ta;
      });
      // apply limit from query
      const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit || "200", 10)));
      res.json({ ok: true, rows: rows.slice(0, limit) });
    } catch (err) {
      console.error("[inv-activity] list failed:", e, err);
      res.status(500).json({ ok: false, error: e.message || "List failed" });
    }
  }
});

/**
 * POST /api/inventory/inv-activity
 * Accepts: { ts?, employee?, remarks?, io: "In"|"Out", qty, price, ingredientId, ingredientName }
 * Returns: { ok: true, id, row }
 *
 * NOTE: after creating the activity row we also update the corresponding ingredient's
 * currentStock (increment/decrement) and price so the frontend reflects the new stock
 * without needing manual database edits.
 */
router.post("/", async (req, res) => {
  try {
    const payload = {
      ts: req.body?.ts ? String(req.body.ts) : FieldValue.serverTimestamp(),
      employee: String(req.body?.employee || "Chef"),
      remarks: String(req.body?.remarks || ""),
      io: String(req.body?.io || "In") === "Out" ? "Out" : "In",
      // allow decimals for qty and price (Number handles floats)
      qty: Number(req.body?.qty || 0),
      price: Number(req.body?.price || 0),
      ingredientId: req.body?.ingredientId ? String(req.body.ingredientId) : "",
      ingredientName: req.body?.ingredientName ? String(req.body.ingredientName) : "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // store; if ts is an ISO string, save it as string (we normalized above)
    const doc = {
      employee: payload.employee,
      remarks: payload.remarks,
      io: payload.io,
      qty: payload.qty,
      price: payload.price,
      ingredientId: payload.ingredientId,
      ingredientName: payload.ingredientName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    // also store ts as provided if it was a string
    if (req.body?.ts && typeof req.body.ts === "string") {
      doc.ts = req.body.ts;
    } // otherwise will rely on createdAt

    // create activity row
    const ref = await db.collection(COLL).add(doc);

    // Build row to return (server truth)
    const row = {
      id: ref.id,
      ts: doc.ts || new Date().toISOString(),
      employee: doc.employee,
      remarks: doc.remarks,
      io: doc.io,
      qty: doc.qty,
      price: doc.price,
      ingredientId: doc.ingredientId,
      ingredientName: doc.ingredientName,
    };

    // Try to update the ingredient record to reflect the stock change.
    // We do this *after* creating the activity row so we always have an activity history.
    if (payload.ingredientId) {
      try {
        // compute increment: In => +qty, Out => -qty
        const delta = payload.io === "In" ? payload.qty : -payload.qty;

        // update ingredient document atomically
        const ingRef = db.collection(ING_COLL).doc(payload.ingredientId);
        await ingRef.update({
          currentStock: FieldValue.increment(delta),
          // set price to the provided price (if any). If price is 0 and you don't want to override,
          // you can modify this logic to only update when price > 0
          price: payload.price,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (updErr) {
        // ingredient update failed (maybe wrong id) — log and continue, but don't fail the whole request
        console.warn(`[inv-activity] failed to update ingredient ${payload.ingredientId}:`, updErr && updErr.message ? updErr.message : updErr);
      }
    }

    res.status(201).json({ ok: true, id: ref.id, row });
  } catch (e) {
    console.error("[inv-activity] create failed:", e);
    res.status(500).json({ ok: false, error: e.message || "Create failed" });
  }
});

module.exports = router;