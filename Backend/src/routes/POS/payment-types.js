// Backend/src/routes/POS/payment-types.js
const express = require("express");

// Normalize any db.query result into an array of rows
function asArray(result) {
  if (!result) return [];
  if (Array.isArray(result[0]) && result.length >= 1) {
    // mysql2 [rows, fields]
    return result[0];
  }
  if (Array.isArray(result)) return result;
  return [];
}

module.exports = ({ db }) => {
  const router = express.Router();

  // GET only active payment methods sorted
  router.get("/", async (_req, res) => {
    try {
      const rows = asArray(
        await db.query(
          `
          SELECT id, name, sort_order
          FROM payment_types
          WHERE active = 1
          ORDER BY sort_order ASC, name ASC
          `
        )
      );

      res.json(rows); // <- plain array like [{id, name, sort_order}, ...]
    } catch (err) {
      console.error("[payment-types] failed:", err);
      res.status(500).json({ error: "Failed to load payment types" });
    }
  });

  return router;
};