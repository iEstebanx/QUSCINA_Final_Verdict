// QUSCINA_BACKOFFICE/Backend/src/routes/Dashboard/dashboard.js
const express = require("express");

module.exports = ({ db }) => {
  const router = express.Router();

  /* --------------------------- Helper: RANGE SQL --------------------------- */
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
        return `
          DATE(o.closed_at) BETWEEN DATE('${from}') AND DATE('${to}')
        `;

      default:
        return `DATE(o.closed_at) = CURDATE()`;
    }
  }

  /* =========================================================================
   * 1) TOTAL METRICS (sales, orders, avg order)
   * ========================================================================= */
  router.get("/metrics", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      const rows = await db.query(
        `
        SELECT
          COUNT(*) AS totalOrders,
          COALESCE(SUM(o.net_amount), 0) AS totalSales,
          COALESCE(AVG(o.net_amount), 0) AS averageOrder
        FROM pos_orders o
        WHERE o.status IN ('paid','refunded')
        AND ${where}
        `
      );

      const row = rows[0] || {
        totalOrders: 0,
        totalSales: 0,
        averageOrder: 0,
      };

      return res.json({ ok: true, metrics: row });
    } catch (e) {
      console.error("[dashboard/metrics]", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
   * 2) SALES SERIES (chart)
   * ========================================================================= */
  router.get("/sales-series", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;

      let sql = "";
      if (range === "days" || range === "custom") {
        sql = `
          SELECT 
            DATE(o.closed_at) AS label,
            SUM(o.net_amount) AS sales,
            COUNT(*) AS orders
          FROM pos_orders o
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL(range, from, to)}
          GROUP BY DATE(o.closed_at)
          ORDER BY DATE(o.closed_at)
        `;
      } else if (range === "weeks") {
        sql = `
          SELECT 
            YEARWEEK(o.closed_at, 1) AS label,
            SUM(o.net_amount) AS sales,
            COUNT(*) AS orders
          FROM pos_orders o
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL("weeks")}
          GROUP BY YEARWEEK(o.closed_at, 1)
        `;
      } else if (range === "monthly") {
        sql = `
          SELECT 
            DATE_FORMAT(o.closed_at, '%Y-%m') AS label,
            SUM(o.net_amount) AS sales,
            COUNT(*) AS orders
          FROM pos_orders o
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL("monthly")}
          GROUP BY YEAR(o.closed_at), MONTH(o.closed_at)
        `;
      } else if (range === "yearly") {
        sql = `
          SELECT 
            YEAR(o.closed_at) AS label,
            SUM(o.net_amount) AS sales,
            COUNT(*) AS orders
          FROM pos_orders o
          WHERE o.status IN ('paid','refunded')
          AND ${buildRangeSQL("yearly")}
          GROUP BY YEAR(o.closed_at)
        `;
      }

      const out = await db.query(sql);

      // Rechart expects: { name, sales, orders }
      const series = out.map((r) => ({
        name: String(r.label),
        sales: Number(r.sales) || 0,
        orders: Number(r.orders) || 0,
      }));

      return res.json({ ok: true, series });
    } catch (e) {
      console.error("[dashboard/sales-series]", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
   * 3) BEST SELLERS
   * ========================================================================= */
  router.get("/best-sellers", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      const rows = await db.query(
        `
        SELECT
          i.item_id,
          i.item_name AS name,
          SUM(i.qty) AS orders,
          SUM(i.line_total) AS sales
        FROM pos_order_items i
        JOIN pos_orders o ON i.order_id = o.order_id
        WHERE o.status IN ('paid','refunded')
        AND ${where}
        GROUP BY i.item_id, i.item_name
        ORDER BY sales DESC
        LIMIT 10
        `
      );

      const list = rows.map((r) => ({
        name: r.name,
        orders: Number(r.orders) || 0,
        sales: Number(r.sales) || 0,
        trend: "up", // real trend requires comparing previous period
      }));

      return res.json({ ok: true, bestSellers: list });
    } catch (e) {
      console.error("[dashboard/best-sellers]", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* =========================================================================
   * 4) PAYMENT METHOD BREAKDOWN
   * ========================================================================= */
  router.get("/payments", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      const rows = await db.query(
        `
        SELECT
          p.method_name AS name,
          COUNT(*) AS transactions,
          SUM(p.amount) AS amount
        FROM pos_order_payments p
        JOIN pos_orders o ON o.order_id = p.order_id
        WHERE p.is_refund = 0
        AND o.status IN ('paid','refunded')
        AND ${where}
        GROUP BY p.method_name
        ORDER BY amount DESC
        `
      );

      // pie chart expects: {name, value(percentage), amount, transactions}
      const total = rows.reduce((s, r) => s + Number(r.amount), 0) || 1;

      const list = rows.map((r) => ({
        name: r.name,
        amount: Number(r.amount),
        transactions: Number(r.transactions),
        value: Number(((Number(r.amount) / total) * 100).toFixed(2)),
      }));

      return res.json({ ok: true, payments: list });
    } catch (e) {
      console.error("[dashboard/payments]", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};