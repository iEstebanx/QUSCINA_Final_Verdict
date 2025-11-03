// Backend/src/routes/Discounts/discounts.js
const express = require("express");

let sharedDb = null;
try { sharedDb = require("../../shared/db/mysql").db; } catch {}

function formatDiscCode(n) {
  return `DISC-${String(n).padStart(6, "0")}`;
}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  // GET /api/discounts
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, code, name, type,
                CAST(value AS DOUBLE) AS value,
                scope, isStackable, requiresApproval, isActive,
                createdAt, updatedAt
           FROM discounts
          ORDER BY createdAt DESC`
      );
      // Safety: ensure JS numbers
      rows.forEach(r => { r.value = Number(r.value); });
      res.json(rows);
    } catch (e) {
      console.error("[GET /api/discounts] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  // POST /api/discounts  (no counters; build code from insertId)
  router.post("/", async (req, res) => {
    try {
      const {
        name,
        value,
        type = "percent",
        scope = "order",
        isStackable = false,
        requiresApproval = false,
        isActive = true
      } = req.body || {};

      const numValue = Number(value);
      if (!name || !Number.isFinite(numValue)) {
        return res.status(400).json({ error: "name and numeric value are required" });
      }

      const now = new Date();

      // 1) Insert with code = NULL (valid under UNIQUE)
      const result = await db.query(
        `INSERT INTO discounts
           (code, name, type, value, scope, isStackable, requiresApproval, isActive, createdAt, updatedAt)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(name).trim(),
          type,
          numValue,
          scope,
          isStackable ? 1 : 0,
          requiresApproval ? 1 : 0,
          isActive ? 1 : 0,
          now,
          now
        ]
      );

      const insertId = result.insertId; // mysql2 OkPacket
      const code = formatDiscCode(insertId);

      // 2) Set the final code derived from id
      await db.query(`UPDATE discounts SET code = ? WHERE id = ?`, [code, insertId]);

      res.status(201).json({ ok: true, code });
    } catch (e) {
      console.error("[POST /api/discounts] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  // PATCH /api/discounts/:code
  router.patch("/:code", async (req, res) => {
    try {
      const { code } = req.params;
      if (!code) return res.status(400).json({ error: "invalid code" });

      const patch = { ...req.body };
      const allowed = [
        "name", "type", "value", "scope",
        "isStackable", "requiresApproval", "isActive"
      ];
      const sets = [];
      const params = [];

      for (const k of allowed) {
        if (k in patch) {
          sets.push(`${k} = ?`);
          if (["isStackable", "requiresApproval", "isActive"].includes(k)) {
            params.push(patch[k] ? 1 : 0);
          } else {
            params.push(patch[k]);
          }
        }
      }
      sets.push("updatedAt = ?"); params.push(new Date());

      if (sets.length === 1) {
        return res.status(400).json({ error: "no valid fields to update" });
      }

      params.push(code);
      await db.query(`UPDATE discounts SET ${sets.join(", ")} WHERE code = ?`, params);
      res.json({ ok: true });
    } catch (e) {
      console.error("[PATCH /api/discounts/:code] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  // DELETE /api/discounts/:code
  router.delete("/:code", async (req, res) => {
    try {
      await db.query(`DELETE FROM discounts WHERE code = ?`, [req.params.code]);
      res.json({ ok: true });
    } catch (e) {
      console.error("[DELETE /api/discounts/:code] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  // POST /api/discounts/bulkDelete
  router.post("/bulkDelete", async (req, res) => {
    try {
      const { codes = [] } = req.body || {};
      const list = Array.isArray(codes) ? codes.filter(v => v !== null && v !== undefined) : [];
      if (!list.length) return res.status(400).json({ error: "codes array required" });

      const ids = [];
      const stringCodes = [];
      for (const v of list) {
        const s = String(v);
        if (/^\d+$/.test(s)) ids.push(Number(s));        // numeric id
        else stringCodes.push(s);                        // code like DISC-000010
      }

      if (ids.length) {
        const ph = ids.map(() => "?").join(",");
        await db.query(`DELETE FROM discounts WHERE id IN (${ph})`, ids);
      }
      if (stringCodes.length) {
        const ph = stringCodes.map(() => "?").join(",");
        await db.query(`DELETE FROM discounts WHERE code IN (${ph})`, stringCodes);
      }

      res.json({ ok: true, count: list.length });
    } catch (e) {
      console.error("[POST /api/discounts/bulkDelete] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  return router;
};