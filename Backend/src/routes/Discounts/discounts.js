// Backend/src/routes/Discounts/discounts.js
const express = require("express");

// Prefer DI, but allow fallback to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch { /* ignore until DI provides db */ }

function formatDiscCode(n) {
  const width = Math.max(6, String(n).length);
  return `DISC-${String(n).padStart(width, "0")}`;
}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  // GET /api/discounts
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, code, name, type, value, scope,
                isStackable, requiresApproval, isActive,
                createdAt, updatedAt
           FROM discounts
          ORDER BY createdAt DESC`
      );
      res.json(rows);
    } catch (e) {
      console.error("[GET /api/discounts] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
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
        isActive = true
      } = req.body || {};

      const numValue = Number(value);
      if (!name || !Number.isFinite(numValue)) {
        return res.status(400).json({ error: "name and numeric value are required" });
      }

      const result = await db.tx(async (conn) => {
        // 1) bump the counter atomically
        await conn.execute(
          `INSERT INTO _meta_counters (name, val)
           VALUES ('discountsSeq', 1)
           ON DUPLICATE KEY UPDATE val = val + 1`
        );

        const [row] = await conn.query(
          `SELECT val FROM _meta_counters WHERE name = 'discountsSeq' LIMIT 1`
        );
        const next = row?.val || 1;
        const code = formatDiscCode(next);

        const now = new Date();

        // 2) create the discount (unique code prevents collision)
        await conn.execute(
          `INSERT INTO discounts
           (code, name, type, value, scope, isStackable, requiresApproval, isActive, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            code,
            String(name).trim(),
            type,
            numValue,
            scope,
            Boolean(isStackable) ? 1 : 0,
            Boolean(requiresApproval) ? 1 : 0,
            Boolean(isActive) ? 1 : 0,
            now,
            now
          ]
        );

        return { code };
      });

      res.status(201).json({ ok: true, code: result.code });
    } catch (e) {
      console.error("[POST /api/discounts] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error", stack: String(e?.stack ?? e) });
    }
  });

  // PATCH /api/discounts/:code
  router.patch("/:code", async (req, res) => {
    try {
      const { code } = req.params;
      if (!code) return res.status(400).json({ error: "invalid code" });

      // sanitize updatable fields
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
          if (["isStackable","requiresApproval","isActive"].includes(k)) {
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

  // POST /api/discounts:bulkDelete
  router.post("/bulkDelete", async (req, res) => {
    try {
      const { codes = [] } = req.body || {};
      const list = Array.isArray(codes) ? codes.filter(Boolean) : [];
      if (!list.length) return res.status(400).json({ error: "codes array required" });

      // Use IN (...) safely
      const placeholders = list.map(() => "?").join(",");
      await db.query(`DELETE FROM discounts WHERE code IN (${placeholders})`, list);

      res.json({ ok: true, count: list.length });
    } catch (e) {
      console.error("[POST /api/discounts:bulkDelete] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  return router;
};