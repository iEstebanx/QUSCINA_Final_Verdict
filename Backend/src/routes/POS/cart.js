// QUSCINA_BACKOFFICE/Backend/src/routes/POS/cart.js
const express = require("express");
const bcrypt = require("bcryptjs");

module.exports = function posCartRouterFactory({ db }) {
  if (!db) {
    throw new Error("[POS cart] DB pool is required");
  }

  const router = express.Router();

  // POST /pos/menu/cart/verify-pin
  router.post("/verify-pin", async (req, res) => {
    const { pin } = req.body || {};
    if (!pin || typeof pin !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "PIN is required" });
    }

    try {
      // ⚠️ Adjust this query to match whatever you used on Cashier POS
      // e.g. maybe you have table: pos_pins, or employees.approval_pin_hash, etc.
      const [rows] = await db.query(
        `
          SELECT id, pin_hash
          FROM pos_approval_pins
          WHERE is_active = 1
        `
      );

      let match = null;
      for (const row of rows) {
        const ok = await bcrypt.compare(pin, row.pin_hash);
        if (ok) {
          match = row;
          break;
        }
      }

      if (!match) {
        return res
          .status(401)
          .json({ ok: false, error: "Invalid PIN" });
      }

      // Optionally include info about who/what kind of pin this is
      res.json({ ok: true });
    } catch (err) {
      console.error("[POS cart] POST /verify-pin failed:", err);
      res
        .status(500)
        .json({ ok: false, error: "Server error while verifying PIN" });
    }
  });

  return router;
};