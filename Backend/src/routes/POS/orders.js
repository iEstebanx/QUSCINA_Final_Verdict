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

  async function allocateNextOrderNoTx(conn, shiftId) {
    const rows = asArray(
      await conn.query(
        `
        SELECT next_order_no
        FROM pos_shifts
        WHERE shift_id = ?
        FOR UPDATE
        `,
        [shiftId]
      )
    );

    if (!rows.length) {
      const err = new Error("Shift not found for order number allocation");
      err.code = "SHIFT_NOT_FOUND";
      throw err;
    }

    const orderNo = Number(rows[0].next_order_no) || 1;

    await conn.query(
      `
      UPDATE pos_shifts
      SET next_order_no = next_order_no + 1
      WHERE shift_id = ?
      `,
      [shiftId]
    );

    return orderNo;
  }

  async function withTx(fn) {
    // Works for mysql2 pool (getConnection) AND for direct db connection fallback
    const conn = typeof db.getConnection === "function" ? await db.getConnection() : db;

    const canTx =
      conn &&
      typeof conn.beginTransaction === "function" &&
      typeof conn.commit === "function" &&
      typeof conn.rollback === "function";

    try {
      if (canTx) await conn.beginTransaction();
      const out = await fn(conn);
      if (canTx) await conn.commit();
      return out;
    } catch (e) {
      try {
        if (canTx) await conn.rollback();
      } catch {}
      throw e;
    } finally {
      try {
        if (conn && typeof conn.release === "function") conn.release();
      } catch {}
    }
  }

  const safeNumber = (n, fallback = 0) => {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
  };

  const round2 = (n) =>
    Math.round((Number(n) || 0) * 100) / 100;

  function computeTotals(items = [], discounts = []) {
    // gross
    const gross = (items || []).reduce((sum, it) => {
      const qty = safeNumber(it.qty ?? it.quantity, 1);
      const price = safeNumber(it.price, 0);
      return sum + qty * price;
    }, 0);

    // ✅ per-item discount (supports discountPercent + discount_percent)
    const itemDiscount = (items || []).reduce((sum, it) => {
      const qty = safeNumber(it.qty ?? it.quantity, 1);
      const price = safeNumber(it.price, 0);
      const pct = Math.max(
        0,
        safeNumber(it.discountPercent ?? it.discount_percent ?? 0, 0)
      );
      const lineGross = qty * price;
      return sum + (lineGross * pct) / 100;
    }, 0);

    // ✅ optional order-level discount AFTER item discounts
    const totalPct = (discounts || []).reduce(
      (sum, d) => sum + Math.max(0, safeNumber(d.percent, 0)),
      0
    );

    const afterItemDiscount = Math.max(0, gross - itemDiscount);
    const orderDiscount = (afterItemDiscount * totalPct) / 100;

    const discountAmount = itemDiscount + orderDiscount;
    const net = Math.max(0, gross - discountAmount);

    return {
      gross_amount: round2(gross),
      discount_amount: round2(discountAmount),
      net_amount: round2(net),
      tax_amount: 0,
    };
  }

  // ---------- JSON + inventory helpers (Option 2 stockMode) ----------
