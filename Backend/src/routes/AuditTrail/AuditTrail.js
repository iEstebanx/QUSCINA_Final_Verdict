// QUSCINA_BACKOFFICE/Backend/src/routes/AuditTrail/AuditTrail.js
const { Router } = require("express");

module.exports = ({ db }) => {
  const r = Router();

  // ---------------------------------------------------------
  // GET /api/audit-trail  (all logs with optional filters)
  // ---------------------------------------------------------
  r.get("/", async (req, res) => {
    try {
      const { employee, startDate, endDate } = req.query;

      let q = `
        SELECT
          id,
          employee,
          role,
          action,
          DATE_FORMAT(timestamp, '%b %d, %Y %h:%i %p') AS timestamp,
          detail
        FROM audit_trail
        WHERE 1
      `;

      const params = [];

      if (employee && employee !== "All Employees") {
        q += " AND employee = ?";
        params.push(employee);
      }

      if (startDate) {
        q += " AND DATE(timestamp) >= ?";
        params.push(startDate);
      }

      if (endDate) {
        q += " AND DATE(timestamp) <= ?";
        params.push(endDate);
      }

      q += " ORDER BY id DESC"; 

      // 🔹 IMPORTANT: db.query returns rows array directly in your setup
      const rows = await db.query(q, params);

      // Parse JSON detail safely
      const normalized = rows.map((row) => {
        let detail = row.detail;

        if (typeof detail === "string" && detail.trim()) {
          try {
            detail = JSON.parse(detail);
          } catch (e) {
            console.warn("Failed to parse audit_trail.detail JSON for id", row.id, e);
            detail = null;
          }
        }

        return {
          ...row,
          detail,
        };
      });

      res.json({ ok: true, data: normalized });
    } catch (err) {
      console.error("AuditTrail GET failed:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---------------------------------------------------------
  // POST /api/audit-trail/add  (insert new log)
  // Used by BACKUP + RESTORE
  // ---------------------------------------------------------
 r.post("/add", async (req, res) => {
  try {
    const { employee, role, action, detail } = req.body;

    if (!action || !detail) {
      return res.status(400).json({ ok: false, error: "Missing fields." });
    }

    // ✅ allow client/server callers to omit employee/role
    const employeeFinal =
      employee ||
      req.user?.username ||
      req.user?.name ||
      "—";

    const roleFinal =
      role ||
      req.user?.role ||
      "—";

    const q = `
      INSERT INTO audit_trail (employee, role, action, detail)
      VALUES (?, ?, ?, ?)
    `;

    await db.query(q, [
      employeeFinal,
      roleFinal,
      action,
      JSON.stringify(detail),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error("AuditTrail ADD failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

  return r;
};