// QUSCINA_BACKOFFICE/Backend/src/routes/Settings/PaymentType/PaymentType.js
const express = require("express");
const { requireAuth } = require("../../../auth/requireAuth");


// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../../shared/db/mysql").db;
} catch {}

const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

/* ====================== AUDIT HELPERS ====================== */

function getAuditUser(req) {
  const u = req.user;
  if (!u) {
    return {
      employee: "System",
      role: "—",
      id: null,
    };
  }

  const employee =
    u.employeeName ||
    u.name ||
    u.username ||
    u.email ||
    `Employee #${u.employeeId || u.sub || "Unknown"}`;

  return {
    employee,
    role: u.role || "—",
    id: u.employeeId || u.sub || null,
  };
}

async function logPaymentTypeAudit(db, req, { action, detail }) {
  const u = getAuditUser(req);

  const finalDetail = {
    ...(detail || {}),
    actionDetails: {
      app: "backoffice",
      module: "payment-types",
      ...(detail?.actionDetails || {}),
    },
    meta: {
      app: "backoffice",
      userId: u.id,
      role: u.role,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "",
      ...(detail?.meta || {}),
    },
  };

  await db.query(
    `INSERT INTO audit_trail (employee, role, action, detail)
     VALUES (?, ?, ?, ?)`,
    [u.employee, u.role, action, JSON.stringify(finalDetail)]
  );
}

async function logPaymentTypeAuditSafe(db, req, payload) {
  try {
    await logPaymentTypeAudit(db, req, payload);
  } catch (err) {
    console.error("[settings/payment-type] failed to write audit trail:", err);
  }
}

