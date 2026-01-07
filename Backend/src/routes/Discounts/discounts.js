// QUSCINA_BACKOFFICE/Backend/src/routes/Discounts/discounts.js
const express = require("express");
const { requireAuth } = require("../../auth/requireAuth");

let sharedDb = null;
try { sharedDb = require("../../shared/db/mysql").db; } catch {}

function formatDiscCode(n) {
  return `DISC-${String(n).padStart(6, "0")}`;
}

// Normalize mysql2/promise results
function asRows(result) {
  if (!result) return [];
  // mysql2/promise: [rows, fields]
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  // already rows
  if (Array.isArray(result)) return result;
  return [];
}

function asPacket(result) {
  if (!result) return {};
  // mysql2/promise: [OkPacket, fields]
  if (Array.isArray(result) && result[0] && !Array.isArray(result[0])) return result[0];
  return result; // already OkPacket
}

/**
 * Map raw discount row into a compact item object for audit trail.
 */
function mapDiscountItem(d) {
  if (!d) return null;
  return {
    name: d.name,
    code: d.code,
    value: Number(d.value),
    type: d.type,
    scope: d.scope,
    isStackable: d.isStackable ? 1 : 0,
    requiresApproval: d.requiresApproval ? 1 : 0,
    isActive: d.isActive ? 1 : 0,
  };
}

function getAuditUserFromReq(req) {
  // your real JWT payload from requireAuth.js
  const authUser = req?.user || null;

  if (!authUser) return null;

  const employeeName =
    authUser.employeeName ||
    authUser.name ||
    authUser.username ||
    authUser.email ||
    `Employee #${authUser.employeeId || authUser.sub || "Unknown"}`;

  return {
    employeeName,
    role: authUser.role || "—",
    id: authUser.employeeId || authUser.sub || null,
    username: authUser.username || null,
  };
}

/**
 * Core audit writer for discounts module.
 * detail shape is compatible with your AuditTrailPage "generic" view.
 */
async function logDiscountAudit(db, req, {
  action,
  actionType,
  discount,
  discounts,
  extra = {},
}) {
  const user = getAuditUserFromReq(req);   // ✅ use authUser payload

  const employee = user?.employeeName || "System";
  const role = user?.role || "—";

  const items = [];
  const singleItem = mapDiscountItem(discount);
  if (singleItem) items.push(singleItem);

  if (Array.isArray(discounts)) {
    discounts.forEach((d) => {
      const mapped = mapDiscountItem(d);
      if (mapped) items.push(mapped);
    });
  }

  const detail = {
    statusMessage: extra.statusMessage || undefined,

    actionDetails: {
      app: "backoffice",
      module: "discounts",
      actionType,
      ...(extra.actionDetails || {}),
    },

    affectedData: {
      items,
      // For discounts we don't tie into AUTH_STATUS_LEGEND, so keep it NONE
      statusChange: "NONE",
    },

    meta: {
      app: "backoffice",
      userId: user?.id ?? null,
      username: user?.username || null,
      role,
      ip: req?.ip,
      userAgent: req?.headers?.["user-agent"] || "",
    },
  };

  await db.query(
    `INSERT INTO audit_trail (employee, role, action, detail)
     VALUES (?, ?, ?, ?)`,
    [employee, role, action, JSON.stringify(detail)]
  );
}

/**
 * Safe wrapper – never break discounts API if audit logging fails.
 */