function safeJsonParse(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  const s = value.trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

// Build inventory deduction map for a cart of items [{id, qty}]
// - ingredients mode: items.ingredients JSON is recipe rows {ingredientId, qty}
// - direct mode: items.inventoryIngredientId + items.inventoryDeductQty
async function buildInventoryDeductionsFromCartItems(conn, cartItems = []) {
  const items = Array.isArray(cartItems) ? cartItems : [];
  const itemIds = items
    .map((it) => Number(it?.id))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!itemIds.length) return { deduceByInvId: new Map(), details: [] };

  const placeholders = itemIds.map(() => "?").join(",");

  // Pull stockMode + recipe/direct linkage from items table
  const itemRows = asArray(
    await conn.query(
      `
      SELECT
        id,
        stockMode,
        ingredients,
        inventoryIngredientId,
        inventoryDeductQty
      FROM items
      WHERE id IN (${placeholders})
      `,
      itemIds
    )
  );

  const byItemId = new Map(itemRows.map((r) => [Number(r.id), r]));

  const deduceByInvId = new Map(); // invId -> qtyToDeduct (DECIMAL)
  const details = []; // optional debug

  for (const it of items) {
    const id = Number(it?.id);
    const orderQty = safeNumber(it?.qty ?? it?.quantity, 1);

    const meta = byItemId.get(id);
    const stockMode = String(meta?.stockMode || "ingredients").toLowerCase();

    if (!meta) {
      // If missing item row, skip silently (or throw if you want)
      details.push({ itemId: id, stockMode: "missing_item_row" });
      continue;
    }

    if (stockMode === "ingredients") {
      let recipe = safeJsonParse(meta.ingredients, []);
      if (!Array.isArray(recipe)) recipe = [];

      // normalize recipe rows; ingredientId stored as string in your design
      recipe = recipe
        .map((r) => ({
          ingredientId: String(r?.ingredientId ?? "").trim(),
          qty: safeNumber(r?.qty ?? r?.quantity ?? r?.amount, 0),
        }))
        .filter((r) => r.ingredientId && r.qty > 0);

      // enforce recipe existence for ingredients mode (matches CHECK)
      if (!recipe.length) {
        details.push({ itemId: id, stockMode, error: "no_recipe" });
        continue;
      }

      for (const r of recipe) {
        const invId = Number(r.ingredientId);
        if (!Number.isFinite(invId) || invId <= 0) continue;

        const need = (safeNumber(r.qty, 0) * orderQty);
        if (!need) continue;

        const prev = deduceByInvId.get(invId) || 0;
        deduceByInvId.set(invId, round2(prev + need));
      }

      details.push({ itemId: id, stockMode, recipeRows: recipe.length });
    } else if (stockMode === "direct") {
      const invId = Number(meta.inventoryIngredientId);
      const deductPerUnit = safeNumber(meta.inventoryDeductQty, 1);

      if (!invId) {
        details.push({ itemId: id, stockMode, error: "no_direct_link" });
        continue;
      }

      const need = (deductPerUnit > 0 ? deductPerUnit : 1) * orderQty;
      const prev = deduceByInvId.get(invId) || 0;
      deduceByInvId.set(invId, round2(prev + need));

      details.push({ itemId: id, stockMode, invId, deductPerUnit });
    } else {
      details.push({ itemId: id, stockMode, error: "unknown_stockmode" });
    }
  }

  return { deduceByInvId, details };
}

async function assertEnoughInventoryForCart(conn, cartItems = []) {
  const { deduceByInvId, details } =
    await buildInventoryDeductionsFromCartItems(conn, cartItems);

  const invIds = Array.from(deduceByInvId.keys());
  if (!invIds.length) return;

  const placeholders = invIds.map(() => "?").join(",");

  const invRows = asArray(
    await conn.query(
      `
      SELECT id, kind, currentStock
      FROM inventory_ingredients
      WHERE id IN (${placeholders})
      `,
      invIds
    )
  );

  const invById = new Map(
    invRows.map((r) => [
      Number(r.id),
      {
        kind: String(r.kind || "ingredient"),
        currentStock: safeNumber(r.currentStock, 0),
      },
    ])
  );

  // validate:
  // - direct links must be kind='product'
  // - currentStock must be >= required deduction
  const problems = [];

  for (const [invId, required] of deduceByInvId.entries()) {
    const inv = invById.get(invId);
    if (!inv) {
      problems.push({ invId, required, reason: "missing_inventory_row" });
      continue;
    }

    // "direct must link to product" rule: we can only know which invIds are direct
    // by looking at details. We'll be strict: if ANY detail indicates direct invId, enforce kind.
    const usedAsDirect = details.some((d) => d?.stockMode === "direct" && Number(d?.invId) === invId);
    if (usedAsDirect && inv.kind !== "product") {
      problems.push({ invId, required, reason: "direct_not_product", kind: inv.kind });
      continue;
    }

    if (inv.currentStock + 0.0001 < required) {
      problems.push({
        invId,
        required,
        currentStock: inv.currentStock,
        reason: "insufficient_stock",
      });
    }
  }

  if (problems.length) {
    const err = new Error("INSUFFICIENT_INVENTORY");
    err.httpStatus = 409;
    err.code = "INSUFFICIENT_INVENTORY";
    err.problems = problems;
    throw err;
  }
}

