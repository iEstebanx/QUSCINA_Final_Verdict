// QUSCINA_BACKOFFICE/Backend/src/routes/Inventory/inv-activity.js
const express = require("express");
const dayjs = require("dayjs");
const { requireAuth } = require("../../auth/requireAuth");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../shared/db/mysql").db;
} catch {}

/* ============================================================
   SHARED AUDIT HELPERS (copied from ingredients.js, no pricing)
   ============================================================ */

const normalize = (s) =>
  String(s ?? "").replace(/\s+/g, " ").trim();

const INV_TYPE_IDS = new Set([1, 2]);
const normalizeTypeId = (v) => Number(String(v ?? "").trim());
const isValidTypeId = (n) => Number.isFinite(n) && INV_TYPE_IDS.has(n);

const kindToTypeId = (v) => {
  const k = String(v ?? "").trim().toLowerCase();
  if (k === "product") return 2;
  if (k === "ingredient") return 1;
  return null;
};

// ====== AVAILABLE RANGE HELPERS (ReportsPage-style) ======

const ymd = (iso) => dayjs(iso).format("YYYY-MM-DD");

// Monday start (ISO-like) without needing isoWeek plugin on backend
const startOfWeekMon = (d) => {
  const dow = d.day(); // 0..6 (Sun..Sat)
  return d.subtract((dow + 6) % 7, "day").startOf("day");
};

const getWeekRangeMonSun = (base) => {
  const from = startOfWeekMon(base);
  const to = from.add(6, "day").endOf("day");
  return { from, to };
};

// month label e.g. "2026-01"
const ymKey = (d) => d.format("YYYY-MM");

// week key e.g. "2026-01 W02" (unique enough for dropdown lists)
const weekKey = (weekFrom) => {
  const y = weekFrom.year();
  const m = String(weekFrom.month() + 1).padStart(2, "0");
  // compute week-of-month (1..6)
  const firstMon = startOfWeekMon(weekFrom.startOf("month"));
  const diffWeeks = Math.floor(weekFrom.startOf("day").diff(firstMon, "day") / 7) + 1;
  const w = String(diffWeeks).padStart(2, "0");
  return `${y}-${m} W${w}`;
};

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
    kind: Number(row.inventory_type_id || row.inventoryTypeId || 1) === 2 ? "product" : "ingredient",
    category: row.category,
    type: row.type,
    currentStock: Number(row.currentStock || 0),
    lowStock: Number(row.lowStock || 0),
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

// ✅ Make MySQL DATETIME strings parse safely in dayjs (PH timezone)
const toIsoManila = (v) => {
  if (!v) return new Date().toISOString();

  // already a Date
  if (v instanceof Date) return v.toISOString();

  const s = String(v);

  // MySQL DATETIME: "YYYY-MM-DD HH:mm:ss"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    return s.replace(" ", "T") + "+08:00";
  }

  // fallback
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
};

async function logInventoryIngredientAuditSafe(db, req, payload) {
  try {
    await logInventoryIngredientAudit(db, req, payload);
  } catch (err) {
    console.error("[inv-activity] failed to write ingredient audit:", err);
  }
}

/* ============================================================
   EXPORT AUDIT (InventoryHistoryPage PDF/Excel)
   ============================================================ */