async function logDiscountAuditSafe(db, req, payload) {
  try {
    await logDiscountAudit(db, req, payload);
  } catch (err) {
    console.error("[discounts] failed to write audit trail:", err);
  }
}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();

  router.use(requireAuth);

  // GET /api/discounts
  router.get("/", async (_req, res) => {
    try {
      const rows = asRows(await db.query(
        `SELECT id, code, name, type,
                CAST(value AS DOUBLE) AS value,
                scope, isStackable, requiresApproval, isActive,
                createdAt, updatedAt
          FROM discounts
          ORDER BY createdAt DESC`
      ));

      rows.forEach(r => { r.value = Number(r.value); });
      res.json(rows);
    } catch (e) {
      console.error("[GET /api/discounts] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  // POST /api/discounts  (no counters; build code from insertId)
  router.post("/", async (req, res) => {
    try {
      const {
        name,
        value,
        type = "percent",
        scope = "order",
        isStackable = false,
        requiresApproval = false,
        isActive = true
      } = req.body || {};

      const numValue = Number(value);
      if (!name || !Number.isFinite(numValue)) {
        return res.status(400).json({ error: "name and numeric value are required" });
      }

      const now = new Date();

      // 1) Insert with code = NULL (valid under UNIQUE)
      const result = await db.query(
        `INSERT INTO discounts
           (code, name, type, value, scope, isStackable, requiresApproval, isActive, createdAt, updatedAt)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(name).trim(),
          type,
          numValue,
          scope,
          isStackable ? 1 : 0,
          requiresApproval ? 1 : 0,
          isActive ? 1 : 0,
          now,
          now
        ]
      );
      const packet = asPacket(result);
      const insertId = packet.insertId;
      const code = formatDiscCode(insertId);

      // 2) Set the final code derived from id
      await db.query(`UPDATE discounts SET code = ? WHERE id = ?`, [code, insertId]);

      // 3) Fetch full row for audit trail
      const createdRows = asRows(await db.query(
        `SELECT * FROM discounts WHERE id = ? LIMIT 1`,
        [insertId]
      ));
      const created = createdRows[0] || null;

      // 4) Log to audit trail (Discount Created)
      const statusMessage = created
        ? `Discount "${created.name}" created.`
        : "Discount created.";

      await logDiscountAuditSafe(db, req, {
        action: "Discount Created",
        actionType: "create",
        discount: created,
        extra: {
          statusMessage,
          actionDetails: created ? {
            discountCode: created.code,
            discountName: created.name,
            value: Number(created.value),
            type: created.type,
            scope: created.scope,
          } : undefined,
        },
      });

      res.status(201).json({ ok: true, code });
    } catch (e) {
      console.error("[POST /api/discounts] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  // PATCH /api/discounts/:code
  router.patch("/:code", async (req, res) => {
    try {
      const { code } = req.params;
      if (!code) return res.status(400).json({ error: "invalid code" });

      // Fetch "before" snapshot for audit
      const beforeRows = asRows(await db.query(
        `SELECT * FROM discounts WHERE code = ? LIMIT 1`,
        [code]
      ));
      const before = beforeRows[0] || null;

      const patch = { ...req.body };
      const allowed = [
        "name", "type", "value", "scope",
        "isStackable", "requiresApproval", "isActive"
      ];
      const sets = [];
      const params = [];

      for (const k of allowed) {
        if (k in patch) {
          sets.push(`${k} = ?`);
          if (["isStackable", "requiresApproval", "isActive"].includes(k)) {
            params.push(patch[k] ? 1 : 0);
          } else {
            params.push(patch[k]);
          }
        }
      }
      sets.push("updatedAt = ?"); params.push(new Date());

      if (sets.length === 1) {
        return res.status(400).json({ error: "no valid fields to update" });
      }

      params.push(code);
      await db.query(`UPDATE discounts SET ${sets.join(", ")} WHERE code = ?`, params);

      // Fetch "after" snapshot
      const afterRows = asRows(await db.query(
        `SELECT * FROM discounts WHERE code = ? LIMIT 1`,
        [code]
      ));
      const after = afterRows[0] || null;

      // Audit log: Discount Updated
      const target = after || before;
      const statusMessage = target
        ? `Discount "${target.name}" updated.`
        : "Discount updated.";

      await logDiscountAuditSafe(db, req, {
        action: "Discount Updated",
        actionType: "update",
        discount: target,
        extra: {
          statusMessage,
          actionDetails: {
            discountCode: target ? target.code : code,
            before,
            patch,
          },
        },
      });

      res.json({ ok: true });
    } catch (e) {
      console.error("[PATCH /api/discounts/:code] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  // DELETE /api/discounts/:code
  router.delete("/:code", async (req, res) => {
    try {
      const { code } = req.params;

      // Fetch snapshot before deletion
      const rows = asRows(await db.query(
        `SELECT * FROM discounts WHERE code = ? LIMIT 1`,
        [code]
      ));
      const discount = rows[0] || null;

      await db.query(`DELETE FROM discounts WHERE code = ?`, [code]);

      const statusMessage = discount
        ? `Discount "${discount.name}" deleted.`
        : `Discount with code "${code}" deleted.`;

      await logDiscountAuditSafe(db, req, {
        action: "Discount Deleted",
        actionType: "delete",
        discount: discount || { code },
        extra: {
          statusMessage,
          actionDetails: {
            discountCode: discount ? discount.code : code,
          },
        },
      });

      res.json({ ok: true });
    } catch (e) {
      console.error("[DELETE /api/discounts/:code] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  // POST /api/discounts/bulkDelete
  router.post("/bulkDelete", async (req, res) => {
    try {
      const { codes = [] } = req.body || {};
      const list = Array.isArray(codes)
        ? codes.filter(v => v !== null && v !== undefined)
        : [];
      if (!list.length) {
        return res.status(400).json({ error: "codes array required" });
      }

      const ids = [];
      const stringCodes = [];
      for (const v of list) {
        const s = String(v);
        if (/^\d+$/.test(s)) ids.push(Number(s));        // numeric id
        else stringCodes.push(s);                        // code like DISC-000010
      }

      // Fetch rows BEFORE deletion for audit details
      const allToLog = [];

      if (ids.length) {
        const ph = ids.map(() => "?").join(",");
        const rowsById = asRows(await db.query(
          `SELECT * FROM discounts WHERE id IN (${ph})`,
          ids
        ));
        allToLog.push(...rowsById);
      }

      if (stringCodes.length) {
        const ph = stringCodes.map(() => "?").join(",");
        const rowsByCode = asRows(await db.query(
          `SELECT * FROM discounts WHERE code IN (${ph})`,
          stringCodes
        ));
        allToLog.push(...rowsByCode);
      }

      // Perform actual deletes
      if (ids.length) {
        const ph = ids.map(() => "?").join(",");
        await db.query(`DELETE FROM discounts WHERE id IN (${ph})`, ids);
      }
      if (stringCodes.length) {
        const ph = stringCodes.map(() => "?").join(",");
        await db.query(`DELETE FROM discounts WHERE code IN (${ph})`, stringCodes);
      }

      const statusMessage = allToLog.length
        ? `Deleted ${allToLog.length} discount(s).`
        : `Deleted ${list.length} discount(s).`;

      await logDiscountAuditSafe(db, req, {
        action: "Discounts Bulk Deleted",
        actionType: "bulkDelete",
        discounts: allToLog,
        extra: {
          statusMessage,
          actionDetails: {
            count: list.length,
            ids,
            codes: stringCodes,
          },
        },
      });

      res.json({ ok: true, count: list.length });
    } catch (e) {
      console.error("[POST /api/discounts/bulkDelete] failed:", e);
      res.status(500).json({ error: e?.message ?? "Internal Server Error" });
    }
  });

  return router;
};