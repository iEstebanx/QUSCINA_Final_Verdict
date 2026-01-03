// QUSCINA_BACKOFFICE/Backend/src/routes/POS/shift.js
const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../../auth/requireAuth");

const DEBUG_POS = process.env.DEBUG_POS === "1";

module.exports = function posShiftRouterFactory({ db }) {
  if (!db) throw new Error("[POS shift] DB pool/wrapper is required");

  const router = express.Router();

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

    // ✅ shift template metadata (same as cashier)
    shift_code: z.coerce.string().trim().max(20).optional(),
    shift_name: z.coerce.string().trim().max(60).optional(),
    scheduled_start: z.coerce.string().trim().max(5).optional(), // "HH:mm"
    scheduled_end: z.coerce.string().trim().max(5).optional(),   // "HH:mm"
    opened_early: z.coerce.number().int().optional().default(0),
    early_minutes: z.coerce.number().int().optional().default(0),
    early_reason: z.coerce.string().trim().max(255).nullable().optional(),
    early_note: z.coerce.string().trim().max(255).nullable().optional(),
  });

  const CashMoveBody = z.object({
    shift_id: z.coerce.number().int().positive(),
    type: z.enum(["cash_in", "cash_out", "safe_drop", "payout", "refund_cash"]),
    amount: z.coerce.number().positive(),
    reason: z.coerce.string().trim().max(255).optional(),
    denominations: z
      .array(
        z.object({
          denom_value: z.coerce.number().nonnegative(),
          qty: z.coerce.number().int().nonnegative(),
        })
      )
      .optional()
      .default([]),
  });

  const RemitBody = z.object({
    declared_cash: z.coerce.number().nonnegative(),
    closing_note: z.coerce.string().trim().max(255).optional(),

    cart_item_count: z.coerce.number().int().nonnegative().optional().default(0),
  });

  // ---------- helpers ----------
  const KNOWN_DENOMS = [1, 5, 10, 20, 50, 100, 200, 500, 1000];

  function getEmployeeId(req) {
    return req.user?.employeeId || req.user?.sub || req.user?.id || null;
  }

  async function hasPendingOrdersForShift(conn, shiftId) {
    const [rows] = await conn.execute(
      `
      SELECT 1
      FROM pos_orders
      WHERE shift_id = ?
        AND status IN ('Pending', 'Open')
      LIMIT 1
      `,
      [shiftId]
    );
    return rows.length > 0;
  }

  async function getOpenShiftForUser(connOrDb, employeeId, terminalId) {
    const sql = `
      SELECT * FROM pos_shifts
      WHERE employee_id = ? AND terminal_id = ? AND status = 'Open'
      ORDER BY opened_at DESC, shift_id DESC
      LIMIT 1
    `;
    if (connOrDb.execute) {
      const [rows] = await connOrDb.execute(sql, [employeeId, terminalId]);
      return rows?.[0] || null;
    }
    const rows = await connOrDb.query(sql, [employeeId, terminalId]);
    return rows?.[0] || null;
  }

  async function computeExpectedCash(conn, shiftId, openingFloat) {
    let cashPayments = 0;
    let cashRefunds = 0;

    // payments from pos_order_payments (if exists)
    try {
      const [rows] = await conn.execute(
        `
        SELECT
          COALESCE(SUM(CASE
            WHEN is_refund = 0 AND LOWER(method_name) LIKE '%cash%'
            THEN amount ELSE 0 END), 0) AS cash_payments,
          COALESCE(SUM(CASE
            WHEN is_refund = 1 AND LOWER(method_name) LIKE '%cash%'
            THEN amount ELSE 0 END), 0) AS cash_refunds
        FROM pos_order_payments
        WHERE shift_id = ?
        `,
        [shiftId]
      );
      cashPayments = Number(rows?.[0]?.cash_payments || 0);
      cashRefunds = Number(rows?.[0]?.cash_refunds || 0);
    } catch (err) {
      if (err.code === "ER_NO_SUCH_TABLE") {
        if (DEBUG_POS) console.warn("[computeExpectedCash] pos_order_payments missing");
      } else {
        throw err;
      }
    }

    // cash moves from pos_cash_moves
    const [moveRows] = await conn.execute(
      `
      SELECT
        COALESCE(SUM(CASE WHEN type='cash_in'     THEN amount END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN type='cash_out'    THEN amount END), 0) AS cash_out,
        COALESCE(SUM(CASE WHEN type='safe_drop'   THEN amount END), 0) AS safe_drop,
        COALESCE(SUM(CASE WHEN type='payout'      THEN amount END), 0) AS payout,
        COALESCE(SUM(CASE WHEN type='refund_cash' THEN amount END), 0) AS refund_cash_moves
      FROM pos_cash_moves
      WHERE shift_id = ?
      `,
      [shiftId]
    );

    const mv = moveRows?.[0] || {};
    const totalCashIn = Number(mv.cash_in || 0);
    const totalCashOut = Number(mv.cash_out || 0);
    const totalSafeDrop = Number(mv.safe_drop || 0);
    const totalPayout = Number(mv.payout || 0);
    const refundMoves = Number(mv.refund_cash_moves || 0);

    const expected =
      Number(openingFloat) +
      cashPayments +
      totalCashIn -
      totalCashOut -
      cashRefunds -
      refundMoves -
      totalSafeDrop -
      totalPayout;

    return {
      expected_cash: Number(expected.toFixed(2)),
      components: {
        opening_float: Number(openingFloat),
        cash_payments: cashPayments,
        cash_refunds: cashRefunds + refundMoves,
        cash_in: totalCashIn,
        cash_out: totalCashOut,
        safe_drop: totalSafeDrop,
        payout: totalPayout,
      },
    };
  }

  // ---------- routes ----------

  // GET current open shift (user + terminal)
  router.get("/me/open", requireAuth, async (req, res) => {
    const employeeId = getEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "Authenticated employee not found" });

    const terminalId = String(req.query.terminal_id || "").trim();
    if (!terminalId) return res.status(400).json({ ok: false, error: "terminal_id required" });

    try {
      const shift = await getOpenShiftForUser(db, employeeId, terminalId);
      return res.json({ ok: true, shift: shift || null });
    } catch (e) {
      console.error("[shift/me/open]", e);
      return res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  });

  // POST open shift (terminal-only single open shift)
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

    const employeeId = getEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "Authenticated employee not found" });

    const {
      terminal_id,
      opening_float,
      denominations = [],
      note,
      shift_code,
      shift_name,
      scheduled_start,
      scheduled_end,
      opened_early,
      early_minutes,
      early_reason,
      early_note,
    } = body;

    try {
      const result = await db.tx(async (conn) => {
        // 0) GLOBAL CHECK: block if there is already an Open shift on THIS terminal
        const [globalRows] = await conn.execute(
          `
          SELECT
            s.shift_id,
            s.terminal_id,
            s.employee_id,
            CONCAT(e.first_name,' ',e.last_name) AS employee_name,
            e.username AS employee_username,
            e.email AS employee_email
          FROM pos_shifts s
          LEFT JOIN employees e ON e.employee_id = s.employee_id
          WHERE s.status = 'Open' AND s.terminal_id = ?
          ORDER BY s.opened_at DESC, s.shift_id DESC
          LIMIT 1
          `,
          [terminal_id]
        );

        if (Array.isArray(globalRows) && globalRows.length > 0) {
          const holder = globalRows[0];
          const displayName =
            holder.employee_name ||
            holder.employee_username ||
            holder.employee_email ||
            `Employee #${holder.employee_id}`;

          const err = new Error(
            `A shift is already open on ${holder.terminal_id} for ${displayName}. ` +
              `Please remit/close the current shift first.`
          );
          err.status = 409;
          err.code = "SHIFT_ALREADY_OPEN_ON_TERMINAL";
          err.holder = {
            terminal_id: holder.terminal_id,
            shift_id: holder.shift_id,
            employee_id: holder.employee_id,
            employee_name: displayName,
          };
          throw err;
        }

        // 1) PER-USER + TERMINAL check (safety)
        const [existing] = await conn.execute(
          `SELECT shift_id FROM pos_shifts WHERE employee_id = ? AND terminal_id = ? AND status='Open' LIMIT 1`,
          [employeeId, terminal_id]
        );
        if (existing.length) {
          const err = new Error(
            "You already have an active shift on this terminal. Please remit/close it first."
          );
          err.status = 409;
          err.code = "SHIFT_ALREADY_OPEN_SAME_TERMINAL";
          throw err;
        }

        // 2) insert shift
        const [ins] = await conn.execute(
          `
          INSERT INTO pos_shifts (
            terminal_id, employee_id, status,
            opened_at,
            opening_float, opening_note,
            shift_code, shift_name, scheduled_start, scheduled_end,
            opened_early, early_minutes, early_reason, early_note
          ) VALUES (
            ?, ?, 'Open',
            NOW(),
            ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?
          )
          `,
          [
            terminal_id,
            employeeId,
            opening_float,
            note || null,
            shift_code || null,
            shift_name || null,
            scheduled_start || null,
            scheduled_end || null,
            Number(opened_early || 0),
            Number(early_minutes || 0),
            early_reason ?? null,
            early_note ?? null,
          ]
        );

        const shiftId = ins.insertId;

        // normalize denom payload
        const qtyMap = new Map();
        for (const d of denominations || []) {
          const v = Number(d?.denom_value);
          const q = Number.isFinite(Number(d?.qty)) ? Number(d.qty) : 0;
          if (Number.isFinite(v) && v >= 0 && Number.isInteger(q) && q >= 0) {
            qtyMap.set(v, q);
          }
        }

        // insert denom breakdown
        const inserted = [];
        for (const val of KNOWN_DENOMS) {
          const qty = qtyMap.get(val) ?? 0;
          await conn.execute(
            `INSERT INTO pos_shift_denoms (shift_id, denom_value, qty) VALUES (?,?,?)`,
            [shiftId, val, qty]
          );
          inserted.push({ denom_value: val, qty });
        }

        const [row] = await conn.execute(`SELECT * FROM pos_shifts WHERE shift_id = ?`, [shiftId]);
        return { shift: row?.[0] || null, denoms_inserted: inserted };
      });

      return res.status(201).json({ ok: true, shift: result.shift, denoms_inserted: result.denoms_inserted });
    } catch (err) {
      console.error("[POS shift] POST /open failed:", err);
      return res.status(err.status || 500).json({
        ok: false,
        error: err.message || "Failed to open shift",
        code: err.code || undefined,
        holder: err.holder || undefined,
      });
    }
  });

  // POST cash-move (INSUFFICIENT_CASH protection for cash_out)
  router.post("/cash-move", requireAuth, async (req, res) => {
    let body;
    try {
      body = CashMoveBody.parse(req.body || {});
    } catch (e) {
      const first = e?.issues?.[0];
      return res.status(400).json({ ok: false, error: `${first?.path?.join(".")} : ${first?.message}` });
    }

    const employeeId = getEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "Authenticated employee not found" });

    const { shift_id, type, amount, reason, denominations = [] } = body;

    try {
      const result = await db.tx(async (conn) => {
        const [rows] = await conn.execute(`SELECT * FROM pos_shifts WHERE shift_id = ? LIMIT 1`, [shift_id]);
        const sh = rows?.[0];
        if (!sh) throw Object.assign(new Error("Shift not found"), { status: 404 });
        if (sh.status !== "Open") throw Object.assign(new Error("Shift not open"), { status: 409 });

        const { expected_cash } = await computeExpectedCash(conn, shift_id, sh.opening_float);

        if (type === "cash_out" && Number(amount) > Number(expected_cash)) {
          const err = new Error("Insufficient cash in drawer for cash out");
          err.status = 409;
          err.code = "INSUFFICIENT_CASH";
          err.expected_cash = expected_cash;
          throw err;
        }

        const [ins] = await conn.execute(
          `INSERT INTO pos_cash_moves (shift_id, type, amount, reason, created_by) VALUES (?,?,?,?,?)`,
          [shift_id, type, amount, reason || null, employeeId]
        );
        const moveId = ins.insertId;

        for (const d of denominations) {
          if (!Number.isFinite(Number(d?.denom_value)) || Number(d?.qty) <= 0) continue;
          await conn.execute(
            `INSERT INTO pos_cash_move_denoms (move_id, denom_value, qty) VALUES (?,?,?)`,
            [moveId, Number(d.denom_value), Number(d.qty)]
          );
        }

        return { move_id: moveId, expected_cash_before: expected_cash };
      });

      return res.status(201).json({ ok: true, ...result });
    } catch (err) {
      console.error("[shift/cash-move]", err);
      return res.status(err.status || 500).json({
        ok: false,
        error: err.message || "Internal Server Error",
        code: err.code || null,
        expected_cash: typeof err.expected_cash === "number" ? err.expected_cash : undefined,
      });
    }
  });

  // GET cash moves + denoms for a shift
  router.get("/:id/cash-moves", requireAuth, async (req, res) => {
    const shiftId = Number(req.params.id || 0);
    if (!shiftId) return res.status(400).json({ ok: false, error: "Invalid shift id" });

    try {
      const moves = await db.query(
        `SELECT m.move_id, m.shift_id, m.type, m.amount, m.reason, m.created_by, m.created_at
           FROM pos_cash_moves m
          WHERE m.shift_id = ?
          ORDER BY m.created_at DESC, m.move_id DESC`,
        [shiftId]
      );

      if (!moves || moves.length === 0) return res.json({ ok: true, items: [] });

      try {
        const rows = await db.query(
          `SELECT
             m.move_id, m.shift_id, m.type, m.amount, m.reason, m.created_by, m.created_at,
             d.denom_value AS d_value, d.qty AS d_qty
           FROM pos_cash_moves m
           LEFT JOIN pos_cash_move_denoms d ON d.move_id = m.move_id
          WHERE m.shift_id = ?
          ORDER BY m.created_at DESC, m.move_id DESC, d.denom_value DESC`,
          [shiftId]
        );

        const byMove = new Map();
        for (const r of rows) {
          if (!byMove.has(r.move_id)) {
            byMove.set(r.move_id, {
              move_id: r.move_id,
              shift_id: r.shift_id,
              type: r.type,
              amount: Number(r.amount),
              reason: r.reason || null,
              created_by: r.created_by,
              created_at: r.created_at,
              denominations: [],
            });
          }
          if (r.d_value != null && r.d_qty != null) {
            byMove.get(r.move_id).denominations.push({
              denom_value: Number(r.d_value),
              qty: Number(r.d_qty),
            });
          }
        }

        return res.json({ ok: true, items: Array.from(byMove.values()) });
      } catch (joinErr) {
        if (joinErr?.code === "ER_NO_SUCH_TABLE") {
          return res.json({
            ok: true,
            items: moves.map((m) => ({
              move_id: m.move_id,
              shift_id: m.shift_id,
              type: m.type,
              amount: Number(m.amount),
              reason: m.reason || null,
              created_by: m.created_by,
              created_at: m.created_at,
              denominations: [],
            })),
          });
        }
        throw joinErr;
      }
    } catch (e) {
      console.error("[shift/cash-moves] ERROR:", e?.code, e?.sqlMessage || e?.message);
      return res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  });

  // GET summary
  router.get("/:id/summary", requireAuth, async (req, res) => {
    const shiftId = Number(req.params.id || 0);
    if (!shiftId) return res.status(400).json({ ok: false, error: "Invalid shift id" });

    try {
      const shiftRows = await db.query(`SELECT * FROM pos_shifts WHERE shift_id = ?`, [shiftId]);
      const shift = shiftRows?.[0];
      if (!shift) return res.status(404).json({ ok: false, error: "Shift not found" });

      const expected = await db.tx(async (conn) => computeExpectedCash(conn, shiftId, shift.opening_float));

      // payment summary (optional)
      let paymentSummary = [];
      try {
        const payRows = await db.query(
          `SELECT
             pt.name AS method_name,
             COALESCE(SUM(CASE WHEN p.is_refund = 0 THEN p.amount ELSE 0 END), 0) AS total_sales,
             COALESCE(SUM(CASE WHEN p.is_refund = 1 THEN p.amount ELSE 0 END), 0) AS total_refunds
           FROM payment_types pt
           LEFT JOIN pos_order_payments p
             ON p.shift_id = ? AND p.method_name = pt.name
           WHERE pt.active = 1
           GROUP BY pt.id, pt.name, pt.sort_order
           ORDER BY pt.sort_order, pt.name`,
          [shiftId]
        );

        paymentSummary = payRows.map((r) => {
          const sales = Number(r.total_sales || 0);
          const refunds = Number(r.total_refunds || 0);
          return {
            method_name: r.method_name,
            total_sales: sales,
            total_refunds: refunds,
            net_amount: Number((sales - refunds).toFixed(2)),
          };
        });
      } catch (e2) {
        if (DEBUG_POS) console.warn("[shift/summary] paymentSummary error:", e2?.message);
      }

      let refundTotal = 0;
      try {
        const refundRows = await db.query(
          `SELECT COALESCE(SUM(amount), 0) AS total_refunds
             FROM pos_order_payments
            WHERE shift_id = ? AND is_refund = 1`,
          [shiftId]
        );
        refundTotal = Number(refundRows?.[0]?.total_refunds || 0);
      } catch (e2) {
        refundTotal = 0;
      }

      const grossSales = Number(shift.total_gross_sales || 0);
      const discountTotal = Number(shift.total_discounts || 0);

      return res.json({
        ok: true,
        shift: {
          shift_id: shift.shift_id,
          terminal_id: shift.terminal_id,
          employee_id: shift.employee_id,
          opened_at: shift.opened_at,
          status: shift.status,
        },
        cash_drawer: {
          ...expected.components,
          expected_cash: expected.expected_cash,
        },
        sales_summary: {
          gross_sales: grossSales,
          refunds: refundTotal,
          discounts: discountTotal,
          taxes: Number(shift.total_tax || 0),
          cash: Number(shift.total_cash_payments || 0),
          card: Number(shift.total_card_payments || 0),
          online: Number(shift.total_online_payments || 0),
          net_sales: grossSales - refundTotal - discountTotal,
        },
        payment_summary: paymentSummary,
      });
    } catch (e) {
      console.error("[shift/summary]", e);
      return res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  });

  // POST remit/close shift
  router.post("/:id/remit", requireAuth, async (req, res) => {
    const shiftId = Number(req.params.id || 0);
    if (!shiftId) return res.status(400).json({ ok: false, error: "Invalid shift id" });

    let body;
    try {
      body = RemitBody.parse(req.body || {});
    } catch (e) {
      const first = e?.issues?.[0];
      return res.status(400).json({
        ok: false,
        error: `${first?.path?.join(".") || "field"}: ${first?.message}`,
      });
    }

    const { declared_cash, closing_note, cart_item_count } = body;

    try {
      const result = await db.tx(async (conn) => {
        const [rows] = await conn.execute(`SELECT * FROM pos_shifts WHERE shift_id = ? LIMIT 1`, [shiftId]);
        const shift = rows?.[0];
        if (!shift) throw Object.assign(new Error("Shift not found"), { status: 404 });
        if (shift.status !== "Open") throw Object.assign(new Error("Shift is not open"), { status: 409 });

        if (Number(cart_item_count || 0) > 0) {
          const err = new Error(
            "Cannot close shift while there are items in the cart. Please save or clear the order first."
          );
          err.status = 409;
          err.code = "CANNOT_CLOSE_SHIFT_WITH_CART_ITEMS";
          err.cart_item_count = Number(cart_item_count || 0);
          throw err;
        }

        const hasPending = await hasPendingOrdersForShift(conn, shiftId);
        if (hasPending) {
          const err = new Error("Cannot close shift while there are pending orders.");
          err.status = 409;
          err.code = "CANNOT_CLOSE_SHIFT_WITH_PENDING_ORDERS";
          throw err;
        }

        const { expected_cash } = await computeExpectedCash(conn, shiftId, shift.opening_float);
        const variance = Number((declared_cash - expected_cash).toFixed(2));

        await conn.execute(
          `UPDATE pos_shifts
              SET status='Remitted',
                  closed_at = NOW(),
                  declared_cash = ?,
                  expected_cash = ?,
                  variance_cash = ?,
                  closing_note = ?
            WHERE shift_id = ?`,
          [declared_cash, expected_cash, variance, closing_note || null, shiftId]
        );

        const [updated] = await conn.execute(`SELECT * FROM pos_shifts WHERE shift_id = ?`, [shiftId]);
        return updated?.[0] || null;
      });

      return res.status(200).json({ ok: true, shift: result });
    } catch (e) {
      console.error("[shift/remit] ERROR:", e);
      return res.status(e.status || 500).json({
        ok: false,
        error: e.message || "Internal Server Error",
        code: e.code || undefined,
        cart_item_count: typeof e.cart_item_count === "number" ? e.cart_item_count : undefined,
      });
    }
  });

  // ----------------------------
  // ✅ Compatibility endpoints (optional)
  // ----------------------------

  // old: GET /latest-open -> map to /me/open
  router.get("/latest-open", requireAuth, async (req, res) => {
    const employeeId = getEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "Authenticated employee not found" });

    const terminalId = String(req.query.terminal_id || "TERMINAL-1").trim();
    try {
      const shift = await getOpenShiftForUser(db, employeeId, terminalId);
      return res.json({ ok: true, shift: shift || null });
    } catch (e) {
      console.error("[shift/latest-open]", e);
      return res.status(500).json({ ok: false, error: "Failed to load latest open shift" });
    }
  });

  // old: POST /close -> map to /:id/remit (requires shift_id in body or uses latest open)
  router.post("/close", requireAuth, async (req, res) => {
    const employeeId = getEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "Authenticated employee not found" });

    const terminalId = String(req.body?.terminal_id || "TERMINAL-1").trim();
    const declared_cash = Number(req.body?.declared_cash ?? 0);
    const closing_note = req.body?.note || req.body?.closing_note || undefined;

    try {
      const shift = await getOpenShiftForUser(db, employeeId, terminalId);
      if (!shift?.shift_id) return res.status(404).json({ ok: false, error: "No open shift found for this terminal" });
      
      const hasPending = await db.tx(async (conn) => hasPendingOrdersForShift(conn, shift.shift_id));
      if (hasPending) {
        return res.status(409).json({
          ok: false,
          code: "CANNOT_CLOSE_SHIFT_WITH_PENDING_ORDERS",
          error: "Cannot close shift while there are pending orders.",
        });
      }

      // internally call remit logic
      req.params.id = String(shift.shift_id);
      const cart_item_count = Number(req.body?.cart_item_count ?? 0);

      req.body = { declared_cash, closing_note, cart_item_count };
      return router.handle(req, res);
    } catch (e) {
      console.error("[shift/close compat]", e);
      return res.status(500).json({ ok: false, error: "Failed to close shift" });
    }
  });

  return router;
};