/* ====================== ROUTER FACTORY ====================== */

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();
  router.use(express.json());

  // 🔐 Protect all Payment Type routes so req.user is available for audit logging
  router.use(requireAuth);

  /* ========= GET /api/settings/payment-type ========= */
  router.get("/", async (_req, res, next) => {
    try {
      const rows = await db.query(
        `SELECT id, name, active, sort_order, created_at, updated_at
           FROM payment_types
          ORDER BY active DESC, sort_order ASC, name_lower ASC`
      );
      const items = rows.map((r) => ({
        id: String(r.id),
        name: r.name,
        active: !!r.active,
        sortOrder: Number(r.sort_order || 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json({ ok: true, paymentTypes: items });
    } catch (e) {
      next(e);
    }
  });

  /* ========= POST (create) ========= */
  router.post("/", async (req, res, next) => {
    try {
      const name = normalize(req.body?.name);
      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }

      const active =
        req.body?.active != null ? (req.body.active ? 1 : 0) : 1;
      const sortOrder = Number.isFinite(+req.body?.sortOrder)
        ? +req.body.sortOrder
        : 0;

      const now = new Date();
      const result = await db.query(
        `INSERT INTO payment_types (name, name_lower, active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, name.toLowerCase(), active, sortOrder, now, now]
      );

      const id = result.insertId;

      // 🔹 AUDIT: Payment Type Created
      await logPaymentTypeAuditSafe(db, req, {
        action: "Payment Type Created",
        detail: {
          statusMessage: `Payment type "${name}" created.`,
          actionDetails: {
            actionType: "create",
            paymentTypeId: id,
            name,
            active: !!active,
            sortOrder,
          },
          affectedData: {
            items: [{ id: String(id), name }],
            statusChange: "NONE",
          },
        },
      });

      res.status(201).json({ ok: true, id: String(id) });
    } catch (e) {
      if (
        e?.code === "ER_DUP_ENTRY" &&
        /uq_payment_types_name_lower/i.test(e?.message || "")
      ) {
        return res
          .status(409)
          .json({
            ok: false,
            code: "name_taken",
            error: "Payment type already exists.",
          });
      }
      next(e);
    }
  });

  /* ========= PATCH (rename / toggle / sort) ========= */
  router.patch("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res
          .status(400)
          .json({ ok: false, error: "invalid id" });

      // Fetch "before" snapshot for audit
      const beforeRows = await db.query(
        `SELECT id, name, active, sort_order, created_at, updated_at
           FROM payment_types
          WHERE id = ?
          LIMIT 1`,
        [id]
      );
      const before = beforeRows[0] || null;

      const sets = ["updated_at = ?"];
      const params = [new Date()];
      const patch = {};

      if (typeof req.body?.name === "string") {
        const n = normalize(req.body.name);
        if (!isValidName(n)) {
          return res.status(400).json({
            ok: false,
            error:
              "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
          });
        }
        sets.push("name = ?", "name_lower = ?");
        params.push(n, n.toLowerCase());
        patch.name = n;
      }

      if (typeof req.body?.active !== "undefined") {
        sets.push("active = ?");
        const activeVal = req.body.active ? 1 : 0;
        params.push(activeVal);
        patch.active = !!req.body.active;
      }

      if (typeof req.body?.sortOrder !== "undefined") {
        const so = Number(req.body.sortOrder);
        const finalSo = Number.isFinite(so) ? so : 0;
        sets.push("sort_order = ?");
        params.push(finalSo);
        patch.sortOrder = finalSo;
      }

      if (sets.length === 1) {
        return res
          .status(400)
          .json({ ok: false, error: "no changes" });
      }

      params.push(id);
      await db.query(
        `UPDATE payment_types SET ${sets.join(", ")} WHERE id = ?`,
        params
      );

      // Fetch "after" snapshot
      const afterRows = await db.query(
        `SELECT id, name, active, sort_order, created_at, updated_at
           FROM payment_types
          WHERE id = ?
          LIMIT 1`,
        [id]
      );
      const after = afterRows[0] || null;

      // 🔹 AUDIT: Payment Type Updated
      const displayName =
        (after && after.name) ||
        (before && before.name) ||
        `ID ${id}`;

      await logPaymentTypeAuditSafe(db, req, {
        action: "Payment Type Updated",
        detail: {
          statusMessage: `Payment type "${displayName}" updated.`,
          actionDetails: {
            actionType: "update",
            paymentTypeId: id,
            before,
            patch,
          },
          affectedData: {
            items: [{ id: String(id), name: displayName }],
            statusChange: "NONE",
          },
        },
      });

      res.json({ ok: true });
    } catch (e) {
      if (
        e?.code === "ER_DUP_ENTRY" &&
        /uq_payment_types_name_lower/i.test(e?.message || "")
      ) {
        return res
          .status(409)
          .json({
            ok: false,
            code: "name_taken",
            error: "Payment type already exists.",
          });
      }
      next(e);
    }
  });

  /* ========= DELETE (bulk) ========= */
  router.delete("/", async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map(Number).filter(Number.isFinite)
        : [];
      if (!ids.length)
        return res
          .status(400)
          .json({ ok: false, error: "ids is required" });

      const placeholders = ids.map(() => "?").join(",");

      // Fetch existing rows for audit (names)
      const existing = await db.query(
        `SELECT id, name
           FROM payment_types
          WHERE id IN (${placeholders})`,
        ids
      );

      await db.query(
        `DELETE FROM payment_types WHERE id IN (${placeholders})`,
        ids
      );

      // 🔹 AUDIT: Payment Types Bulk Deleted
      await logPaymentTypeAuditSafe(db, req, {
        action: "Payment Types Bulk Deleted",
        detail: {
          statusMessage: `Deleted ${ids.length} payment type(s).`,
          actionDetails: {
            actionType: "bulk-delete",
            ids,
            deleted: existing.map((r) => ({
              id: String(r.id),
              name: r.name,
            })),
          },
          affectedData: {
            items: existing.map((r) => ({
              id: String(r.id),
              name: r.name,
            })),
            statusChange: "NONE",
          },
        },
      });

      res.json({ ok: true, deleted: ids.length });
    } catch (e) {
      next(e);
    }
  });

  /* ========= DELETE (single) ========= */
  router.delete("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res
          .status(400)
          .json({ ok: false, error: "invalid id" });

      let name = null;
      try {
        const rows = await db.query(
          `SELECT id, name FROM payment_types WHERE id = ? LIMIT 1`,
          [id]
        );
        if (rows[0]) name = rows[0].name;
      } catch {
        // ignore; best-effort
      }

      await db.query(`DELETE FROM payment_types WHERE id = ?`, [id]);

      // 🔹 AUDIT: Payment Type Deleted
      const displayName = name || `ID ${id}`;
      await logPaymentTypeAuditSafe(db, req, {
        action: "Payment Type Deleted",
        detail: {
          statusMessage: `Payment type "${displayName}" deleted.`,
          actionDetails: {
            actionType: "delete",
            paymentTypeId: id,
            name,
          },
          affectedData: {
            items: [{ id: String(id), name }],
            statusChange: "NONE",
          },
        },
      });

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
};