async function applyInventoryFromCartItems(conn, cartItems = [], direction = "out") {
  // direction: "out" (deduct) or "in" (restock)
  const { deduceByInvId } =
    await buildInventoryDeductionsFromCartItems(conn, cartItems);

  const sign = String(direction).toLowerCase() === "in" ? 1 : -1;

  for (const [invId, qtyDeltaAbs] of deduceByInvId.entries()) {
    const delta = round2(sign * safeNumber(qtyDeltaAbs, 0));
    if (!delta) continue;

    // update stock
    await conn.query(
      `
      UPDATE inventory_ingredients
      SET currentStock = currentStock + ?
      WHERE id = ?
      `,
      [delta, invId]
    );

    // optionally: log inventory_activity here if you want (you currently don't in this backoffice POS router)
  }
}

  // ---- cash change helpers (Backoffice POS) ----
  async function computeExpectedCashForShift(shiftId) {
    // Goal: estimate cash currently in drawer BEFORE this request is applied.
    // Uses:
    // - opening float (or denom sum fallback)
    // - net cash moves (cash in - cash out)
    // - net cash sales (cash payments - cash refunds)
    //
    // NOTE: adjust table/column names if yours differ.

    // 1) opening float (fallback to denom sum if opening_float is null/0)
    const shiftRows = asArray(
      await db.query(
        `
        SELECT opening_float
        FROM pos_shifts
        WHERE shift_id = ?
        LIMIT 1
        `,
        [shiftId]
      )
    );

    let opening = shiftRows[0] ? safeNumber(shiftRows[0].opening_float, 0) : 0;

    if (!opening) {
      // optional denom fallback (if you have pos_shift_denoms)
      try {
        const denomRows = asArray(
          await db.query(
            `
            SELECT IFNULL(SUM(denom * qty), 0) AS denom_total
            FROM pos_shift_denoms
            WHERE shift_id = ?
            `,
            [shiftId]
          )
        );
        opening = denomRows[0] ? safeNumber(denomRows[0].denom_total, 0) : 0;
      } catch {
        // ignore if denom table doesn't exist in backoffice db
      }
    }

    // 2) cash moves net (cash in - cash out)
    // Adjust these CASE checks to match your pos_cash_moves schema.
    let cashMovesNet = 0;
    try {
      const moveRows = asArray(
        await db.query(
          `
          SELECT IFNULL(SUM(
            CASE
              WHEN LOWER(move_type) IN ('cash_in','in') THEN amount
              WHEN LOWER(move_type) IN ('cash_out','out') THEN -amount
              ELSE 0
            END
          ), 0) AS net_moves
          FROM pos_cash_moves
          WHERE shift_id = ?
          `,
          [shiftId]
        )
      );
      cashMovesNet = moveRows[0] ? safeNumber(moveRows[0].net_moves, 0) : 0;
    } catch {
      // ignore if you don't track cash moves here
    }

    // 3) net cash from payments (cash payments - cash refunds)
    const payRows = asArray(
      await db.query(
        `
        SELECT IFNULL(SUM(
          CASE
            WHEN LOWER(method_name) LIKE '%cash%' AND is_refund = 0 THEN amount
            WHEN LOWER(method_name) LIKE '%cash%' AND is_refund = 1 THEN -amount
            ELSE 0
          END
        ), 0) AS net_cash_sales
        FROM pos_order_payments
        WHERE shift_id = ?
        `,
        [shiftId]
      )
    );

    const netCashSales = payRows[0] ? safeNumber(payRows[0].net_cash_sales, 0) : 0;

    return round2(opening + cashMovesNet + netCashSales);
  }

  function extractCashReceived(payments = []) {
    // If your frontend only sends 1 payment per request (like Cashier), this is simple.
    // If multiple payments are sent, we sum cash ones.
    return round2(
      (payments || []).reduce((sum, p) => {
        const method = String(p?.methodName || "");
        const amt = safeNumber(p?.amount, 0);
        if (!amt) return sum;
        return method.toLowerCase().includes("cash") ? sum + amt : sum;
      }, 0)
    );
  }

  async function assertEnoughCashForChange({
    shiftId,
    totalDue,
    totalPaidSoFar,
    payments,
    isFinalPayment,
    mode,
  }) {
    // Only enforce for CASH payments (and only when cash received creates change).
    const cashReceived = extractCashReceived(payments);
    if (cashReceived <= 0) return;

    const prevPaid = safeNumber(totalPaidSoFar, 0);
    const due = safeNumber(totalDue, 0);

    // Remaining due BEFORE this payment is applied
    const remaining = Math.max(0, due - prevPaid);

    // Required change for THIS request (same logic your frontend uses)
    const requiredChange = Math.max(0, cashReceived - remaining);

    // If no change is needed, no need to block
    if (requiredChange <= 0) return;

    // (Optional) If you only want to enforce on final slot, uncomment:
    // if (String(mode) === "split" && !isFinalPayment) return;

    const drawerBefore = await computeExpectedCashForShift(shiftId);

    // Only cash already in drawer BEFORE taking this payment
    const availableCash = round2(drawerBefore);

    if (availableCash + 0.0001 < requiredChange) {
      const err = new Error("INSUFFICIENT_CHANGE");
      err.httpStatus = 409;
      err.code = "INSUFFICIENT_CHANGE";

      // already existing
      err.requiredChange = round2(requiredChange);
      err.availableCash = round2(availableCash);

      // ✅ ADD THESE (so frontend can show the real drawer cash vs tendered cash)
      err.drawerCashBefore = round2(drawerBefore);
      err.cashReceivedThis = round2(cashReceived);

      throw err;
    }
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

      const { orderId, orderNo } = await withTx(async (tx) => {
        const allocated = await allocateNextOrderNoTx(tx, shiftId);

        const insertRes = await tx.query(
          `
          INSERT INTO pos_orders
            (shift_id, order_no, terminal_id, status, order_type, source,
            customer_name, table_no,
            gross_amount, discount_amount, net_amount, tax_amount,
            created_by, opened_at)
          VALUES
            (?, ?, ?, 'pending', ?, 'Backoffice POS',
            ?, ?,
            ?, ?, ?, 0.00,
            ?, NOW())
          `,
          [
            shiftId,
            allocated,
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

        const packet = Array.isArray(insertRes) ? insertRes[0] : insertRes;
        const newOrderId = packet.insertId;

        // insert items inside tx
        for (const it of items) {
          const qty = safeNumber(it.qty ?? it.quantity, 1);
          const price = safeNumber(it.price, 0);
          const lineGross = qty * price;

          // ✅ HERE
          const pct = Math.max(
            0,
            safeNumber(it.discountPercent ?? it.discount_percent ?? 0, 0)
          );
          const dAmt = (lineGross * pct) / 100;

          await tx.query(
            `
            INSERT INTO pos_order_items
              (order_id, item_id, item_name, item_price, qty, line_total,
              discount_name, discount_percent, discount_amount)
            VALUES (?, ?, ?, ?, ?, ?,
                    ?, ?, ?)
            `,
            [
              newOrderId,
              it.id || null,
              it.name || "",
              price,
              qty,
              lineGross,
              it.discountName || it.discount_name || null,
              pct,
              round2(dAmt),
            ]
          );
        }

        const itemDiscountTotal = (items || []).reduce((sum, it) => {
          const qty = safeNumber(it.qty ?? it.quantity, 1);
          const price = safeNumber(it.price, 0);
          const pct = Math.max(0, safeNumber(it.discountPercent ?? it.discount_percent ?? 0, 0));
          return sum + ((qty * price) * pct) / 100;
        }, 0);

        const afterItemDiscount = Math.max(0, totals.gross_amount - itemDiscountTotal);

        // insert discounts inside tx
        for (const d of discounts) {
          const pct = safeNumber(d.percent, 0);
          if (!pct) continue;

          const amount = round2((afterItemDiscount * pct) / 100);

          await tx.query(
            `
            INSERT INTO pos_order_discounts
              (order_id, name, percent, amount)
            VALUES (?, ?, ?, ?)
            `,
            [newOrderId, d.name || "Discount", pct, amount]
          );
        }

        return { orderId: newOrderId, orderNo: allocated };
      });

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
        orderNo,
        summary: {
          id: orderId,
          orderNo,
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
     1b) UPDATE EXISTING PENDING/OPEN ORDER
     POST /pos/orders/:id/pending
     Used by Backoffice Cart "Save" button
     ================================================== */
  router.post("/:id/pending", async (req, res) => {
    const conn = db;
    const app = APP;
    const orderId = req.params.id;

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

      if (!orderId) {
        return res
          .status(400)
          .json({ ok: false, error: "orderId is required" });
      }

      if (!shiftId || !terminalId || !employeeId) {
        await logOrderAudit({
          app,
          action: "Update Pending Order",
          success: false,
          reason: "validation_error",
          employeeId,
          shiftId,
          orderId,
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
          action: "Update Pending Order",
          success: false,
          reason: "no_items",
          employeeId,
          shiftId,
          orderId,
          extra: { terminalId },
          req,
        });

        return res
          .status(400)
          .json({ ok: false, error: "No items to save" });
      }

      // 1) Make sure shift is still open
      await ensureOpenShift(shiftId);

      // 2) Make sure order exists and is pending/open
      const orderRows = asArray(
        await conn.query(
          `
          SELECT order_id, shift_id, status
          FROM pos_orders
          WHERE order_id = ?
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

      if (!["pending", "open"].includes(o.status)) {
        return res.status(400).json({
          ok: false,
          error: "Only pending/open orders can be updated",
        });
      }

      // 3) Recompute totals
      const totals = computeTotals(items, discounts);

      // 4) Update header
      await conn.query(
        `
        UPDATE pos_orders
        SET order_type      = ?,
            customer_name   = ?,
            table_no        = ?,
            gross_amount    = ?,
            discount_amount = ?,
            net_amount      = ?,
            tax_amount      = 0.00,
            updated_at      = NOW()
        WHERE order_id = ?
        `,
        [
          orderType,
          customerName || "Walk-in",
          tableNo || null,
          totals.gross_amount,
          totals.discount_amount,
          totals.net_amount,
          orderId,
        ]
      );

      // 5) Replace items + discounts
      await conn.query("DELETE FROM pos_order_items WHERE order_id = ?", [
        orderId,
      ]);
      await conn.query(
        "DELETE FROM pos_order_discounts WHERE order_id = ?",
        [orderId]
      );

      for (const it of items) {
        const qty = safeNumber(it.qty ?? it.quantity, 1);
        const price = safeNumber(it.price, 0);
        const lineGross = qty * price;

        // ✅ HERE
        const pct = Math.max(
          0,
          safeNumber(it.discountPercent ?? it.discount_percent ?? 0, 0)
        );
        const dAmt = (lineGross * pct) / 100;

        await conn.query(
          `
          INSERT INTO pos_order_items
            (order_id, item_id, item_name, item_price, qty, line_total,
            discount_name, discount_percent, discount_amount)
          VALUES (?, ?, ?, ?, ?, ?,
                  ?, ?, ?)
          `,
          [
            orderId,
            it.id || null,
            it.name || "",
            price,
            qty,
            lineGross,
            it.discountName || it.discount_name || null,
            pct,
            round2(dAmt),
          ]
        );
      }

      const itemDiscountTotal = (items || []).reduce((sum, it) => {
        const qty = safeNumber(it.qty ?? it.quantity, 1);
        const price = safeNumber(it.price, 0);
        const pct = Math.max(0, safeNumber(it.discountPercent ?? it.discount_percent ?? 0, 0));
        return sum + ((qty * price) * pct) / 100;
      }, 0);

      const afterItemDiscount = Math.max(0, totals.gross_amount - itemDiscountTotal);

      for (const d of discounts) {
        const pct = safeNumber(d.percent, 0);
        if (!pct) continue;

        const amount = (afterItemDiscount * pct) / 100;

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
        action: "Update Pending Order",
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
          grossAmount: totals.gross_amount,
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
      console.error(
        "[Backoffice POS orders/:id/pending] failed:",
        e
      );

      const { shiftId, terminalId, employeeId } = req.body || {};

      await logOrderAudit({
        app: APP,
        action: "Update Pending Order",
        success: false,
        reason: "server_error",
        employeeId,
        shiftId,
        orderId,
        extra: {
          terminalId,
          errorMessage: e.message || String(e),
        },
        req,
      });

      return res
        .status(500)
        .json({ ok: false, error: e.message || "Failed to update pending order" });
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
            o.order_no,
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
            voided_qty,
            line_total,
            discount_name,
            discount_percent,
            discount_amount
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
        // remaining = qty - voided_qty
        const remainingQty =
          Math.max(
            0,
            Number(r.qty || 0) - Number(r.voided_qty || 0)
          );

        // If nothing left (fully voided), don't expose this item at all
        if (remainingQty <= 0) {
          return;
        }

        if (!itemsByOrder.has(r.order_id)) {
          itemsByOrder.set(r.order_id, []);
        }
        itemsByOrder.get(r.order_id).push({
          id: r.item_id,
          name: r.item_name,
          price: Number(r.item_price || 0),
          qty: remainingQty,
          image: null,
          discountName: r.discount_name || null,
          discountPercent: Number(r.discount_percent || 0),
          discountAmount: Number(r.discount_amount || 0),
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
        orderNo: h.order_no ?? null,
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
          discountName: it.discountName || null,
          discountPercent: Number(it.discountPercent || 0),
          discountAmount: Number(it.discountAmount || 0),
        })),
        discounts: discountsByOrder.get(h.order_id) || [],
      }));

      return res.json({ ok: true, orders });
    } catch (e) {
      console.error("[Backoffice POS orders/open] failed:", e);

      // ✅ shift is closed / not open -> not a server error
      if (e?.code === "SHIFT_NOT_OPEN") {
        return res.status(409).json({
          ok: false,
          code: "SHIFT_NOT_OPEN",
          error: e.message || "Shift is not open",
        });
      }

      if (e?.code === "SHIFT_NOT_FOUND") {
        return res.status(404).json({
          ok: false,
          code: "SHIFT_NOT_FOUND",
          error: e.message || "Shift not found",
        });
      }

      return res.status(500).json({
        ok: false,
        code: "SERVER_ERROR",
        error: e.message || "Failed to load open orders",
      });
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
            o.order_no,
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
            oi.line_total,
            oi.discount_name,
            oi.discount_percent,
            oi.discount_amount
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
          discountName: r.discount_name || null,
          discountPercent: safeNumber(r.discount_percent, 0),
          discountAmount: safeNumber(r.discount_amount, 0),
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

        // ---- build paymentSummary from NON-refund payments ----
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

        // 🔹 NEW: total refunded amount for this order
        const refundAmount = payments
          .filter((p) => p.isRefund && p.amount > 0)
          .reduce((sum, p) => sum + p.amount, 0);

        return {
          id: o.order_id,
          orderNo: o.order_no ?? null,
          shiftId: o.shift_id,
          status: o.status,
          orderType: o.order_type,
          customerName: o.customer_name,
          netAmount: safeNumber(o.net_amount, 0),
          employee: employeeName,
          closedAt: o.closed_at,
          items,
          paymentSummary,
          refundAmount,        // 🔹 NEW FIELD
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
            o.order_no,
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
            oi.line_total,
            oi.discount_name,
            oi.discount_percent,
            oi.discount_amount
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
        discountName: r.discount_name || null,
        discountPercent: safeNumber(r.discount_percent, 0),
        discountAmount: safeNumber(r.discount_amount, 0),
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
        orderNo: o.order_no ?? null,
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
  // 4) VOID ITEM (PER-LINE ONLY, NEVER VOID ENTIRE ORDER)
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
      // 1) Load order (to validate + for audit)
      const orderRows = asArray(
        await db.query(
          `
          SELECT order_id, shift_id, status, gross_amount, discount_amount, net_amount
          FROM pos_orders
          WHERE order_id = ?
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

      const order = orderRows[0];

      // Only these statuses are allowed to have item voids
      if (!["paid", "open", "pending"].includes(order.status)) {
        return res.status(400).json({
          ok: false,
          error: "Only pending/open/paid orders can have item voids",
        });
      }

      // 2) Load the specific line item
      const itemRows = asArray(
        await db.query(
          `
          SELECT order_id, item_id, item_name, item_price, qty, voided_qty
          FROM pos_order_items
          WHERE order_id = ? AND item_id = ?
          LIMIT 1
          `,
          [orderId, itemId]
        )
      );

      if (!itemRows.length) {
        return res
          .status(404)
          .json({ ok: false, error: "Item not found in order" });
      }

      const it = itemRows[0];

      const remaining = Number(it.qty) - Number(it.voided_qty || 0);

      if (reqQty > remaining) {
        return res.status(400).json({
          ok: false,
          error: `Only ${remaining} qty remaining to void`,
        });
      }

      // 3) Update voided_qty for that line
      await db.query(
        `
        UPDATE pos_order_items
        SET voided_qty = voided_qty + ?
        WHERE order_id = ? AND item_id = ?
        `,
        [reqQty, orderId, it.item_id]
      );

      const totalsRows = asArray(
        await db.query(
          `
          SELECT qty, voided_qty, item_price, discount_percent
          FROM pos_order_items
          WHERE order_id = ?
          `,
          [orderId]
        )
      );

      // order-level discounts (optional)
      const discRows = asArray(
        await db.query(
          `
          SELECT percent
          FROM pos_order_discounts
          WHERE order_id = ?
          `,
          [orderId]
        )
      );

      // build "virtual cart" based on remaining qty
      const itemsForTotals = totalsRows.map((r) => ({
        price: safeNumber(r.item_price, 0),
        qty: Math.max(0, safeNumber(r.qty, 0) - safeNumber(r.voided_qty, 0)),
        discountPercent: safeNumber(r.discount_percent, 0),
      }));

      const discountsForTotals = discRows.map((d) => ({
        percent: safeNumber(d.percent, 0),
      }));

      const totals = computeTotals(itemsForTotals, discountsForTotals);

      const oldNet = safeNumber(order.net_amount, 0);

      // correct void amount = reduction in net after recompute
      const voidAmount = round2(
        Math.max(0, oldNet - safeNumber(totals.net_amount, 0))
      );

      // ✅ Cashier-POS parity:
      // if all items are fully voided, auto-void the order
      const hasAnyQtyLeft = itemsForTotals.some(
        (it) => safeNumber(it.qty, 0) > 0
      );

      const newStatus = hasAnyQtyLeft ? order.status : "voided";

      await db.query(
        `
        UPDATE pos_orders
        SET gross_amount = ?,
            discount_amount = ?,
            net_amount = ?,
            status = ?
        WHERE order_id = ?
        `,
        [totals.gross_amount, totals.discount_amount, totals.net_amount, newStatus, orderId]
      );

      // 5) Audit log (no order-level void)
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
          amount: voidAmount,
          reason: reason || "",
          newStatus,
        },
        req,
      });

      return res.json({
        ok: true,
        orderId,
        voidAmount: voidAmount,
        newNet: totals.net_amount,
        status: newStatus,
      });
    } catch (e) {
      console.error("[Void Item] failed:", e);
      return res
        .status(500)
        .json({ ok: false, error: "Server error" });
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
    let combinedPaid = paidTotal;

    if (typeof totalPaidSoFar === "number") {
      combinedPaid += safeNumber(totalPaidSoFar, 0);
    } else if (isSplit && orderId) {
      const rows = asArray(
        await conn.query(
          `
          SELECT IFNULL(SUM(amount), 0) AS paid_so_far
          FROM pos_order_payments
          WHERE order_id = ? AND is_refund = 0
          `,
          [orderId]
        )
      );
      const prev = rows[0]
        ? safeNumber(rows[0].paid_so_far, 0)
        : 0;
      combinedPaid += prev;
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

    await assertEnoughCashForChange({
      shiftId,
      totalDue: totals.net_amount,
      totalPaidSoFar: safeNumber(totalPaidSoFar, 0),
      payments,
      isFinalPayment: !!isFinalPayment,
      mode,
    });

    if (!isSplit || isFinalPayment) {
      await assertEnoughInventoryForCart(conn, items);
    }

    let finalOrderId = orderId || null;
    let allocatedOrderNo = null;

    if (!finalOrderId) {
      // New order directly from Charge (no pending ticket)
      const statusForInsert =
        !isSplit || isFinalPayment ? "paid" : "open";
      const closedExpr =
        !isSplit || isFinalPayment ? "NOW()" : "NULL";

      const created = await withTx(async (tx) => {
        allocatedOrderNo = await allocateNextOrderNoTx(tx, shiftId);

        const insertResult = await tx.query(
          `
          INSERT INTO pos_orders
            (shift_id, order_no, terminal_id, status, order_type, source,
             customer_name, table_no,
             gross_amount, discount_amount, net_amount, tax_amount,
             opened_at, closed_at,
             created_by)
          VALUES
            (?, ?, ?, ?, ?, 'Backoffice POS',
             ?, ?,
             ?, ?, ?, 0.00,
             NOW(), ${closedExpr},
             ?)
          `,
          [
            shiftId,
            allocatedOrderNo,
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

        const packet = Array.isArray(insertResult) ? insertResult[0] : insertResult;
        return packet.insertId;
      });

      finalOrderId = created;
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
        const lineGross = qty * price;

        // ✅ HERE
        const pct = Math.max(
          0,
          safeNumber(it.discountPercent ?? it.discount_percent ?? 0, 0)
        );
        const dAmt = (lineGross * pct) / 100;

        await conn.query(
          `
          INSERT INTO pos_order_items
            (order_id, item_id, item_name, item_price, qty, line_total,
            discount_name, discount_percent, discount_amount)
          VALUES (?, ?, ?, ?, ?, ?,
                  ?, ?, ?)
          `,
          [
            finalOrderId,
            it.id || null,
            it.name || "",
            price,
            qty,
            lineGross,
            it.discountName || it.discount_name || null,
            pct,
            round2(dAmt),
          ]
        );
      }

      const itemDiscountTotal = (items || []).reduce((sum, it) => {
        const qty = safeNumber(it.qty ?? it.quantity, 1);
        const price = safeNumber(it.price, 0);
        const pct = Math.max(0, safeNumber(it.discountPercent ?? it.discount_percent ?? 0, 0));
        return sum + ((qty * price) * pct) / 100;
      }, 0);

      const afterItem = Math.max(0, totals.gross_amount - itemDiscountTotal);

      for (const d of discounts) {
        const pct = safeNumber(d.percent, 0);
        if (!pct) continue;

        const amount = round2((afterItem * pct) / 100);

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
        // Option 2: deduct inventory by stockMode (ingredients recipe OR direct link)
        await applyInventoryFromCartItems(conn, items, "out");
      } catch (invErr) {
        console.error("[Backoffice POS orders/charge] inventory update failed:", invErr);
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
      orderNo: allocatedOrderNo || null,
      totals,
    });
  } catch (e) {
    console.error("[Backoffice POS orders/charge] failed:", e);

    if (e?.code === "INSUFFICIENT_CHANGE") {
      return res.status(409).json({
        ok: false,
        code: "INSUFFICIENT_CHANGE",
        requiredChange: Number(e.requiredChange) || 0,
        drawerCashBefore: Number(e.drawerCashBefore) || 0,
        cashReceivedThis: Number(e.cashReceivedThis) || 0,
        availableCashForChange: Number(e.availableCash) || 0,
        error: "Insufficient cash for change",
      });
    }

    // ✅ ADD THIS RIGHT HERE
    if (e?.code === "INSUFFICIENT_INVENTORY") {
      return res.status(409).json({
        ok: false,
        code: "INSUFFICIENT_INVENTORY",
        problems: e.problems || [],
        error: "Insufficient inventory to complete the sale",
      });
    }

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
            o.order_no,
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
            line_total,
            discount_name,
            discount_percent,
            discount_amount
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
        discountName: r.discount_name || null,
        discountPercent: Number(r.discount_percent || 0),
        discountAmount: Number(r.discount_amount || 0),
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
          orderNo: o.order_no ?? null,
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