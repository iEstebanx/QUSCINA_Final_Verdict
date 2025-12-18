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
  * 3) BEST SELLERS (CATEGORIES)
  * ========================================================================= */

  // items column resolver (categoryId vs category_id, id vs item_id)
  let _itemsColsResolved = false;
  let _itemsTableMissing = false;
  let ITEMS_CATEGORY_COL = "categoryId";
  let ITEMS_PK_COL = "id";

  async function resolveItemsColumns(db) {
    if (_itemsColsResolved || _itemsTableMissing) return;
    try {
      const cols = await db.query(`SHOW COLUMNS FROM items`);
      const fields = new Set((cols || []).map((c) => c.Field));

      // items PK
      if (fields.has("id")) ITEMS_PK_COL = "id";
      else if (fields.has("item_id")) ITEMS_PK_COL = "item_id";

      // category FK
      if (fields.has("categoryId")) ITEMS_CATEGORY_COL = "categoryId";
      else if (fields.has("category_id")) ITEMS_CATEGORY_COL = "category_id";

      _itemsColsResolved = true;
    } catch (e) {
      if (e?.code === "ER_NO_SUCH_TABLE") _itemsTableMissing = true;
      _itemsColsResolved = true;
    }
  }

  router.get("/best-sellers", async (req, res) => {
    try {
      const { range = "days", from, to } = req.query;
      const where = buildRangeSQL(range, from, to);

      await resolveItemsColumns(db);

      // If items table doesn't exist, can't map item -> category
      if (_itemsTableMissing) {
        return res.json({ ok: true, bestSellers: [] });
      }

      const rows = await db.query(
        `
        SELECT
          COALESCE(c.id, 0) AS category_id,
          COALESCE(c.name, 'Uncategorized') AS name,
          SUM(oi.qty) AS orders,
          SUM(oi.line_total) AS sales
        FROM pos_order_items oi
        JOIN pos_orders o ON oi.order_id = o.order_id
        LEFT JOIN items it ON it.${ITEMS_PK_COL} = oi.item_id
        LEFT JOIN categories c ON c.id = it.${ITEMS_CATEGORY_COL}
        WHERE o.status IN ('paid','refunded')
        AND ${where}
        GROUP BY COALESCE(c.id, 0), COALESCE(c.name, 'Uncategorized')
        ORDER BY sales DESC
        LIMIT 10
        `
      );

      const list = (rows || []).map((r) => ({
        name: r.name,                 // ✅ category name
        orders: Number(r.orders) || 0, // ✅ total qty sold under that category
        sales: Number(r.sales) || 0,
        trend: "up",
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