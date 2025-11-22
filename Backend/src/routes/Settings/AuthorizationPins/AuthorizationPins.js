// QUSCINA_BACKOFFICE/src/pages/Settings/AuthorizationPins/AuthorizationPins.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Prefer DI from server.js, but fall back to shared pool if not provided
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch {
  /* ok until DI passes db */
}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
  const APP_DEFAULT = "backoffice";

  function getAppRealm(req) {
    const fromBody = String(req.body?.app || "").trim().toLowerCase();
    const fromQuery = String(req.query?.app || "").trim().toLowerCase();
    const fromHeader = String(req.headers["x-app"] || "").trim().toLowerCase();
    const app = fromBody || fromQuery || fromHeader || APP_DEFAULT;
    return app === "pos" ? "pos" : "backoffice";
  }

  function requireAuth(req, res, next) {
    const auth = req.headers.authorization || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const token = bearer || req.cookies?.qd_token || null;

    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload; // { employeeId, role, name, ... } from auth.js
      next();
    } catch (e) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  async function logAuditTrail(req, action, detail) {
    try {
      const user = req.user || {};

      const employeeName =
        user.name ||
        user.fullName ||
        user.username ||
        (user.employeeId ? `#${user.employeeId}` : "Unknown");

      const role =
        user.role ||
        user.position ||
        "—";

      await db.query(
        `INSERT INTO audit_trail (employee, role, action, detail)
        VALUES (?, ?, ?, ?)`,
        [
          employeeName,
          role,
          action,
          JSON.stringify(detail || null),
        ]
      );
    } catch (err) {
      console.error("Failed to write authorization PIN audit log:", err);
    }
  }
    

  // GET /api/settings/authorization-pins
  // Returns whether a PIN is configured for this app
  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const app = getAppRealm(req);

      const rows = await db.query(
        `SELECT id, app, is_active, last_changed_by, created_at, updated_at
           FROM authorization_pins
          WHERE app = ? AND is_active = 1
          ORDER BY updated_at DESC
          LIMIT 1`,
        [app]
      );

      if (!rows.length) {
        return res.json({
          ok: true,
          hasPin: false,
          pin: null,
        });
      }

      const row = rows[0];
      return res.json({
        ok: true,
        hasPin: !!row.is_active,
        pin: {
          id: row.id,
          app: row.app,
          isActive: !!row.is_active,
          lastChangedBy: row.last_changed_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /api/settings/authorization-pins
   * body: { mode: "set" | "change", currentPin?, newPin, app? }
   *
   * - mode = "set":
   *    • if no existing PIN → just set it
   *    • if existing PIN → allow FORCE reset without currentPin (admin use)
   * - mode = "change":
   *    • existing PIN is required + currentPin must match
   */
  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const app = getAppRealm(req);
      const { mode, currentPin, newPin } = req.body || {};
      const pinPattern = /^\d{4,6}$/;

      if (!pinPattern.test(String(newPin || ""))) {
        return res
          .status(400)
          .json({ error: "PIN must be 4–6 digits.", code: "INVALID_PIN" });
      }

      // Current active PIN for this app
      const existingRows = await db.query(
        `SELECT id, pin_hash
           FROM authorization_pins
          WHERE app = ? AND is_active = 1
          ORDER BY updated_at DESC
          LIMIT 1`,
        [app]
      );
      const existing = existingRows[0] || null;

      // If mode is "change", enforce verifying current PIN
      if (mode === "change") {
        if (!existing) {
          return res.status(400).json({
            error: "No existing PIN is configured.",
            code: "NO_EXISTING_PIN",
          });
        }

        if (!currentPin) {
          return res.status(400).json({
            error: "Current PIN is required.",
            code: "CURRENT_REQUIRED",
          });
        }

        const ok = await bcrypt.compare(
          String(currentPin),
          existing.pin_hash
        );
        if (!ok) {
          return res
            .status(400)
            .json({ error: "Current PIN is incorrect.", code: "BAD_CURRENT" });
        }
      }

      // Hash the new PIN
      const hash = await bcrypt.hash(String(newPin), 10);

      // Deactivate previous active PIN(s)
      await db.query(
        `UPDATE authorization_pins
            SET is_active = 0
          WHERE app = ? AND is_active = 1`,
        [app]
      );

      const lastChangedBy = req.user?.employeeId || req.user?.sub || null;

      // Insert new PIN row
      await db.query(
        `INSERT INTO authorization_pins
            (app, pin_hash, is_active, last_changed_by)
         VALUES (?, ?, 1, ?)`,
        [app, hash, lastChangedBy || null]
      );

      // 🔹 Decide how to label this change
      const hasExisting = !!existing;
      const baseAction = "System - Authorization PIN";
      let actionText;
      let statusKey;

      if (!hasExisting && mode === "set") {
        actionText = `${baseAction} Set`;
        statusKey = "PIN_SET";
      } else if (hasExisting && mode === "set") {
        actionText = `${baseAction} Reset`;
        statusKey = "PIN_RESET";
      } else {
        // mode === "change"
        actionText = `${baseAction} Changed`;
        statusKey = "PIN_CHANGED";
      }

      const actor = {
        id: req.user?.employeeId || req.user?.sub || null,
        name:
          req.user?.name ||
          req.user?.fullName ||
          req.user?.username ||
          null,
        role: req.user?.role || req.user?.position || null,
      };

      await logAuditTrail(req, actionText, {
        actionDetails: {
          actionType:
            !hasExisting && mode === "set"
              ? "authorization_pin_set"
              : hasExisting && mode === "set"
              ? "authorization_pin_reset"
              : "authorization_pin_change",
          app,
          mode, // "set" | "change"
          triggerSource: "Backoffice Settings > Authorization PINs",
        },
        affectedData: {
          items: [
            {
              name: "Authorization PIN (void / refund / open-shift cash limit)",
            },
          ],
          statusChange: statusKey, // PIN_SET | PIN_CHANGED | PIN_RESET
        },
        actor,
        meta: {
          ip: req.ip,
          userAgent: req.headers["user-agent"] || "",
        },
      });

      return res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
};