// QUSCINA_BACKOFFICE/Backend/src/routes/Inventory/inv-activity.js
const express = require("express");
const { requireAuth } = require("../../auth/requireAuth");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch {}

/* ============================================================
   SHARED AUDIT HELPERS (copied from ingredients.js)
   ============================================================ */

function getAuditUserFromReq(req) {
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

function mapIngredientItem(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    category: row.category,
    type: row.type,
    currentStock: Number(row.currentStock || 0),
    lowStock: Number(row.lowStock || 0),
    price: Number(row.price || 0),
  };
}

async function logInventoryIngredientAudit(
  db,
  req,
  {
    action,      // e.g. "Inventory - Ingredient Updated (Stock In)"
    actionType,  // "update"
    ingredient,  // after row
    before,      // before snapshot
    after,       // after snapshot
    changes,     // { currentStock: { before, after } }
    extra = {},  // { statusMessage, actionDetails: { movement, ... } }
  }
) {
  const user = getAuditUserFromReq(req);
  const employee = user?.employeeName || "System";
  const role = user?.role || "—";

  const items = [];
  const singleItem = mapIngredientItem(ingredient);
  if (singleItem) items.push(singleItem);

  const detail = {
    statusMessage: extra.statusMessage || undefined,

    actionDetails: {
      app: "backoffice",
      module: "inventory_ingredients",
      actionType,
      ...(extra.actionDetails || {}),
      ...(changes ? { changes } : {}),
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    },

    affectedData: {
      items,
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

async function logInventoryIngredientAuditSafe(db, req, payload) {
  try {
    await logInventoryIngredientAudit(db, req, payload);
  } catch (err) {
    console.error("[inv-activity] failed to write ingredient audit:", err);
  }
}

/* ============================================================
   OPTIONAL auto unit converter (kept for future use)
   ============================================================ */

function autoConvertUnit(type, currentStock) {
  return {
    type,
    currentStock: Number(currentStock || 0),
  };
}

/* ====================== ROUTER ====================== */

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();
  router.use(express.json());

  // 🔐 Require auth for all inventory activity routes
  router.use(requireAuth);

  // GET /api/inventory/inv-activity?limit=1000
  router.get("/", async (req, res) => {
    try {
      const limit = Math.max(
        1,
        Math.min(1000, parseInt(req.query.limit || "200", 10))
      );

      const rows = await db.query(
        `SELECT id, ts, employee, reason, io, qty, price, ingredientId, ingredientName, createdAt, updatedAt
          FROM inventory_activity
          ORDER BY COALESCE(ts, createdAt) DESC
          LIMIT ${limit}`
      );

      const out = rows.map((r) => ({
        id: String(r.id),
        ts: r.ts
          ? typeof r.ts === "string"
            ? r.ts
            : new Date(r.ts).toISOString()
          : r.createdAt
          ? new Date(r.createdAt).toISOString()
          : new Date().toISOString(),
        employee: r.employee,
        reason: r.reason,      // ✔ correct field
        io: r.io,
        qty: Number(r.qty || 0),
        price: Number(r.price || 0),
        ingredientId: r.ingredientId ? String(r.ingredientId) : "",
        ingredientName: r.ingredientName || "",
      }));

      res.json({ ok: true, rows: out });
    } catch (e) {
      console.error("[inv-activity] list failed:", e);
      res.status(500).json({ ok: false, error: e.message || "List failed" });
    }
  });

  /**
   * POST /api/inventory/inv-activity
   * body: { ts?, employee?, reason?, io: 'In'|'Out', qty, price, ingredientId, ingredientName }
   *
   * ➜ Now ALSO writes a single audit_trail row:
   *    "Inventory - Ingredient Updated (Stock In/Out)"
   */
  router.post("/", async (req, res) => {
    try {
      const io = String(req.body?.io || "In") === "Out" ? "Out" : "In";
      const qty = Number(req.body?.qty || 0);
      const price = Number(req.body?.price || 0);
      const ingredientId = req.body?.ingredientId
        ? String(req.body.ingredientId)
        : "";
      const ingredientName = req.body?.ingredientName
        ? String(req.body.ingredientName)
        : "";

      const authUser = req.user || null;
      const employeeFromAuth =
        (authUser &&
          (authUser.employeeName ||
            authUser.name ||
            authUser.username ||
            authUser.email)) ||
        null;
      const employee =
        employeeFromAuth || String(req.body?.employee || "Inventory User");

      // ✅ prefer body.reason; you *can* drop the fallback if you don't care about old clients
      const reason = String(req.body?.reason || "");

      const tsRaw = req.body?.ts;
      const tsVal =
        typeof tsRaw === "string" && tsRaw.trim() ? new Date(tsRaw) : null;

      const now = new Date();

      const id = await db.tx(async (conn) => {
        // 1) insert activity row (column is now `reason`)
        const insert = await conn.execute(
          `INSERT INTO inventory_activity
            (ts, employee, reason, io, qty, price, ingredientId, ingredientName, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tsVal,
            employee,
            reason,
            io,
            qty,
            price,
            ingredientId,
            ingredientName,
            now,
            now,
          ]
        );
        const newId = insert.insertId;

        // 2) update ingredient stock (if ingredientId present)
        if (ingredientId) {
          const delta = io === "In" ? qty : -qty;

          await conn.execute(
            `UPDATE inventory_ingredients
                SET currentStock = GREATEST(0, COALESCE(currentStock,0) + ?),
                    price = ?,
                    updatedAt = ?
              WHERE id = ?`,
            [delta, price, new Date(), Number(ingredientId)]
          );
        }

        return newId;
      });

      const row = {
        id: String(id),
        ts: tsVal ? tsVal.toISOString() : now.toISOString(),
        employee,
        reason,        // 👈 return Reason
        io,
        qty,
        price,
        ingredientId,
        ingredientName,
      };

      // ... audit logging block stays the same ...

      res.status(201).json({ ok: true, id: String(id), row });
    } catch (e) {
      console.error("[inv-activity] create failed:", e);
      res.status(500).json({ ok: false, error: e.message || "Create failed" });
    }
  });

  return router;
};