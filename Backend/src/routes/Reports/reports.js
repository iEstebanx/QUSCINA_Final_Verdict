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

      let sql = "";
      if (range === "days" || range === "custom") {
        sql = `
          SELECT 
            DATE(o.closed_at) AS label,
            SUM(i.line_total) AS total
          FROM pos_order_items i
          JOIN pos_orders o ON o.order_id = i.order_id
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL(range, from, to)}
          GROUP BY DATE(o.closed_at)
          ORDER BY DATE(o.closed_at)
        `;
      } else if (range === "weeks") {
        sql = `
          SELECT 
            YEARWEEK(o.closed_at, 1) AS label,
            SUM(i.line_total) AS total
          FROM pos_order_items i
          JOIN pos_orders o ON o.order_id = i.order_id
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL("weeks")}
          GROUP BY YEARWEEK(o.closed_at, 1)
        `;
      } else if (range === "monthly") {
        sql = `
          SELECT 
            DATE_FORMAT(o.closed_at, '%Y-%m') AS label,
            SUM(i.line_total) AS total
          FROM pos_order_items i
          JOIN pos_orders o ON o.order_id = i.order_id
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL("monthly")}
          GROUP BY YEAR(o.closed_at), MONTH(o.closed_at)
        `;
      } else if (range === "quarterly") {
        sql = `
          SELECT 
            CONCAT('Q', QUARTER(o.closed_at), ' ', YEAR(o.closed_at)) AS label,
            SUM(i.line_total) AS total
          FROM pos_order_items i
          JOIN pos_orders o ON o.order_id = i.order_id
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL("quarterly")}
          GROUP BY YEAR(o.closed_at), QUARTER(o.closed_at)
        `;
      } else if (range === "yearly") {
        sql = `
          SELECT 
            YEAR(o.closed_at) AS label,
            SUM(i.line_total) AS total
          FROM pos_order_items i
          JOIN pos_orders o ON o.order_id = i.order_id
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL("yearly")}
          GROUP BY YEAR(o.closed_at)
        `;
      }

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
   * 4) BEST SELLERS (REAL)
   * ========================================================================= */
  router.get("/best-sellers", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      const rows = await db.query(
        `
        SELECT 
          i.item_name AS name,
          SUM(i.qty) AS qty,
          COUNT(*) AS orders,
          SUM(i.line_total) AS sales
        FROM pos_order_items i
        JOIN pos_orders o ON o.order_id = i.order_id
        WHERE o.status IN ('paid','refunded')
        AND ${where}
        GROUP BY i.item_name
        ORDER BY sales DESC
        LIMIT 20
      `
      );

      const list = rows.map((r, idx) => ({
        rank: idx + 1,
        name: r.name,
        orders: Number(r.orders || 0),
        qty: Number(r.qty || 0),
        sales: Number(r.sales || 0),
      }));

      res.json({ ok: true, data: list });
    } catch (e) {
      console.error("BEST SELLERS ERROR", e);
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
            e.first_name,
            e.last_name
        FROM pos_orders o
        JOIN employees e ON e.employee_id = o.created_by
        WHERE o.status IN ('paid','refunded')
        ORDER BY o.closed_at DESC
        LIMIT 100
        `
        );

        const list = rows.map((r) => ({
        id: `#${r.order_id}`,
        date: r.closed_at,
        employee: `${r.first_name} ${r.last_name}`,
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
          s.total_cash_in,
          s.total_cash_out,
          s.expected_cash,
          s.declared_cash,
          s.variance_cash,
          s.closing_note,
          e.first_name,
          e.last_name
        FROM pos_shifts s
        JOIN employees e ON e.employee_id = s.employee_id
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
          staffName: `${r.first_name} ${r.last_name}`,
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