// QUSCINA_BACKOFFICE/Backend/src/routes/Reports/reports.js
const express = require("express");

module.exports = ({ db }) => {
  const router = express.Router();

  function buildRangeSQL(range, from, to) {
    switch (range) {
      case "days":
        return `DATE(o.closed_at) = CURDATE()`;

      case "weeks":
        return `YEARWEEK(o.closed_at, 1) = YEARWEEK(CURDATE(), 1)`;

      case "monthly":
        return `
          YEAR(o.closed_at) = YEAR(CURDATE()) 
          AND MONTH(o.closed_at) = MONTH(CURDATE())
        `;

      case "quarterly":
        return `
          YEAR(o.closed_at) = YEAR(CURDATE()) 
          AND QUARTER(o.closed_at) = QUARTER(CURDATE())
        `;

      case "yearly":
        return `YEAR(o.closed_at) = YEAR(CURDATE())`;

      case "custom":
        if (!from || !to) return "1=0";
        return `DATE(o.closed_at) BETWEEN DATE('${from}') AND DATE('${to}')`;

      default:
        return `DATE(o.closed_at) = CURDATE()`;
    }
  }

  /* =========================================================================
  * 0) DATE BOUNDS (first and last order date)
  * ========================================================================= */
  router.get("/date-bounds", async (req, res) => {
    try {
      const rows = await db.query(
        `
        SELECT 
          MIN(DATE(closed_at)) AS minDate,
          MAX(DATE(closed_at)) AS maxDate
        FROM pos_orders
        WHERE status IN ('paid','refunded')
        `
      );

      const row = rows[0] || {};

      return res.json({
        ok: true,
        minDate: row.minDate || null, // e.g. "2024-02-10"
        maxDate: row.maxDate || null, // e.g. "2025-01-03"
      });
    } catch (e) {
      console.error("DATE BOUNDS ERROR", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get("/active-days", async (req, res) => {
    try {
      const rows = await db.query(
        `
        SELECT DISTINCT DATE(closed_at) AS day
        FROM pos_orders
        WHERE status IN ('paid','refunded')
        ORDER BY day
        `
      );

      // Normalize to "YYYY-MM-DD" strings
      const days = rows
        .map((r) => r.day)
        .filter(Boolean)
        .map((d) =>
          d instanceof Date
            ? d.toISOString().slice(0, 10) // "2025-11-26"
            : String(d).slice(0, 10)
        );

      return res.json({
        ok: true,
        days,
      });
    } catch (e) {
      console.error("ACTIVE DAYS ERROR", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
 * 1A) TOP 5 ITEMS SALES
 * ========================================================================= */
  router.get("/items-top5", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      const rows = await db.query(
        `
        SELECT
          oi.item_id,
          oi.item_name AS name,
          SUM(oi.line_total) AS net
        FROM pos_order_items oi
        JOIN pos_orders o ON o.order_id = oi.order_id
        WHERE o.status IN ('paid','refunded')
          AND ${where}
        GROUP BY oi.item_id, oi.item_name
        ORDER BY net DESC
        LIMIT 5
        `
      );

      return res.json({
        ok: true,
        data: rows.map((r) => ({
          itemId: Number(r.item_id),
          name: r.name,
          net: Number(r.net || 0),
        })),
      });
    } catch (e) {
      console.error("TOP 5 ITEMS ERROR", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
   * 1) TOP 5 CATEGORY SALES
   * ========================================================================= */
    router.get("/category-top5", async (req, res) => {
    try {
        const { range = "days", from, to } = req.query;
        const where = buildRangeSQL(range, from, to);

        // ❌ const [rows] = await db.query(...)
        const rows = await db.query(
        `
        SELECT 
            COALESCE(c.name, 'Uncategorized') AS category,
            SUM(i.line_total) AS net
        FROM pos_order_items i
        JOIN items m       ON m.id = i.item_id
        LEFT JOIN categories c  ON c.id = m.categoryId
        JOIN pos_orders o  ON o.order_id = i.order_id
        WHERE o.status IN ('paid','refunded')
        AND ${where}
        GROUP BY category
        ORDER BY net DESC
        LIMIT 5
        `
        );

        return res.json({
        ok: true,
        data: rows.map((r) => ({
            name: r.category,
            net: Number(r.net || 0),
        })),
        });
    } catch (e) {
        console.error("TOP 5 CATEGORY ERROR", e);
        res.status(500).json({ ok: false, error: e.message });
    }
    });

  /* =========================================================================
   * 2) CATEGORY SALES SERIES
   * ========================================================================= */
  router.get("/category-series", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;

      // reuse your existing helper
      const where = buildRangeSQL(range, from, to);

      let labelExpr;
      let groupByExpr;
      let orderByExpr;

      switch (range) {
        case "weeks":
          labelExpr = "YEARWEEK(o.closed_at, 1)";
          groupByExpr = labelExpr;
          orderByExpr = labelExpr;
          break;

        case "monthly":
          labelExpr = "DATE_FORMAT(o.closed_at, '%Y-%m')";
          groupByExpr = labelExpr;
          orderByExpr = labelExpr;
          break;

        case "quarterly":
          labelExpr = "CONCAT('Q', QUARTER(o.closed_at), ' ', YEAR(o.closed_at))";
          groupByExpr = labelExpr;
          orderByExpr = labelExpr;
          break;

        case "yearly":
          labelExpr = "YEAR(o.closed_at)";
          groupByExpr = labelExpr;
          orderByExpr = labelExpr;
          break;

        case "days":
        case "custom":
        default:
          labelExpr = "DATE(o.closed_at)";
          groupByExpr = labelExpr;
          orderByExpr = labelExpr;
          break;
      }

      const sql = `
        SELECT 
          ${labelExpr} AS label,
          SUM(i.line_total) AS total
        FROM pos_order_items i
        JOIN pos_orders o ON o.order_id = i.order_id
        WHERE o.status IN ('paid','refunded')
        AND ${where}
        GROUP BY ${groupByExpr}
        ORDER BY ${orderByExpr}
      `;

      // if you need to debug:
      // console.log('CATEGORY SERIES SQL:', sql);

      const rows = await db.query(sql);

      return res.json({
        ok: true,
        data: rows.map((r) => ({
          x: String(r.label),
          y: Number(r.total || 0),
        })),
      });
    } catch (e) {
      console.error("CATEGORY SERIES ERROR", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
   * 3) PAYMENT BREAKDOWN (REAL)
   * ========================================================================= */
  router.get("/payments", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      const rows = await db.query(
        `
        SELECT 
          p.method_name AS type,
          COUNT(*) AS tx,
          SUM(CASE WHEN p.is_refund = 0 THEN p.amount ELSE 0 END) AS payAmt,
          SUM(CASE WHEN p.is_refund = 1 THEN 1 ELSE 0 END) AS refundTx,
          SUM(CASE WHEN p.is_refund = 1 THEN p.amount ELSE 0 END) AS refundAmt
        FROM pos_order_payments p
        JOIN pos_orders o ON o.order_id = p.order_id
        WHERE o.status IN ('paid','refunded')
        AND ${where}
        GROUP BY p.method_name
        ORDER BY payAmt DESC
      `
      );

      const result = rows.map((r) => ({
        type: r.type,
        tx: Number(r.tx),
        payAmt: Number(r.payAmt || 0),
        refundTx: Number(r.refundTx || 0),
        refundAmt: Number(r.refundAmt || 0),
        net: Number(r.payAmt || 0) - Number(r.refundAmt || 0),
      }));

      res.json({ ok: true, data: result });
    } catch (e) {
      console.error("PAYMENTS ERROR", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
  * 4B) TOP 5 ITEMS INSIDE A CATEGORY (for Best Seller drilldown)
  * ========================================================================= */
  router.get("/best-sellers/:categoryId/top-items", async (req, res) => {
    try {
      const { categoryId } = req.params;
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      const catIdNum = Number(categoryId);

      // ✅ allow 0 for Uncategorized
      if (Number.isNaN(catIdNum) || catIdNum < 0) {
        return res.status(400).json({ ok: false, error: "Invalid categoryId" });
      }

      const categoryFilterSql =
        catIdNum === 0
          ? `(it.categoryId IS NULL OR it.categoryId = 0)`
          : `it.categoryId = ?`;

      const params = catIdNum === 0 ? [] : [catIdNum];

      const rows = await db.query(
        `
        SELECT
          oi.item_id,
          oi.item_name AS name,
          SUM(oi.qty) AS qty,
          COUNT(*) AS orders,
          SUM(oi.line_total) AS sales
        FROM pos_order_items oi
        JOIN pos_orders o ON o.order_id = oi.order_id
        JOIN items it ON it.id = oi.item_id
        WHERE o.status IN ('paid','refunded')
          AND ${categoryFilterSql}
          AND ${where}
        GROUP BY oi.item_id, oi.item_name
        ORDER BY sales DESC
        LIMIT 5
        `,
        params
      );

      return res.json({
        ok: true,
        data: rows.map((r, idx) => ({
          rank: idx + 1,
          item_id: r.item_id,
          name: r.name,
          orders: Number(r.orders || 0),
          qty: Number(r.qty || 0),
          sales: Number(r.sales || 0),
        })),
      });
    } catch (e) {
      console.error("TOP ITEMS IN CATEGORY ERROR", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
  * 4) BEST SELLERS (CATEGORIES)
  * ========================================================================= */
  router.get("/best-sellers", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      const rows = await db.query(
        `
        SELECT
          COALESCE(c.id, 0) AS category_id,
          COALESCE(c.name, 'Uncategorized') AS name,
          SUM(oi.qty) AS qty,
          COUNT(*) AS orders,
          SUM(oi.line_total) AS sales
        FROM pos_order_items oi
        JOIN pos_orders o ON o.order_id = oi.order_id
        JOIN items it ON it.id = oi.item_id
        LEFT JOIN categories c ON c.id = it.categoryId
        WHERE o.status IN ('paid','refunded')
          AND ${where}
        GROUP BY COALESCE(c.id, 0), COALESCE(c.name, 'Uncategorized')
        ORDER BY sales DESC
        LIMIT 20
        `
      );

      const list = rows.map((r, idx) => ({
        rank: idx + 1,
        categoryId: Number(r.category_id || 0),
        name: r.name, // category name
        orders: Number(r.orders || 0),
        qty: Number(r.qty || 0),
        sales: Number(r.sales || 0),
      }));

      res.json({ ok: true, data: list });
    } catch (e) {
      console.error("BEST SELLERS (CATEGORIES) ERROR", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
   * 5) LATEST ORDERS (REAL)
   * ========================================================================= */
    router.get("/orders", async (req, res) => {
    try {
        // we ignore range/from/to for receipts per your request
        const rows = await db.query(
        `
        SELECT 
            o.order_id,
            o.closed_at,
            o.net_amount AS total,
            o.status,
            COALESCE(
              NULLIF(CONCAT_WS(' ', e.first_name, e.last_name), ''),
              CONCAT('[Deleted User] ', COALESCE(o.created_by, 'Unknown'))
            ) AS staff_name
        FROM pos_orders o
        LEFT JOIN employees e ON e.employee_id = o.created_by
        WHERE o.status IN ('paid','refunded')
        ORDER BY o.closed_at DESC
        LIMIT 100
        `
        );

        const list = rows.map((r) => ({
        id: `#${r.order_id}`,
        date: r.closed_at,
        employee: r.staff_name,
        type: r.status === "refunded" ? "Refund" : "Sale",
        total: Number(r.total || 0),
        }));

        res.json({ ok: true, data: list });
    } catch (e) {
        console.error("ORDERS ERROR", e);
        res.status(500).json({ ok: false, error: e.message });
    }
    });

  /* =========================================================================
   * 6) STAFF PERFORMANCE (from pos_shifts)
   * ========================================================================= */
  router.get("/staff-performance", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;

      // we want the same kind of date filter but on s.opened_at instead of o.closed_at
      let where;
      if (range === "custom" && from && to) {
        where = `DATE(s.opened_at) BETWEEN DATE('${from}') AND DATE('${to}')`;
      } else {
        // reuse buildRangeSQL, just replace the column name
        const raw = buildRangeSQL(range, from, to);
        where = raw.replace(/o\.closed_at/g, "s.opened_at");
      }

      const rows = await db.query(
        `
        SELECT 
          s.shift_id,
          s.opened_at,
          s.opening_float,

          -- ✅ compute from pos_cash_moves instead of relying on pos_shifts columns
          COALESCE(cm.total_cash_in, 0)  AS total_cash_in,
          COALESCE(cm.total_cash_out, 0) AS total_cash_out,

          s.expected_cash,
          s.declared_cash,
          s.variance_cash,
          s.closing_note,
          COALESCE(
            NULLIF(CONCAT_WS(' ', e.first_name, e.last_name), ''),
            CONCAT('[Deleted User] ', COALESCE(s.employee_id, 'Unknown'))
          ) AS staff_name
        FROM pos_shifts s
        LEFT JOIN employees e ON e.employee_id = s.employee_id
        LEFT JOIN (
          SELECT
            shift_id,
            COALESCE(SUM(CASE WHEN type = 'cash_in'  THEN amount END), 0) AS total_cash_in,
            COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount END), 0) AS total_cash_out
          FROM pos_cash_moves
          GROUP BY shift_id
        ) cm ON cm.shift_id = s.shift_id
        WHERE ${where}
        ORDER BY s.opened_at DESC
        `
      );

      const list = rows.map((r) => {
        const cashIn = Number(r.total_cash_in || 0);
        const cashOut = Number(r.total_cash_out || 0);
        const variance = Number(r.variance_cash || 0);

        let remarks = r.closing_note || "";
        if (!remarks) {
          if (variance > 0) {
            remarks = `Over by ₱${variance.toFixed(2)}`;
          } else if (variance < 0) {
            remarks = `Short by ₱${Math.abs(variance).toFixed(2)}`;
          } else {
            remarks = "Balanced";
          }
        }

        return {
          shiftNo: r.shift_id,
          staffName: r.staff_name,
          date: r.opened_at, // front will format
          startingCash: Number(r.opening_float || 0),
          cashInOut: `+₱${cashIn.toFixed(2)} / -₱${cashOut.toFixed(2)}`,
          countCash: Number(r.expected_cash || 0),
          actualCash: Number(r.declared_cash || 0),
          remarks,
        };
      });

      res.json({ ok: true, data: list });
    } catch (e) {
      console.error("STAFF PERFORMANCE ERROR", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};