async function logInventoryExportAudit(db, req, { action, actionType, extra = {} }) {
  const user = getAuditUserFromReq(req);
  const employee = user?.employeeName || "System";
  const role = user?.role || "—";

  const detail = {
    statusMessage: extra.statusMessage || undefined,

    actionDetails: {
      app: "backoffice",
      module: "inventory_activity",
      actionType, // "export_pdf" | "export_excel"
      ...(extra.actionDetails || {}),
    },

    affectedData: {
      items: [], // export doesn't change inventory
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

async function logInventoryExportAuditSafe(db, req, payload) {
  try {
    await logInventoryExportAudit(db, req, payload);
  } catch (err) {
    console.error("[inv-activity] failed to write export audit:", err);
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

function invActivityRouterFactory({ db } = {}) {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();
  router.use(express.json());

  // 🔐 Require auth for all inventory activity routes
  router.use(requireAuth);

  // POST /api/inventory/inv-activity/audit-export
  router.post("/audit-export", async (req, res) => {
    try {
      const body = req.body || {};

      const format = String(body.format || "").toLowerCase(); // "pdf" | "excel"
      if (!["pdf", "excel"].includes(format)) {
        return res.status(400).json({ ok: false, error: "format must be pdf or excel" });
      }

      const range = String(body.range || "");
      const from = String(body.from || "");
      const to = String(body.to || "");
      const search = String(body.search || "");
      const rowCount = Number(body.rowCount || 0);

      const filename = String(body.filename || "");

      const exportedAt = String(body.exportedAt || "");       // ISO
      const exportedAtLabel = String(body.exportedAtLabel || ""); // human label
      const rangeLabel = String(body.rangeLabel || "");

      const yearSel = body.yearSel != null ? Number(body.yearSel) : null;
      const monthSel = body.monthSel != null ? Number(body.monthSel) : null;
      const weekSel = String(body.weekSel || "");

      const action =
        format === "pdf"
          ? "Inventory History Exported (PDF)"
          : "Inventory History Exported (Excel)";

      await logInventoryExportAuditSafe(db, req, {
        action,
        actionType: format === "pdf" ? "export_pdf" : "export_excel",
        extra: {
          statusMessage: `Exported inventory history (${format.toUpperCase()}).`,
          actionDetails: {
            range,
            rangeLabel: rangeLabel || undefined,
            from,
            to,
            search: search || "—",
            rowCount,
            filename,
            exportedAt: exportedAt || undefined,
            exportedAtLabel: exportedAtLabel || undefined,
            ...(Number.isFinite(yearSel) ? { yearSel } : {}),
            ...(Number.isFinite(monthSel) ? { monthSel } : {}),
            ...(weekSel ? { weekSel } : {}),
          },
        },
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error("[inv-activity] audit-export failed:", e);
      return res.status(500).json({ ok: false, error: e.message || "audit-export failed" });
    }
  });

  // GET /api/inventory/inv-activity/available-days
  router.get("/available-days", async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 5000)
        : 5000;

      const q = await db.query(`
        SELECT COALESCE(ts, createdAt) AS t
        FROM inventory_activity
        ORDER BY COALESCE(ts, createdAt) DESC, id DESC
        LIMIT ${limit}
      `);

      const rows = Array.isArray(q) && Array.isArray(q[0]) ? q[0] : q;

      const s = new Set();
      for (const r of rows || []) {
        const iso = toIsoManila(r.t);
        s.add(dayjs(iso).format("YYYY-MM-DD"));
      }

      const days = [...s].sort(); // ascending
      return res.json({ ok: true, days, min: days[0] || "", max: days[days.length - 1] || "" });
    } catch (e) {
      console.error("[inv-activity] available-days failed:", e);
      res.status(500).json({ ok: false, error: e.message || "available-days failed" });
    }
  });

  // GET /api/inventory/inv-activity/available-months
  router.get("/available-months", async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 5000)
        : 5000;

      const q = await db.query(`
        SELECT COALESCE(ts, createdAt) AS t
        FROM inventory_activity
        ORDER BY COALESCE(ts, createdAt) DESC, id DESC
        LIMIT ${limit}
      `);

      const rows = Array.isArray(q) && Array.isArray(q[0]) ? q[0] : q;

      const s = new Set();
      for (const r of rows || []) {
        const iso = toIsoManila(r.t);
        s.add(dayjs(iso).format("YYYY-MM"));
      }

      const months = [...s].sort(); // ascending
      return res.json({ ok: true, months });
    } catch (e) {
      console.error("[inv-activity] available-months failed:", e);
      res.status(500).json({ ok: false, error: e.message || "available-months failed" });
    }
  });

  // GET /api/inventory/inv-activity/available-weeks?year=2026&month=1
  router.get("/available-weeks", async (req, res) => {
    try {
      const year = Number(req.query.year);
      const month = Number(req.query.month); // 1..12
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return res.status(400).json({ ok: false, error: "year and month required (month 1..12)" });
      }

      // Load enough rows to cover that month
      const q = await db.query(`
        SELECT COALESCE(ts, createdAt) AS t
        FROM inventory_activity
        ORDER BY COALESCE(ts, createdAt) DESC, id DESC
        LIMIT 5000
      `);

      const rows = Array.isArray(q) && Array.isArray(q[0]) ? q[0] : q;

      // Collect days in target month
      const days = [];
      for (const r of rows || []) {
        const iso = toIsoManila(r.t);
        const d = dayjs(iso);
        if (d.year() === year && d.month() === (month - 1)) {
          days.push(d);
        }
      }

      if (!days.length) return res.json({ ok: true, weeks: [] });

      // Build unique week ranges (Mon-Sun) that have at least 1 activity day
      const weekMap = new Map(); // key -> { from, to, label }
      for (const d of days) {
        const { from, to } = getWeekRangeMonSun(d);
        const key = weekKey(from);
        if (!weekMap.has(key)) {
          weekMap.set(key, {
            key,
            from: from.format("YYYY-MM-DD"),
            to: to.format("YYYY-MM-DD"),
            label: `${from.format("MMM DD")} – ${to.format("MMM DD, YYYY")}`,
          });
        }
      }

      const weeks = [...weekMap.values()].sort((a, b) => a.from.localeCompare(b.from));
      return res.json({ ok: true, weeks });
    } catch (e) {
      console.error("[inv-activity] available-weeks failed:", e);
      res.status(500).json({ ok: false, error: e.message || "available-weeks failed" });
    }
  });

  // GET /api/inventory/inv-activity?limit=1000&kind=ingredient|product|all&inventoryTypeId=1|2&category=...
  router.get("/", async (req, res) => {
    try {
      const category = normalize(req.query.category);

      const rawKind = String(req.query.kind ?? "").trim().toLowerCase();
      const rawTypeId = req.query.inventoryTypeId ?? req.query.inventory_type_id;

      const typeIdFromKind = rawKind === "all" ? "all" : kindToTypeId(rawKind);
      const typeIdFromQuery = isValidTypeId(normalizeTypeId(rawTypeId))
        ? normalizeTypeId(rawTypeId)
        : null;

      const typeFilter =
        rawKind === "all" ? "all" : (typeIdFromQuery ?? typeIdFromKind ?? null);

      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 5000)
        : 1000;

      // ✅ inline limit (safe because we clamp to 1..5000 and Number())
      const sql = `
        SELECT
          ia.id,
          ia.ts,
          ia.createdAt,
          ia.employee,
          ia.reason,
          ia.io,
          ia.qty,
          ia.ingredientId,
          ia.ingredientName,

          ii_id.id AS ii_id,
          ii_id.category AS ii_category_id,
          ii_id.type AS ii_unit_id,
          ii_id.inventory_type_id AS ii_type_id,
          ii_id.currentStock AS ii_stock_id,
          ii_id.name_lower AS ii_name_lower_id,

          ii_name.id AS in_id,
          ii_name.category AS in_category,
          ii_name.type AS in_unit,
          ii_name.inventory_type_id AS in_type,
          ii_name.currentStock AS in_stock,
          ii_name.name_lower AS in_name_lower
        FROM inventory_activity ia
        LEFT JOIN inventory_ingredients ii_id
          ON ii_id.id = ia.ingredientId
        LEFT JOIN inventory_ingredients ii_name
          ON ii_name.name_lower = LOWER(TRIM(COALESCE(ia.ingredientName, '')))
        ORDER BY COALESCE(ia.ts, ia.createdAt) DESC, ia.id DESC
        LIMIT ${limit}
      `;

      const q = await db.query(sql); // <-- no params
      const rows = Array.isArray(q) && Array.isArray(q[0]) ? q[0] : q;


      // Build normalized rows first (still newest-first)
      const normalized = (rows || []).map((r) => {
        const resolvedIngredientId =
          r.ii_id ?? (r.ingredientId ? Number(r.ingredientId) : null) ?? r.in_id ?? null;
        const resolvedNameLower =
          r.ii_name_lower_id || r.in_name_lower || "";

        const resolvedCategory = r.ii_category_id ?? r.in_category ?? "";
        const resolvedUnit = r.ii_unit_id ?? r.in_unit ?? "";
        const resolvedTypeId = r.ii_type_id ?? r.in_type ?? null;
        const resolvedCurrentStock = Number(r.ii_stock_id ?? r.in_stock ?? 0);

        const tsRaw = r.ts ?? r.createdAt ?? null;

        return {
          id: String(r.id),
          ts: toIsoManila(tsRaw),

          employee: r.employee || "",
          reason: r.reason || "",
          io: r.io === null || r.io === undefined ? null : (String(r.io) === "Out" ? "Out" : "In"),
          qty: r.qty === null || r.qty === undefined ? null : Number(r.qty),

          ingredientId: r.ingredientId ? String(r.ingredientId) : "",
          ingredientName: r.ingredientName || "",

          // resolved fields
          resolvedIngredientId: resolvedIngredientId ? String(resolvedIngredientId) : "",
          resolvedNameLower,
          category: resolvedCategory || "",
          unit: resolvedUnit || "",
          inventoryTypeId: resolvedTypeId ? Number(resolvedTypeId) : null,
          currentStockNow:
            resolvedIngredientId ? resolvedCurrentStock : null,
        };
      });

      // Apply filters (type/category) using resolved fields
      const filtered = normalized.filter((r) => {
        if (typeFilter && typeFilter !== "all") {
          if (Number(r.inventoryTypeId || 0) !== Number(typeFilter)) return false;
        }
        if (category && category !== "all") {
          if (String(r.category || "") !== String(category)) return false;
        }
        return true;
      });

      // ✅ Compute before/after in JS (no window functions)
      // We’re iterating newest -> oldest.
      // afterStock = currentStockNow - sum(newer deltas)
      // beforeStock = afterStock - delta
      const newerDeltaSumByKey = new Map(); // key -> sum of deltas for rows newer than current
      const out = filtered.map((r) => {
        // pick a stable key per ingredient:
        // prefer resolvedIngredientId; fallback to nameLower; else empty means unknown
        const key =
          r.resolvedIngredientId
            ? `id:${r.resolvedIngredientId}`
            : (r.resolvedNameLower ? `name:${r.resolvedNameLower}` : "");

        const delta =
          r.io === "In" ? Number(r.qty || 0)
          : r.io === "Out" ? -Number(r.qty || 0)
          : 0;

        if (!key || r.currentStockNow === null) {
          return {
            id: r.id,
            ts: r.ts,
            employee: r.employee,
            reason: r.reason,
            io: r.io,
            qty: r.qty,
            ingredientId: r.ingredientId,
            ingredientName: r.ingredientName,

            category: r.category,
            unit: r.unit,
            inventoryTypeId: r.inventoryTypeId,

            beforeStock: null,
            afterStock: null,
          };
        }

        const newerSum = newerDeltaSumByKey.get(key) ?? 0;

        const afterStock = Number(r.currentStockNow) - Number(newerSum);
        const beforeStock = afterStock - delta;

        // update for next (older) rows
        newerDeltaSumByKey.set(key, newerSum + delta);

        return {
          id: r.id,
          ts: r.ts,
          employee: r.employee,
          reason: r.reason,
          io: r.io,
          qty: r.qty,
          ingredientId: r.ingredientId,
          ingredientName: r.ingredientName,

          category: r.category,
          unit: r.unit,
          inventoryTypeId: r.inventoryTypeId,

          beforeStock,
          afterStock,
        };
      });

      res.json({ ok: true, rows: out });
    } catch (e) {
      console.error("[inv-activity] list failed:", e);
      res.status(500).json({ ok: false, error: e.message || "List failed" });
    }
  });

  // POST /api/inventory/inv-activity  (Stock In/Out movement)
  router.post("/", async (req, res) => {
    try {
      const body = req.body || {};

      const ingredientIdRaw = body.ingredientId ?? body.ingredient_id ?? null;
      const ingredientId = ingredientIdRaw ? Number(String(ingredientIdRaw).trim()) : null;

      const ingredientName = normalize(body.ingredientName ?? body.ingredient_name ?? "");
      const io = String(body.io || "").trim() === "Out" ? "Out" : "In";
      const qty = Number(body.qty);

      const reason = normalize(body.reason || "");
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ ok: false, error: "Invalid qty" });
      }

      // employee should come from auth (ignore client-sent "Chef")
      const user = getAuditUserFromReq(req);
      const employee = user?.employeeName || normalize(body.employee) || "System";

      // ✅ resolve ingredient row (by id, fallback by name)
      let ingredient = null;

      if (ingredientId) {
        const rows = await db.query(`SELECT * FROM inventory_ingredients WHERE id = ? LIMIT 1`, [ingredientId]);
        ingredient = rows?.[0] || null;
      }

      if (!ingredient && ingredientName) {
        const q2 = await db.query(
          `SELECT * FROM inventory_ingredients WHERE name_lower = LOWER(?) LIMIT 1`,
          [ingredientName]
        );
        const rows2 = Array.isArray(q2) && Array.isArray(q2[0]) ? q2[0] : q2;
        ingredient = rows2?.[0] || null;
      }

      if (!ingredient) {
        return res.status(404).json({ ok: false, error: "Not found" });
      }

      const beforeStock = Number(ingredient.currentStock || 0);
      const delta = io === "In" ? qty : -qty;

      // prevent stock out more than current
      if (io === "Out" && qty > beforeStock) {
        return res.status(409).json({
          ok: false,
          error: "Insufficient stock",
          code: "INSUFFICIENT_STOCK",
          currentStock: beforeStock,
          attempted: qty,
        });
      }

      // write activity + update stock in one transaction
      let insertedId = null;
      let afterRow = null;

      await db.tx(async (t) => {
        // 1) insert activity (always record the original ingredientId + name)
        const insertRes = await t.query(
          `
          INSERT INTO inventory_activity
            (ts, employee, reason, io, qty, ingredientId, ingredientName, createdAt, updatedAt)
          VALUES
            (NOW(), ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `,
          [
            employee,
            reason,
            io,
            qty,
            ingredient.id,
            ingredient.name,
          ]
        );

        insertedId = insertRes?.insertId || null;

        // 2) update stock (never negative)
        await t.query(
          `
          UPDATE inventory_ingredients
          SET currentStock = GREATEST(0, currentStock + ?),
              updatedAt = NOW()
          WHERE id = ?
          `,
          [delta, ingredient.id]
        );

        // 3) fetch updated ingredient row
        const afterRows = await t.query(`SELECT * FROM inventory_ingredients WHERE id = ? LIMIT 1`, [ingredient.id]);
        afterRow = afterRows?.[0] || null;
      });

      const afterStock = Number(afterRow?.currentStock || 0);

      // ✅ audit (qty-only movement)
      await logInventoryIngredientAuditSafe(db, req, {
        action: "Inventory - Ingredient Updated (Stock In/Out)",
        actionType: "update",
        ingredient: afterRow,
        before: { currentStock: beforeStock },
        after: { currentStock: afterStock },
        changes: { currentStock: { before: beforeStock, after: afterStock } },
        extra: {
          statusMessage: io === "In" ? "Stock in saved" : "Stock out saved",
          actionDetails: {
            movement: {
              io,
              qty,
              reason,
              ingredientId: String(ingredient.id),
              ingredientName: ingredient.name,
              beforeStock,
              afterStock,
            },
          },
        },
      });

      return res.json({
        ok: true,
        id: insertedId,
        row: {
          id: insertedId,
          ts: new Date().toISOString(),
          employee,
          reason,
          io,
          qty,
          ingredientId: String(ingredient.id),
          ingredientName: ingredient.name,
          // optional extras (your history page likes these)
          category: ingredient.category || "",
          unit: ingredient.type || "",
          inventoryTypeId: Number(ingredient.inventory_type_id || 1),
          beforeStock,
          afterStock,
        },
      });
    } catch (e) {
      console.error("[inv-activity] save failed:", e);
      return res.status(500).json({ ok: false, error: e.message || "Save failed" });
    }
  });

  return router;
}

module.exports = Object.assign(invActivityRouterFactory, {
  getAuditUserFromReq,
  logInventoryExportAuditSafe,
  toIsoManila,
});