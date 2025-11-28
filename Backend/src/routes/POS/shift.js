// QUSCINA_BACKOFFICE/Backend/src/routes/POS/shift.js
const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../../auth/requireAuth");

const DEBUG_POS = process.env.DEBUG_POS === "1";

module.exports = function posShiftRouterFactory({ db }) {
  if (!db) {
    throw new Error("[POS shift] DB pool/wrapper is required");
  }

  const router = express.Router();

  // body parsing
  router.use(express.json({ limit: "2mb" }));
  router.use(express.urlencoded({ extended: true }));

  // ---------- schemas ----------
  const OpenBody = z.object({
    terminal_id: z.coerce.string().trim().min(1).default("TERMINAL-1"),
    opening_float: z.coerce.number().nonnegative().default(0),
    denominations: z
      .array(
        z.object({
          denom_value: z.coerce.number().nonnegative(),
          qty: z.coerce.number().int().nonnegative(),
        })
      )
      .optional()
      .default([]),
    note: z.coerce.string().trim().max(255).optional(),
  });

  // close shift body
  const CloseBody = z.object({
    terminal_id: z.coerce.string().trim().min(1).default("TERMINAL-1"),
    declared_cash: z.coerce.number().nonnegative().optional(),
    note: z.coerce.string().trim().max(255).optional(),
  });

  // ---------- POST /pos/shift/open ----------
  router.post("/open", requireAuth, async (req, res) => {
    let body;
    try {
      body = OpenBody.parse(req.body || {});
    } catch (e) {
      const first = e?.issues?.[0];
      return res.status(400).json({
        ok: false,
        error: `${first?.path?.join(".") || "field"}: ${first?.message}`,
      });
    }

    const { terminal_id, opening_float, denominations = [], note } = body;

    const employeeId =
      req.user?.employeeId || req.user?.sub || req.user?.id || null;

    if (!employeeId) {
      return res
        .status(400)
        .json({ ok: false, error: "Authenticated employee not found" });
    }

    const KNOWN_DENOMS = [1, 5, 10, 20, 50, 100, 200, 500, 1000];

    try {
      if (typeof db.tx !== "function") {
        throw new Error("db.tx helper is not available");
      }

      const { shift, inserted } = await db.tx(async (conn) => {
      // 0) STRICT: block opening if ANY shift in the system is already open
      const [globalRows] = await conn.query(
        `
        SELECT 
          s.shift_id,
          s.terminal_id,
          s.employee_id,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.username  AS employee_username,
          e.email     AS employee_email
        FROM pos_shifts s
        LEFT JOIN employees e 
          ON e.employee_id = s.employee_id
        WHERE LOWER(s.status) = 'open'
        ORDER BY s.opened_at DESC, s.shift_id DESC
        LIMIT 1
        `
      );

      if (Array.isArray(globalRows) && globalRows.length > 0) {
        const holder = globalRows[0];

        const displayName =
          holder.employee_name ||
          holder.employee_username ||
          holder.employee_email ||
          `Employee #${holder.employee_id}`;

        const err = new Error(
          `Shift already open on ${holder.terminal_id} by ${displayName}`
        );
        err.status = 409;
        err.code = "SHIFT_ALREADY_OPEN_GLOBAL";
        err.holder = {
          terminal_id: holder.terminal_id,
          shift_id: holder.shift_id,
          employee_id: holder.employee_id,
          employee_name: displayName,
        };
        throw err;
      }

        // 1) prevent duplicate open shift for same user + terminal
        const [existingRows] = await conn.query(
          `
          SELECT shift_id
          FROM pos_shifts
          WHERE employee_id = ?
            AND terminal_id = ?
            AND LOWER(status) = 'open'
          LIMIT 1
          `,
          [employeeId, terminal_id]
        );

        if (Array.isArray(existingRows) && existingRows.length > 0) {
          const err = new Error("Shift already open");
          err.status = 409;
          err.code = "SHIFT_ALREADY_OPEN_SAME_TERMINAL";
          throw err;
        }

        // 2) insert main shift record
        //    status ENUM('Open','Remitted','Voided')  -> use 'Open'
        const [ins] = await conn.query(
          `
          INSERT INTO pos_shifts (
            terminal_id,
            employee_id,
            status,
            opened_at,
            opening_float,
            opening_note
          )
          VALUES (?, ?, 'Open', NOW(), ?, ?)
          `,
          [terminal_id, employeeId, opening_float, note || null]
        );

        const shiftId = ins.insertId;

        // 3) normalize denomination payload
        const qtyMap = new Map();
        for (const d of denominations || []) {
          const v = Number(d?.denom_value);
          const q = Number.isFinite(Number(d?.qty)) ? Number(d.qty) : 0;
          if (Number.isFinite(v) && v >= 0 && Number.isInteger(q) && q >= 0) {
            qtyMap.set(v, q);
          }
        }

        const inserted = [];

        // 4) insert denom breakdown (optional – never block the shift)
        try {
          for (const val of KNOWN_DENOMS) {
            const qty = qtyMap.get(val) ?? 0;
            await conn.query(
              `
              INSERT INTO pos_shift_denoms (shift_id, denom_value, qty)
              VALUES (?, ?, ?)
              `,
              [shiftId, val, qty]
            );
            inserted.push({ denom_value: val, qty });
          }
        } catch (e) {
          console.warn(
            "[POS shift] denom breakdown insert failed, continuing without breakdown:",
            e
          );
        }

        const [rows] = await conn.query(
          `SELECT * FROM pos_shifts WHERE shift_id = ?`,
          [shiftId]
        );
        const shift = rows[0] || null;

        return { shift, inserted };
      });

      if (DEBUG_POS) {
        console.log("[Backoffice POS] opened shift:", shift?.shift_id, {
          terminal_id,
          employeeId,
          opening_float,
          denoms_inserted: inserted,
        });
      }

      return res
        .status(201)
        .json({ ok: true, shift, denoms_inserted: inserted });
    } catch (err) {
      console.error("[POS shift] POST /pos/shift/open failed:", err);
      return res.status(err.status || 500).json({
        ok: false,
        error: err?.message || "Failed to open shift",
        code: err?.code || undefined,
        holder: err?.holder || undefined, // contains terminal + employee info when blocked
      });
    }
  });

  // ---------- GET /pos/shift/latest-open ----------
  router.get("/latest-open", requireAuth, async (req, res) => {
    try {
      const employeeId =
        req.user?.employeeId || req.user?.sub || req.user?.id || null;

      if (!employeeId) {
        return res
          .status(400)
          .json({ ok: false, error: "Authenticated employee not found" });
      }

      const terminalId = String(
        req.query.terminal_id || "TERMINAL-1"
      ).trim();

      const sql = `
        SELECT *
        FROM pos_shifts
        WHERE employee_id = ?
          AND terminal_id = ?
          AND LOWER(status) = 'open'
        ORDER BY opened_at DESC
        LIMIT 1
      `;

      const rows = await db.query(sql, [employeeId, terminalId]);
      const shift = (rows && rows[0]) || null;

      return res.json({ ok: true, shift });
    } catch (err) {
      console.error("[POS shift] GET /pos/shift/latest-open failed:", err);
      return res.status(500).json({
        ok: false,
        error: DEBUG_POS ? err.message : "Failed to load latest open shift",
      });
    }
  });

  // ---------- POST /pos/shift/close ----------
  router.post("/close", requireAuth, async (req, res) => {
    let body;
    try {
      body = CloseBody.parse(req.body || {});
    } catch (e) {
      const first = e?.issues?.[0];
      return res.status(400).json({
        ok: false,
        error: `${first?.path?.join(".") || "field"}: ${first?.message}`,
      });
    }

    const { terminal_id, declared_cash, note } = body;

    const employeeId =
      req.user?.employeeId || req.user?.sub || req.user?.id || null;

    if (!employeeId) {
      return res
        .status(400)
        .json({ ok: false, error: "Authenticated employee not found" });
    }

    try {
      if (typeof db.tx !== "function") {
        throw new Error("db.tx helper is not available");
      }

      const shift = await db.tx(async (conn) => {
        // 1) find latest open shift for this employee + terminal
        const [rows] = await conn.query(
          `
          SELECT shift_id
          FROM pos_shifts
          WHERE employee_id = ?
            AND terminal_id = ?
            AND LOWER(status) = 'open'
          ORDER BY opened_at DESC
          LIMIT 1
          `,
          [employeeId, terminal_id]
        );

        if (!Array.isArray(rows) || rows.length === 0) {
          const err = new Error("No open shift found for this terminal");
          err.status = 404;
          err.code = "NO_OPEN_SHIFT";
          throw err;
        }

        const shiftId = rows[0].shift_id;

        // 2) rich update using your actual columns
        //    status ENUM('Open','Remitted','Voided')
        //    declared_cash, variance_cash, closing_note
        try {
          await conn.query(
            `
            UPDATE pos_shifts
            SET status = 'Remitted',
                closed_at = NOW(),
                closing_note = COALESCE(?, closing_note),
                declared_cash = COALESCE(?, declared_cash),
                variance_cash = COALESCE(?, declared_cash) - expected_cash
            WHERE shift_id = ?
            `,
            [
              note || null,
              declared_cash != null ? declared_cash : null,
              declared_cash != null ? declared_cash : null,
              shiftId,
            ]
          );
        } catch (e) {
          // if something fails, do a minimal "close" that still uses valid ENUM
          console.warn(
            "[POS shift] rich close update failed, falling back to minimal:",
            e.message
          );
          await conn.query(
            `
            UPDATE pos_shifts
            SET status = 'Remitted',
                closed_at = NOW()
            WHERE shift_id = ?
            `,
            [shiftId]
          );
        }

        const [afterRows] = await conn.query(
          `SELECT * FROM pos_shifts WHERE shift_id = ?`,
          [shiftId]
        );
        return afterRows[0] || null;
      });

      if (DEBUG_POS) {
        console.log("[Backoffice POS] closed shift:", shift?.shift_id, {
          terminal_id,
          employeeId,
          declared_cash,
        });
      }

      return res.json({ ok: true, shift });
    } catch (err) {
      console.error("[POS shift] POST /pos/shift/close failed:", err);
      return res.status(err.status || 500).json({
        ok: false,
        error: err?.message || "Failed to close shift",
        code: err?.code || undefined,
      });
    }
  });

  return router;
};