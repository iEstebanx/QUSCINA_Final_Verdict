// Backend/src/routes/Inventory/inv-activity.js
const express = require("express");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try { sharedDb = require("../../shared/db/mysql").db; } catch {}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  // GET /api/inventory/inv-activity?limit=1000
  router.get("/", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit || "200", 10)));

      const rows = await db.query(
        `SELECT id, ts, employee, remarks, io, qty, price, ingredientId, ingredientName, createdAt, updatedAt
          FROM inventory_activity
          ORDER BY COALESCE(ts, createdAt) DESC
          LIMIT ${limit}`
      );

      // Normalize to your previous shape
      const out = rows.map(r => ({
        id: String(r.id),
        ts: r.ts ? (typeof r.ts === "string" ? r.ts : new Date(r.ts).toISOString()) :
                   (r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString()),
        employee: r.employee,
        remarks: r.remarks,
        io: r.io,
        qty: Number(r.qty || 0),
        price: Number(r.price || 0),
        ingredientId: r.ingredientId ? String(r.ingredientId) : "",
        ingredientName: r.ingredientName || ""
      }));

      res.json({ ok: true, rows: out });
    } catch (e) {
      console.error("[inv-activity] list failed:", e);
      res.status(500).json({ ok: false, error: e.message || "List failed" });
    }
  });

  /**
   * POST /api/inventory/inv-activity
   * body: { ts?, employee?, remarks?, io: 'In'|'Out', qty, price, ingredientId, ingredientName }
   */
  router.post("/", async (req, res) => {
    try {
      const io = String(req.body?.io || "In") === "Out" ? "Out" : "In";
      const qty = Number(req.body?.qty || 0);
      const price = Number(req.body?.price || 0);
      const ingredientId = req.body?.ingredientId ? String(req.body.ingredientId) : "";
      const ingredientName = req.body?.ingredientName ? String(req.body.ingredientName) : "";
      const employee = String(req.body?.employee || "Chef");
      const remarks = String(req.body?.remarks || "");
      const tsRaw = req.body?.ts;

      // store ts if given (ISO string preferred); else null and rely on createdAt
      const tsVal = typeof tsRaw === "string" && tsRaw.trim() ? new Date(tsRaw) : null;
      const now = new Date();

      const result = await db.tx(async (conn) => {
        // 1) insert activity
        const insert = await conn.execute(
          `INSERT INTO inventory_activity
           (ts, employee, remarks, io, qty, price, ingredientId, ingredientName, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tsVal, employee, remarks, io, qty, price, ingredientId, ingredientName, now, now]
        );
        const id = insert.insertId;

        // 2) update ingredient stock (ignore if no ingredientId)
        if (ingredientId) {
          const delta = io === "In" ? qty : -qty;
          await conn.execute(
            `UPDATE inventory_ingredients
                SET currentStock = COALESCE(currentStock,0) + ?,
                    price = ?,
                    updatedAt = ?
              WHERE id = ?`,
            [delta, price, new Date(), Number(ingredientId)]
          );
        }

        return id;
      });

      const row = {
        id: String(result),
        ts: tsVal ? tsVal.toISOString() : now.toISOString(),
        employee,
        remarks,
        io,
        qty,
        price,
        ingredientId,
        ingredientName
      };

      res.status(201).json({ ok: true, id: String(result), row });
    } catch (e) {
      console.error("[inv-activity] create failed:", e);
      res.status(500).json({ ok: false, error: e.message || "Create failed" });
    }
  });

  return router;
};