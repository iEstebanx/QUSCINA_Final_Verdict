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
 * 0) AVAILABLE YEARS (for dropdown)
 * ========================================================================= */
router.get("/available-years", async (req, res) => {
  try {
    // only years that have transactions that matter to dashboard
    const rows = await db.query(`
      SELECT DISTINCT YEAR(o.closed_at) AS y
      FROM pos_orders o
      WHERE o.status IN ('paid','refunded')
      AND o.closed_at IS NOT NULL
      ORDER BY y DESC
    `);

    const years = (rows || [])
      .map((r) => Number(r.y))
      .filter((y) => Number.isFinite(y));

    return res.json({ ok: true, years });
  } catch (e) {
    console.error("[dashboard/available-years]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================================================
 * 0b) AVAILABLE MONTHS (for dropdown) - months that have txns in given year
 * ========================================================================= */
router.get("/available-months", async (req, res) => {
  try {
    const year = Number(req.query.year);
    if (!Number.isFinite(year)) {
      return res.status(400).json({ ok: false, error: "year is required" });
    }

    const rows = await db.query(
      `
      SELECT DISTINCT MONTH(o.closed_at) AS m
      FROM pos_orders o
      WHERE o.status IN ('paid','refunded')
        AND o.closed_at IS NOT NULL
        AND YEAR(o.closed_at) = ?
      ORDER BY m ASC
      `,
      [year]
    );

    const months = (rows || [])
      .map((r) => Number(r.m))        // 1..12
      .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12)
      .map((m) => m - 1);             // convert to 0..11 for dayjs UI

    return res.json({ ok: true, months });
  } catch (e) {
    console.error("[dashboard/available-months]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================================================
 * 0c) AVAILABLE WEEKS (for dropdown) - weeks that have txns in given year+month
 *    returns monday keys: ["YYYY-MM-DD", ...]
 * ========================================================================= */
router.get("/available-weeks", async (req, res) => {
  try {
    const year = Number(req.query.year);
    const monthIndex = Number(req.query.month); // 0..11 from UI

    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
      return res.status(400).json({ ok: false, error: "year and month are required" });
    }
    if (monthIndex < 0 || monthIndex > 11) {
      return res.status(400).json({ ok: false, error: "month must be 0..11" });
    }

    const month = monthIndex + 1; // SQL MONTH() is 1..12

    const rows = await db.query(
      `
      SELECT DISTINCT
        DATE_FORMAT(
          DATE_SUB(DATE(o.closed_at), INTERVAL WEEKDAY(o.closed_at) DAY),
          '%Y-%m-%d'
        ) AS monday_key
      FROM pos_orders o
      WHERE o.status IN ('paid','refunded')
        AND o.closed_at IS NOT NULL
        AND YEAR(o.closed_at) = ?
        AND MONTH(o.closed_at) = ?
      ORDER BY monday_key ASC
      `,
      [year, month]
    );

    const weeks = (rows || [])
      .map((r) => String(r.monday_key))
      .filter(Boolean);

    return res.json({ ok: true, weeks });
  } catch (e) {
    console.error("[dashboard/available-weeks]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================================================
 * 0d) DATE BOUNDS (first and last order date)
 * ========================================================================= */
router.get("/date-bounds", async (req, res) => {
  try {
    const rows = await db.query(
      `
      SELECT 
        MIN(DATE(o.closed_at)) AS minDate,
        MAX(DATE(o.closed_at)) AS maxDate
      FROM pos_orders o
      WHERE o.status IN ('paid','refunded')
        AND o.closed_at IS NOT NULL
      `
    );

    const row = rows[0] || {};
    return res.json({
      ok: true,
      minDate: row.minDate || null,
      maxDate: row.maxDate || null,
    });
  } catch (e) {
    console.error("[dashboard/date-bounds]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================================================
 * 0e) ACTIVE DAYS (days that have transactions)
 * ========================================================================= */
router.get("/active-days", async (req, res) => {
  try {
    const rows = await db.query(
      `
      SELECT DISTINCT DATE(o.closed_at) AS day
      FROM pos_orders o
      WHERE o.status IN ('paid','refunded')
        AND o.closed_at IS NOT NULL
      ORDER BY day
      `
    );

    const days = (rows || [])
      .map((r) => r.day)
      .filter(Boolean)
      .map((d) =>
        d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
      );

    return res.json({ ok: true, days });
  } catch (e) {
    console.error("[dashboard/active-days]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

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