// QUSCINA_BACKOFFICE/Backend/src/routes/POS/orders.js
const express = require("express");
const bcrypt = require("bcryptjs");

let logOrderAudit = async () => {};
try {
  const audit = require("../shared/audit/orderAudit");
  if (typeof audit.logOrderAudit === "function") {
    logOrderAudit = audit.logOrderAudit;
  }
} catch {
  // ok
}

// Normalize any db.query result into an array of rows
function asArray(result) {
  if (!result) return [];
  // Case 1: mysql2/promise style: [rows, fields]
  if (Array.isArray(result[0]) && result.length >= 1) {
    return result[0];
  }
  // Case 2: already rows array
  if (Array.isArray(result)) return result;
  // Fallback
  return [];
}

module.exports = function backofficePosOrdersRouterFactory({ db }) {
  if (!db) {
    throw new Error("[Backoffice POS orders] DB pool is required");
  }

  const router = express.Router();
  const APP = "Backoffice POS"; // stored in pos_orders.source

  async function ensureOpenShift(shiftId) {
    const rows = asArray(
      await db.query(
        `
        SELECT shift_id, status
        FROM pos_shifts
        WHERE shift_id = ?
        LIMIT 1
        `,
        [shiftId]
      )
    );

    if (!rows.length) {
      const err = new Error("Shift not found");
      err.code = "SHIFT_NOT_FOUND";
      throw err;
    }

    // make comparison case-insensitive so "Open", "open", "OPEN" all pass
    const status = String(rows[0].status || "").toLowerCase();
    if (status !== "open") {
      const err = new Error("Shift is not open");
      err.code = "SHIFT_NOT_OPEN";
      throw err;
    }

    return rows[0];
  }

  const safeNumber = (n, fallback = 0) => {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
  };

  const round2 = (n) =>
    Math.round((Number(n) || 0) * 100) / 100;

  function computeTotals(items = [], discounts = []) {
    const gross = items.reduce((sum, it) => {
      const qty = safeNumber(it.qty ?? it.quantity, 1);
      const price = safeNumber(it.price, 0);
      return sum + qty * price;
    }, 0);

    const totalPct = discounts.reduce(
      (sum, d) => sum + safeNumber(d.percent, 0),
      0
    );

    const discountAmount = gross * (totalPct / 100);
    const net = gross - discountAmount;

    return {
      gross_amount: round2(gross),
      discount_amount: round2(discountAmount),
      net_amount: round2(net),
    };
  }


  // ==================================================
  // 3) VERIFY REFUND PIN (Backoffice POS)
  // ==================================================
  router.post("/verify-refund-pin", async (req, res) => {
    const appRealm = "backoffice"; // matches authorization_pins.app

    try {
      const { pin } = req.body || {};

      if (!pin || !/^\d{6}$/.test(String(pin))) {
        await logOrderAudit({
          app: APP,
          action: "Refund PIN Verification",
          success: false,
          reason: "invalid_format",
          req,
        });

        return res
          .status(400)
          .json({ ok: false, error: "PIN must be 6 digits" });
      }

      const rows = asArray(
        await db.query(
          `
          SELECT id, pin_hash
          FROM authorization_pins
          WHERE app = ? AND is_active = 1
          ORDER BY updated_at DESC
          LIMIT 1
          `,
          [appRealm]
        )
      );

      if (!rows.length) {
        await logOrderAudit({
          app: APP,
          action: "Refund PIN Verification",
          success: false,
          reason: "no_active_pin",
          req,
        });

        return res
          .status(404)
          .json({ ok: false, error: "No active authorization PIN" });
      }

      const match = await bcrypt.compare(String(pin), rows[0].pin_hash);
      if (!match) {
        await logOrderAudit({
          app: APP,
          action: "Refund PIN Verification",
          success: false,
          reason: "invalid_pin",
          req,
        });

        return res
          .status(401)
          .json({ ok: false, error: "Invalid PIN" });
      }

      await logOrderAudit({
        app: APP,
        action: "Refund PIN Verification",
        success: true,
        reason: "ok",
        req,
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error("[Backoffice POS] verify-refund-pin failed:", e);

      try {
        await logOrderAudit({
          app: APP,
          action: "Refund PIN Verification",
          success: false,
          reason: "server_error",
          extra: { errorMessage: e.message || String(e) },
          req,
        });
      } catch {}

      return res
        .status(500)
        .json({ ok: false, error: "Server error" });
    }
  });

    /* ==================================================
     1) SAVE PENDING ORDER  → /pos/orders/pending
     Called from Backoffice POS Cart "Pending" button
     ================================================== */
  router.post("/pending", async (req, res) => {
    const conn = db;
    const app = APP;

    try {
      const {
        shiftId,
        terminalId,
        employeeId,
        orderType = "Dine-in",
        customerName,
        tableNo,
        items = [],
        discounts = [],
      } = req.body || {};

      if (!shiftId || !terminalId || !employeeId) {
        await logOrderAudit({
          app,
          action: "Save Pending Order",
          success: false,
          reason: "validation_error",
          employeeId,
          shiftId,
          extra: { terminalId },
          req,
        });

        return res.status(400).json({
          ok: false,
          error: "Missing shiftId / terminalId / employeeId",
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        await logOrderAudit({
          app,
          action: "Save Pending Order",
          success: false,
          reason: "no_items",
          employeeId,
          shiftId,
          extra: { terminalId },
          req,
        });

        return res
          .status(400)
          .json({ ok: false, error: "No items to save" });
      }

      await ensureOpenShift(shiftId);

      const totals = computeTotals(items, discounts);

      const result = await conn.query(
        `
        INSERT INTO pos_orders
          (shift_id, terminal_id, status, order_type, source,
           customer_name, table_no,
           gross_amount, discount_amount, net_amount, tax_amount,
           created_by, opened_at)
        VALUES
          (?, ?, 'pending', ?, 'Backoffice POS',
           ?, ?,
           ?, ?, ?, 0.00,
           ?, NOW())
        `,
        [
          shiftId,
          terminalId,
          orderType,
          customerName || "Walk-in",
          tableNo || null,
          totals.gross_amount,
          totals.discount_amount,
          totals.net_amount,
          employeeId,
        ]
      );

      const orderId = result.insertId;

      // Items
      for (const it of items) {
        const qty = safeNumber(it.qty ?? it.quantity, 1);
        const price = safeNumber(it.price, 0);
        const lineTotal = qty * price;

        await conn.query(
          `
          INSERT INTO pos_order_items
            (order_id, item_id, item_name, item_price, qty, line_total)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            orderId,
            it.id || null,
            it.name || "",
            price,
            qty,
            lineTotal,
          ]
        );
      }

      // Discounts
      for (const d of discounts) {
        const pct = safeNumber(d.percent, 0);
        if (!pct) continue;

        const amount = (totals.gross_amount * pct) / 100;

        await conn.query(
          `
          INSERT INTO pos_order_discounts
            (order_id, name, percent, amount)
          VALUES (?, ?, ?, ?)
          `,
          [orderId, d.name || "Discount", pct, amount]
        );
      }

      await logOrderAudit({
        app,
        action: "Save Pending Order",
        success: true,
        reason: "ok",
        employeeId,
        shiftId,
        orderId,
        extra: {
          terminalId,
          orderType,
          netAmount: totals.net_amount,
          discountAmount: totals.discount_amount,
        },
        req,
      });

      return res.json({
        ok: true,
        orderId,
        summary: {
          id: orderId,
          status: "pending",
          customer: customerName || "Walk-in",
          table: tableNo || null,
          amount: totals.net_amount,
        },
      });
    } catch (e) {
      console.error("[Backoffice POS orders/pending] failed:", e);

      const { shiftId, terminalId, employeeId } = req.body || {};

      await logOrderAudit({
        app: APP,
        action: "Save Pending Order",
        success: false,
        reason: "server_error",
        employeeId,
        shiftId,
        extra: {
          terminalId,
          errorMessage: e.message || String(e),
        },
        req,
      });

      return res
        .status(500)
        .json({ ok: false, error: e.message || "Failed to save pending order" });
    }
  });

  /* ==================================================
     2) LOAD OPEN/PENDING ORDERS  → /pos/orders/open
     Used by Backoffice Cart to reflect tickets
     ================================================== */
  router.get("/open", async (req, res) => {
    const { shiftId } = req.query || {};

    if (!shiftId) {
      return res
        .status(400)
        .json({ ok: false, error: "shiftId is required" });
    }

    try {
      await ensureOpenShift(shiftId);

      const headers = asArray(
        await db.query(
          `
          SELECT
            o.order_id,
            o.shift_id,
            o.terminal_id,
            o.status,
            o.order_type,
            o.source,
            o.customer_name,
            o.table_no,
            o.net_amount,
            o.created_by,
            o.opened_at,
            o.updated_at
          FROM pos_orders o
          WHERE o.shift_id = ?
            AND o.status IN ('pending','open')
          ORDER BY o.opened_at DESC, o.order_id DESC
          `,
          [shiftId]
        )
      );

      if (!headers.length) {
        return res.json({ ok: true, orders: [] });
      }

      const orderIds = headers.map((h) => h.order_id);

      // 🔹 build ?, ?, ? placeholders just like in /history
      const inPlaceholders = orderIds.map(() => "?").join(",");

      const itemRows = asArray(
        await db.query(
          `
          SELECT
            order_id,
            item_id,
            item_name,
            item_price,
            qty,
            line_total
          FROM pos_order_items
          WHERE order_id IN (${inPlaceholders})
          `,
          orderIds
        )
      );

      const discRows = asArray(
        await db.query(
          `
          SELECT
            order_id,
            name,
            percent,
            amount
          FROM pos_order_discounts
          WHERE order_id IN (${inPlaceholders})
          `,
          orderIds
        )
      );

      let employeeById = new Map();
      const employeeIds = Array.from(
        new Set(headers.map((h) => h.created_by).filter(Boolean))
      );

      if (employeeIds.length) {
        const empRows = asArray(
          await db.query(
            `
              SELECT 
                employee_id,
                CONCAT(first_name, ' ', last_name) AS employee_name
              FROM employees
              WHERE employee_id IN (${employeeIds.map(() => "?").join(",")})
            `,
            employeeIds
          )
        );

        employeeById = new Map(
          empRows.map((e) => [
            e.employee_id,
            e.employee_name || `#${e.employee_id}`,
          ])
        );
      }

      const itemsByOrder = new Map();
      (itemRows || []).forEach((r) => {
        if (!itemsByOrder.has(r.order_id)) {
          itemsByOrder.set(r.order_id, []);
        }
        itemsByOrder.get(r.order_id).push({
          id: r.item_id,
          name: r.item_name,
          price: Number(r.item_price || 0),
          qty: Number(r.qty || 1),
          image: null,
        });
      });

      const discountsByOrder = new Map();
      (discRows || []).forEach((r) => {
        if (!discountsByOrder.has(r.order_id)) {
          discountsByOrder.set(r.order_id, []);
        }
        discountsByOrder.get(r.order_id).push({
          name: r.name,
          percent: Number(r.percent || 0),
          amount: Number(r.amount || 0),
        });
      });

      const orders = headers.map((h) => ({
        id: String(h.order_id),
        status: h.status,
        source: h.source || APP,
        employee: employeeById.get(h.created_by) || `#${h.created_by}`,
        time: h.opened_at || h.updated_at || new Date().toISOString(),
        customer: h.customer_name || "Walk-in",
        table: h.table_no || null,
        amount: Number(h.net_amount || 0),
        items: (itemsByOrder.get(h.order_id) || []).map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          qty: it.qty,
          image: it.image,
        })),
        discounts: discountsByOrder.get(h.order_id) || [],
      }));

      return res.json({ ok: true, orders });
    } catch (e) {
      console.error("[Backoffice POS orders/open] failed:", e);
      return res
        .status(500)
        .json({ ok: false, error: e.message || "Failed to load open orders" });
    }
  });

  /* ==================================================
     3) VOID ORDER  → /pos/orders/:id/void
     Called from Cart "Void Order" (with PIN)
     ================================================== */
  router.post("/:id/void", async (req, res) => {
    const { id } = req.params;
    const { employeeId } = req.body || {};
    const orderId = Number(id);

    if (!orderId) {
      return res.status(400).json({ ok: false, error: "Invalid order id" });
    }

    try {
      const [rows] = await db.query(
        `
        SELECT order_id, shift_id, status
        FROM pos_orders
        WHERE order_id = ?
        LIMIT 1
        `,
        [orderId]
      );

      if (!rows || rows.length === 0) {
        return res
          .status(404)
          .json({ ok: false, error: "Order not found" });
      }

      const order = rows[0];

      await db.query(
        `
        UPDATE pos_orders
        SET status = 'voided',
            closed_at = NOW(),
            updated_at = NOW()
        WHERE order_id = ?
        `,
        [orderId]
      );

      await logOrderAudit({
        app: APP,
        action: "Void Order",
        success: true,
        reason: "ok",
        employeeId,
        shiftId: order.shift_id,
        orderId,
        extra: {
          previousStatus: order.status,
        },
        req,
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error("[Backoffice POS orders/:id/void] failed:", e);

      await logOrderAudit({
        app: APP,
        action: "Void Order",
        success: false,
        reason: "server_error",
        employeeId,
        shiftId: null,
        orderId,
        extra: {
          errorMessage: e.message || String(e),
        },
        req,
      });

      return res
        .status(500)
        .json({ ok: false, error: e.message || "Failed to void order" });
    }
  });

  // ==================================================
  // 0) PAID / REFUNDED / VOIDED HISTORY → for POS Orders page
  // ==================================================
  router.get("/history", async (req, res) => {
    const { shiftId } = req.query || {};

    try {
      const params = [];

      // show only paid, refunded or voided
      let where = `o.status IN ('paid','refunded','voided')`;

      if (shiftId) {
        where += ` AND o.shift_id = ?`;
        params.push(shiftId);
      }

      // --- main orders (header) ---
      const orderRows = asArray(
        await db.query(
          `
          SELECT
            o.order_id,
            o.shift_id,
            o.terminal_id,
            o.status,
            o.order_type,
            o.customer_name,
            o.table_no,
            o.net_amount,
            o.closed_at,
            o.created_by
          FROM pos_orders o
          WHERE ${where}
          ORDER BY o.closed_at DESC, o.order_id DESC
          `,
          params
        )
      );

      if (!orderRows || orderRows.length === 0) {
        return res.json({ ok: true, orders: [] });
      }

      const orderIds = orderRows.map((o) => o.order_id);

      if (!orderIds.length) {
        return res.json({ ok: true, orders: [] });
      }

      // build "?, ?, ?" for IN (...)
      const inPlaceholders = orderIds.map(() => "?").join(",");

      // --- items ---
      const itemsRows = asArray(
        await db.query(
          `
          SELECT
            oi.order_id,
            oi.item_id,
            oi.item_name,
            oi.item_price,
            oi.qty,
            oi.line_total
          FROM pos_order_items oi
          WHERE oi.order_id IN (${inPlaceholders})
          ORDER BY oi.order_id, oi.item_id
          `,
          orderIds
        )
      );

      // group items per order
      const itemsByOrder = new Map();
      for (const r of itemsRows) {
        if (!itemsByOrder.has(r.order_id)) {
          itemsByOrder.set(r.order_id, []);
        }
        itemsByOrder.get(r.order_id).push({
          id: r.item_id,
          name: r.item_name,
          price: safeNumber(r.item_price, 0),
          qty: safeNumber(r.qty, 1),
        });
      }

      // --- payments (for summary only) ---
      const paymentRows = asArray(
        await db.query(
          `
          SELECT
            order_id,
            method_name,
            amount,
            is_refund
          FROM pos_order_payments
          WHERE order_id IN (${inPlaceholders})
          ORDER BY created_at ASC, payment_id ASC
          `,
          orderIds
        )
      );

      const paymentsByOrder = new Map();
      for (const p of paymentRows) {
        if (!paymentsByOrder.has(p.order_id)) {
          paymentsByOrder.set(p.order_id, []);
        }
        paymentsByOrder.get(p.order_id).push({
          methodName: p.method_name,
          amount: safeNumber(p.amount, 0),
          isRefund: !!p.is_refund,
        });
      }

      const orders = orderRows.map((o) => {
        const items = itemsByOrder.get(o.order_id) || [];
        const payments = paymentsByOrder.get(o.order_id) || [];

        // just the employee id, no "Employee "
        const employeeName = o.created_by || "—";

        // ---- build paymentSummary from payments ----
        const positive = payments.filter(
          (p) => !p.isRefund && p.amount > 0
        );

        // distinct method names (Cash, GCash, etc.)
        const distinctMethods = [
          ...new Set(positive.map((p) => p.methodName)),
        ];

        let paymentSummary = "Unknown";

        if (distinctMethods.length === 1) {
          // single method, e.g. "Cash"
          paymentSummary = distinctMethods[0];
        } else if (distinctMethods.length > 1) {
          // multiple methods (split payment)
          paymentSummary = distinctMethods.join(" + "); // "Cash + GCash"
        } else if (payments.some((p) => p.isRefund)) {
          // no positive payments but has refunds
          paymentSummary = "Refund only";
        }

        return {
          id: o.order_id,
          shiftId: o.shift_id,
          status: o.status,
          orderType: o.order_type,
          customerName: o.customer_name,
          netAmount: safeNumber(o.net_amount, 0),
          employee: employeeName,
          closedAt: o.closed_at,
          items,
          paymentSummary,
        };
      });

      return res.json({ ok: true, orders });
    } catch (err) {
      console.error(
        "[Backoffice POS] GET /pos/orders/history failed:",
        err.code,
        err.sqlMessage || err.message
      );
      return res
        .status(500)
        .json({ ok: false, error: "Failed to load order history" });
    }
  });

  // ==================================================
  // 2) GET SINGLE ORDER DETAIL → for RefundPage
  // ==================================================
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    if (!id) {
      return res
        .status(400)
        .json({ ok: false, error: "Order id is required" });
    }

    try {
      // main order row
      const orderRows = asArray(
        await db.query(
          `
          SELECT
            o.order_id,
            o.shift_id,
            o.terminal_id,
            o.status,
            o.order_type,
            o.customer_name,
            o.table_no,
            o.net_amount,
            o.closed_at,
            o.created_by,
            o.source,
            o.created_at
          FROM pos_orders o
          WHERE o.order_id = ?
          LIMIT 1
          `,
          [id]
        )
      );

      if (!orderRows || orderRows.length === 0) {
        return res
          .status(404)
          .json({ ok: false, error: "Order not found" });
      }

      const o = orderRows[0];

      // items
      const itemRows = asArray(
        await db.query(
          `
          SELECT
            oi.order_id,
            oi.item_id,
            oi.item_name,
            oi.item_price,
            oi.qty,
            oi.line_total
          FROM pos_order_items oi
          WHERE oi.order_id = ?
          ORDER BY oi.order_id, oi.item_id
          `,
          [id]
        )
      );

      const items = (itemRows || []).map((r) => ({
        id: r.item_id,
        name: r.item_name,
        price: safeNumber(r.item_price, 0),
        qty: safeNumber(r.qty, 1),
        lineTotal: safeNumber(r.line_total, 0),
      }));

      // payments
      const paymentRows = asArray(
        await db.query(
          `
          SELECT
            payment_id,
            method_name,
            amount,
            is_refund,
            gcash_last4,
            created_at
          FROM pos_order_payments
          WHERE order_id = ?
          ORDER BY created_at ASC, payment_id ASC
          `,
          [id]
        )
      );

      const payments = (paymentRows || []).map((p) => ({
        id: p.payment_id,
        methodName: p.method_name,
        amount: safeNumber(p.amount, 0),
        isRefund: !!p.is_refund,
        gcashLast4: p.gcash_last4,
        createdAt: p.created_at,
      }));

      const order = {
        id: o.order_id,
        shiftId: o.shift_id,
        terminalId: o.terminal_id,
        status: o.status,
        orderType: o.order_type,
        customerName: o.customer_name,
        tableNo: o.table_no,
        netAmount: safeNumber(o.net_amount, 0),
        createdBy: o.created_by,
        source: o.source || APP,
        createdAt: o.created_at,
        closedAt: o.closed_at,
        items,
        payments,
      };

      return res.json({ ok: true, order });
    } catch (err) {
      console.error(
        "[Backoffice POS] GET /pos/orders/:id failed:",
        err
      );
      return res
        .status(500)
        .json({ ok: false, error: "Failed to load order" });
    }
  });

  // ==================================================
  // 4) REFUND ORDER (payment-only; inventory stays as-is)
  // ==================================================
  router.post("/:id/refund", async (req, res) => {
    const orderId = req.params.id;
    const { amount, methodName, qty, itemName, reason } = req.body || {};

    const rawAmt = Number(amount) || 0;

    if (!orderId || rawAmt <= 0) {
      try {
        await logOrderAudit({
          app: APP,
          action: "Refund Order",
          success: false,
          reason: "validation_error",
          orderId,
          extra: {
            amount: rawAmt,
            methodName: methodName || null,
            qty: qty || null,
            itemName: itemName || null,
            reason: reason || "",
          },
          req,
        });
      } catch {}

      return res
        .status(400)
        .json({ ok: false, error: "orderId and positive amount are required" });
    }

    try {
      const rows = asArray(
        await db.query(
          `
          SELECT order_id, shift_id, status, net_amount
          FROM pos_orders
          WHERE order_id = ?
          LIMIT 1
          `,
          [orderId]
        )
      );

      if (!rows.length) {
        try {
          await logOrderAudit({
            app: APP,
            action: "Refund Order",
            success: false,
            reason: "not_found",
            orderId,
            extra: {
              amount: rawAmt,
              methodName: methodName || null,
            },
            req,
          });
        } catch {}

        return res.status(404).json({ ok: false, error: "Order not found" });
      }

      const o = rows[0];

      if (o.status !== "paid" && o.status !== "refunded") {
        try {
          await logOrderAudit({
            app: APP,
            action: "Refund Order",
            success: false,
            reason: "invalid_status",
            orderId,
            shiftId: o.shift_id,
            extra: {
              amount: rawAmt,
              methodName: methodName || null,
              currentStatus: o.status,
            },
            req,
          });
        } catch {}

        return res.status(400).json({
          ok: false,
          error: "Only paid/refunded orders can be refunded",
        });
      }

      const currentNet = Number(o.net_amount) || 0;
      if (currentNet <= 0) {
        try {
          await logOrderAudit({
            app: APP,
            action: "Refund Order",
            success: false,
            reason: "no_remaining_amount",
            orderId,
            shiftId: o.shift_id,
            extra: {
              amount: rawAmt,
              methodName: methodName || null,
              currentNet,
            },
            req,
          });
        } catch {}

        return res.status(400).json({
          ok: false,
          error: "Order has no remaining amount to refund",
        });
      }

      const refundAmount = Math.min(rawAmt, currentNet);

      const method = String(methodName || "Refund").trim() || "Refund";
      const lower = method.toLowerCase();

      let cashRefund = 0;
      let cardRefund = 0;
      let onlineRefund = 0;

      if (lower.includes("cash")) {
        cashRefund = refundAmount;
      } else if (
        lower.includes("gcash") ||
        lower.includes("maya") ||
        lower.includes("online")
      ) {
        onlineRefund = refundAmount;
      } else {
        cardRefund = refundAmount;
      }

      // insert refund payment record
      await db.query(
        `
        INSERT INTO pos_order_payments
          (order_id, shift_id, slot_no, method_name, amount, is_refund, gcash_last4)
        VALUES (?, ?, 1, ?, ?, 1, NULL)
        `,
        [orderId, o.shift_id, method, refundAmount]
      );

      const newNet = Math.max(0, currentNet - refundAmount);
      const newStatus = newNet === 0 ? "refunded" : o.status;

      await db.query(
        `
        UPDATE pos_orders
        SET net_amount = ?, status = ?
        WHERE order_id = ?
        `,
        [newNet, newStatus, orderId]
      );

      await db.query(
        `
        UPDATE pos_shifts
        SET total_cash_payments   = total_cash_payments   - ?,
            total_card_payments   = total_card_payments   - ?,
            total_online_payments = total_online_payments - ?
        WHERE shift_id = ?
        `,
        [cashRefund, cardRefund, onlineRefund, o.shift_id]
      );

      try {
        await logOrderAudit({
          app: APP,
          action: "Refund Order",
          success: true,
          reason: "ok",
          orderId,
          shiftId: o.shift_id,
          extra: {
            refundAmount,
            remainingNet: newNet,
            finalStatus: newStatus,
            methodName: method,
            cashRefund,
            cardRefund,
            onlineRefund,
            qty: qty || null,
            itemName: itemName || null,
            reason: reason || "",
          },
          req,
        });
      } catch {}

      return res.json({
        ok: true,
        orderId,
        refundedAmount: refundAmount,
        remainingNet: newNet,
        status: newStatus,
      });
    } catch (e) {
      console.error("[Backoffice POS] POST /pos/orders/:id/refund failed:", e);

      try {
        await logOrderAudit({
          app: APP,
          action: "Refund Order",
          success: false,
          reason: "server_error",
          orderId,
          extra: {
            amount: rawAmt,
            methodName: methodName || null,
            errorMessage: e.message || String(e),
            qty: qty || null,
            itemName: itemName || null,
            reason: reason || "",
          },
          req,
        });
      } catch {}

      return res
        .status(500)
        .json({ ok: false, error: e.message || "Failed to refund order" });
    }
  });

  // ==================================================
  // 4) Void Item
  // ==================================================
  router.post("/:id/void-item", async (req, res) => {
    const orderId = req.params.id;
    const { itemId, qty, reason, employeeId } = req.body || {};
    
    const reqQty = Number(qty || 0);

    if (!orderId || !itemId || reqQty <= 0) {
      return res.status(400).json({
        ok: false,
        error: "orderId, itemId and positive qty required",
      });
    }

    try {
      // Load order
      const orderRows = asArray(
        await db.query(
          `SELECT order_id, shift_id, status 
          FROM pos_orders 
          WHERE order_id = ? LIMIT 1`,
          [orderId]
        )
      );

      if (!orderRows.length) {
        return res.status(404).json({ ok: false, error: "Order not found" });
      }
      const order = orderRows[0];

      if (!["paid", "open", "pending"].includes(order.status)) {
        return res.status(400).json({
          ok: false,
          error: "Only pending/open/paid orders can have item voids",
        });
      }

      // Load items
      const itemRows = asArray(
        await db.query(
          `SELECT id, item_id, item_name, item_price, qty, voided_qty
          FROM pos_order_items
          WHERE order_id = ? AND item_id = ?
          LIMIT 1`,
          [orderId, itemId]
        )
      );

      if (!itemRows.length) {
        return res.status(404).json({ ok: false, error: "Item not found in order" });
      }

      const it = itemRows[0];
      const remaining = Number(it.qty) - Number(it.voided_qty);

      if (reqQty > remaining) {
        return res.status(400).json({
          ok: false,
          error: `Only ${remaining} qty remaining to void`,
        });
      }

      const amount = reqQty * Number(it.item_price);

      // Update voided_qty
      await db.query(
        `UPDATE pos_order_items
        SET voided_qty = voided_qty + ?
        WHERE id = ?`,
        [reqQty, it.id]
      );

      // Insert void history
      await db.query(
        `INSERT INTO pos_order_voids
          (order_id, item_id, item_name, qty, amount, reason, employee_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          it.item_id,
          it.item_name,
          reqQty,
          amount,
          reason || null,
          employeeId || null,
        ]
      );

      // Recompute remaining totals
      const totalsRows = asArray(
        await db.query(
          `SELECT qty, voided_qty, item_price
          FROM pos_order_items
          WHERE order_id = ?`,
          [orderId]
        )
      );

      let gross = 0;
      for (const r of totalsRows) {
        const validQty = Number(r.qty) - Number(r.voided_qty);
        if (validQty > 0) {
          gross += validQty * Number(r.item_price);
        }
      }

      const discount = 0; // same as your current behavior
      const net = gross - discount;

      let newStatus = order.status;
      const stillHasItems = totalsRows.some(
        (r) => Number(r.qty) - Number(r.voided_qty) > 0
      );
      if (!stillHasItems) newStatus = "voided";

      await db.query(
        `UPDATE pos_orders
          SET gross_amount = ?, 
              discount_amount = ?, 
              net_amount = ?, 
              status = ?
        WHERE order_id = ?`,
        [gross, discount, net, newStatus, orderId]
      );

      await logOrderAudit({
        app: APP,
        action: "Void Item Qty",
        success: true,
        orderId,
        shiftId: order.shift_id,
        employeeId,
        extra: {
          itemId,
          qty: reqQty,
          amount,
          reason: reason || "",
          newStatus,
        },
        req,
      });

      return res.json({
        ok: true,
        orderId,
        voidAmount: amount,
        newNet: net,
        status: newStatus,
      });
    } catch (e) {
      console.error("[Void Item] failed:", e);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ==================================================
  // 3) VOID ORDER → pos_orders
  // ==================================================
  router.post("/:id/void", async (req, res) => {
    const { id } = req.params;
    const { employeeId } = req.body || {};

    if (!id) {
      return res.status(400).json({ ok: false, error: "Order id is required" });
    }

    try {
      const rows = asArray(
        await db.query(
          `
          SELECT
            order_id,
            status,
            shift_id,
            terminal_id
          FROM pos_orders
          WHERE order_id = ?
          `,
          [id]
        )
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ ok: false, error: "Order not found" });
      }

      const order = rows[0];

      if (order.status !== "pending") {
        return res.status(400).json({
          ok: false,
          error: "Only pending orders can be voided",
        });
      }

      await db.query(
        `
        UPDATE pos_orders
        SET status = 'voided',
            voided_by = ?,
            voided_at = NOW(),
            updated_at = NOW()
        WHERE order_id = ?
        `,
        [employeeId || null, id]
      );

      try {
        await logOrderAudit({
          app: APP,
          action: "Void Order",
          success: true,
          employeeId,
          shiftId: order.shift_id,
          orderId: order.order_id,
          extra: { terminalId: order.terminal_id },
          req,
        });
      } catch {}

      return res.json({ ok: true });
    } catch (err) {
      console.error("[Backoffice POS] POST /pos/orders/:id/void failed:", err);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to void order" });
    }
  });
  
  /* ==================================================
     4) CHARGE / FINALIZE ORDER  → /pos/orders/charge
     (supports single & split, same idea as Cashier)
     ================================================== */
  router.post("/charge", async (req, res) => {
    const conn = db;
    const app = APP;

    try {
      const {
        shiftId,
        terminalId,
        employeeId,
        mode = "single",
        orderId,
        orderType = "Dine-in",
        customerName,
        tableNo,
        items = [],
        discounts = [],
        payments = [],
        isFinalPayment = true,
        totalPaidSoFar,
      } = req.body || {};

      const isSplit = mode === "split";

      if (!shiftId || !terminalId || !employeeId) {
        await logOrderAudit({
          app,
          action: "Charge Order",
          success: false,
          reason: "validation_error",
          employeeId,
          shiftId,
          orderId,
          extra: { terminalId, mode },
          req,
        });

        return res.status(400).json({
          ok: false,
          error: "Missing shiftId / terminalId / employeeId",
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        await logOrderAudit({
          app,
          action: "Charge Order",
          success: false,
          reason: "no_items",
          employeeId,
          shiftId,
          orderId,
          extra: { terminalId, mode },
          req,
        });

        return res
          .status(400)
          .json({ ok: false, error: "No items to charge" });
      }

      if (!Array.isArray(payments) || payments.length === 0) {
        await logOrderAudit({
          app,
          action: "Charge Order",
          success: false,
          reason: "no_payments",
          employeeId,
          shiftId,
          orderId,
          extra: { terminalId, mode },
          req,
        });

        return res
          .status(400)
          .json({ ok: false, error: "No payments provided" });
      }

      await ensureOpenShift(shiftId);

      const totals = computeTotals(items, discounts);

      // This request only
      const paidTotal = payments.reduce(
        (sum, p) => sum + safeNumber(p.amount, 0),
        0
      );

      // Combine with previous payments for split
      let combinedPaid;
      if (typeof totalPaidSoFar === "number") {
        combinedPaid = safeNumber(totalPaidSoFar, 0) + paidTotal;
      } else {
        combinedPaid = paidTotal;

        if (isSplit && orderId) {
          const [rows] = await conn.query(
            `
            SELECT IFNULL(SUM(amount), 0) AS paid_so_far
            FROM pos_order_payments
            WHERE order_id = ?
            `,
            [orderId]
          );
          const prev =
            rows && rows[0]
              ? safeNumber(rows[0].paid_so_far, 0)
              : 0;
          combinedPaid += prev;
        }
      }

      // Single: always must cover net
      // Split: last payment must cover net
      const mustCoverNet = !isSplit || isFinalPayment;

      if (mustCoverNet && combinedPaid + 0.0001 < totals.net_amount) {
        await logOrderAudit({
          app,
          action: "Charge Order",
          success: false,
          reason: "payments_less_than_net",
          employeeId,
          shiftId,
          orderId,
          extra: {
            terminalId,
            mode,
            isFinalPayment,
            netAmount: totals.net_amount,
            paidTotal,
            combinedPaid,
          },
          req,
        });

        return res.status(400).json({
          ok: false,
          error: "Total payments are less than net amount",
        });
      }

      let finalOrderId = orderId || null;

      if (!finalOrderId) {
        // New order directly from Charge (no pending ticket)
        const statusForInsert =
          !isSplit || isFinalPayment ? "paid" : "open";
        const closedExpr =
          !isSplit || isFinalPayment ? "NOW()" : "NULL";

        const [insert] = await conn.query(
          `
          INSERT INTO pos_orders
            (shift_id, terminal_id, status, order_type, source,
             customer_name, table_no,
             gross_amount, discount_amount, net_amount, tax_amount,
             opened_at, closed_at,
             created_by)
          VALUES
            (?, ?, ?, ?, 'Backoffice POS',
             ?, ?,
             ?, ?, ?, 0.00,
             NOW(), ${closedExpr},
             ?)
          `,
          [
            shiftId,
            terminalId,
            statusForInsert,
            orderType,
            customerName || "Walk-in",
            tableNo || null,
            totals.gross_amount,
            totals.discount_amount,
            totals.net_amount,
            employeeId,
          ]
        );
        finalOrderId = insert.insertId;
      } else {
        // Existing pending / open ticket
        const statusForUpdate =
          !isSplit || isFinalPayment ? "paid" : "open";
        const closedSet =
          !isSplit || isFinalPayment
            ? "closed_at = NOW(),"
            : "closed_at = closed_at,";

        await conn.query(
          `
          UPDATE pos_orders
          SET status = ?,
              order_type = ?,
              customer_name = ?,
              table_no = ?,
              gross_amount = ?,
              discount_amount = ?,
              net_amount = ?,
              tax_amount = 0.00,
              ${closedSet}
              updated_at = NOW()
          WHERE order_id = ?
          `,
          [
            statusForUpdate,
            orderType,
            customerName || "Walk-in",
            tableNo || null,
            totals.gross_amount,
            totals.discount_amount,
            totals.net_amount,
            finalOrderId,
          ]
        );

        // For final payment we overwrite items/discounts
        if (!isSplit || isFinalPayment) {
          await conn.query(
            "DELETE FROM pos_order_items WHERE order_id = ?",
            [finalOrderId]
          );
          await conn.query(
            "DELETE FROM pos_order_discounts WHERE order_id = ?",
            [finalOrderId]
          );
        }
      }

      // Items + discounts only for single / final split
      if (!isSplit || isFinalPayment) {
        for (const it of items) {
          const qty = safeNumber(it.qty ?? it.quantity, 1);
          const price = safeNumber(it.price, 0);
          const lineTotal = qty * price;

          await conn.query(
            `
            INSERT INTO pos_order_items
              (order_id, item_id, item_name, item_price, qty, line_total)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
              finalOrderId,
              it.id || null,
              it.name || "",
              price,
              qty,
              lineTotal,
            ]
          );
        }

        for (const d of discounts) {
          const pct = safeNumber(d.percent, 0);
          if (!pct) continue;
          const amount = (totals.gross_amount * pct) / 100;

          await conn.query(
            `
            INSERT INTO pos_order_discounts
              (order_id, name, percent, amount)
            VALUES (?, ?, ?, ?)
            `,
            [finalOrderId, d.name || "Discount", pct, amount]
          );
        }
      }

      // Payments (always)
      let addCash = 0;
      let addCard = 0;
      let addOnline = 0;

      for (const p of payments) {
        const slot = safeNumber(p.slot || 1, 1);
        const amt = safeNumber(p.amount, 0);
        if (!amt) continue;

        const methodName = String(p.methodName || "Unknown");
        const lower = methodName.toLowerCase();

        if (lower.includes("cash")) {
          addCash += amt;
        } else if (
          lower.includes("gcash") ||
          lower.includes("maya") ||
          lower.includes("online")
        ) {
          addOnline += amt;
        } else {
          addCard += amt;
        }

        await conn.query(
          `
          INSERT INTO pos_order_payments
            (order_id, shift_id, slot_no, method_name, amount, is_refund, gcash_last4)
          VALUES (?, ?, ?, ?, ?, 0, ?)
          `,
          [
            finalOrderId,
            shiftId,
            slot,
            methodName,
            amt,
            p.gcashLast4 || null,
          ]
        );
      }

      // Shift totals + inventory only on final
      if (!isSplit || isFinalPayment) {
        await conn.query(
          `
          UPDATE pos_shifts
          SET total_gross_sales     = total_gross_sales     + ?,
              total_discounts       = total_discounts       + ?,
              total_cash_payments   = total_cash_payments   + ?,
              total_card_payments   = total_card_payments   + ?,
              total_online_payments = total_online_payments + ?
          WHERE shift_id = ?
          `,
          [
            totals.gross_amount,
            totals.discount_amount,
            addCash,
            addCard,
            addOnline,
            shiftId,
          ]
        );

        try {
          await applyInventoryFromOrder(finalOrderId, "out");
        } catch (invErr) {
          console.error(
            "[Backoffice POS orders/charge] inventory update failed:",
            invErr
          );
          // don't fail sale on inventory error
        }
      }

      await logOrderAudit({
        app,
        action: "Charge Order",
        success: true,
        reason: "ok",
        employeeId,
        shiftId,
        orderId: finalOrderId,
        extra: {
          terminalId,
          mode,
          orderType,
          netAmount: totals.net_amount,
          discountAmount: totals.discount_amount,
          grossAmount: totals.gross_amount,
          paidTotal,
          isFinalPayment,
          combinedPaid,
          payments: payments.map((p) => ({
            methodName: p.methodName,
            amount: safeNumber(p.amount, 0),
          })),
        },
        req,
      });

      return res.json({
        ok: true,
        orderId: finalOrderId,
        totals,
      });
    } catch (e) {
      console.error("[Backoffice POS orders/charge] failed:", e);

      const {
        shiftId,
        terminalId,
        employeeId,
        mode = "single",
        orderId,
      } = req.body || {};

      await logOrderAudit({
        app: APP,
        action: "Charge Order",
        success: false,
        reason: "server_error",
        employeeId,
        shiftId,
        orderId,
        extra: {
          terminalId,
          mode,
          errorMessage: e.message || String(e),
        },
        req,
      });

      return res
        .status(500)
        .json({ ok: false, error: e.message || "Failed to charge order" });
    }
  });

    // ==================================================
  // SINGLE ORDER DETAIL + PAYMENTS (for Backoffice Charge)
  // GET /api/pos/orders/detail?orderId=123
  // ==================================================
  router.get("/detail", async (req, res) => {
    try {
      const orderId = req.query.orderId;

      if (!orderId) {
        return res
          .status(400)
          .json({ ok: false, error: "orderId is required" });
      }

      const orderRows = asArray(
        await db.query(
          `
          SELECT
            o.order_id,
            o.shift_id,
            o.status,
            o.order_type,
            o.customer_name,
            o.net_amount,
            o.gross_amount,
            o.discount_amount,
            o.source,
            o.closed_at,
            o.created_at,
            o.created_by,
            CONCAT(e.first_name, ' ', e.last_name) AS employee_name
          FROM pos_orders o
          LEFT JOIN employees e
            ON e.employee_id = o.created_by
          WHERE o.order_id = ?
          LIMIT 1
          `,
          [orderId]
        )
      );

      if (!orderRows.length) {
        return res
          .status(404)
          .json({ ok: false, error: "Order not found" });
      }

      const o = orderRows[0];
      const closedAt = o.closed_at || o.created_at;

      const itemRows = asArray(
        await db.query(
          `
          SELECT
            item_id,
            item_name,
            item_price,
            qty,
            line_total
          FROM pos_order_items
          WHERE order_id = ?
          ORDER BY id ASC
          `,
          [orderId]
        )
      );

      const payRows = asArray(
        await db.query(
          `
          SELECT
            payment_id,
            slot_no,
            method_name,
            amount,
            is_refund,
            gcash_last4,
            created_at
          FROM pos_order_payments
          WHERE order_id = ?
          ORDER BY payment_id ASC
          `,
          [orderId]
        )
      );

      const mappedItems = itemRows.map((r) => ({
        id: r.item_id,
        name: r.item_name,
        price: Number(r.item_price) || 0,
        qty: Number(r.qty) || 1,
        lineTotal: Number(r.line_total) || 0,
      }));

      const mappedPays = payRows.map((p) => ({
        paymentId: p.payment_id,
        slotNo: Number(p.slot_no) || 1,
        methodName: p.method_name,
        amount: Number(p.amount) || 0,
        isRefund: !!p.is_refund,
        gcashLast4: p.gcash_last4 || null,
        createdAt: p.created_at,
      }));

      return res.json({
        ok: true,
        order: {
          id: o.order_id,
          shiftId: o.shift_id,
          status: o.status,
          orderType: o.order_type,
          customerName: o.customer_name,
          employee: o.employee_name || o.created_by || "",
          netAmount: Number(o.net_amount) || 0,
          grossAmount: Number(o.gross_amount) || 0,
          discountAmount: Number(o.discount_amount) || 0,
          closedAt,
          source: o.source || "Backoffice POS",
          items: mappedItems,
          payments: mappedPays, // <- same style as Cashier's refund detail
        },
        // convenience: also expose at top-level for simple callers
        payments: mappedPays,
      });
    } catch (e) {
      console.error("[POS orders/detail] failed:", e);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to load order detail" });
    }
  });

  return router;
};