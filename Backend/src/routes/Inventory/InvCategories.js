// QUSCINA_BACKOFFICE/Backend/src/routes/Inventory/invCategories.js
const express = require("express");
const { requireAuth } = require("../../auth/requireAuth");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try { sharedDb = require("../../shared/db/mysql").db; } catch {}

const NAME_MAX = 60;
const NAME_MIN = 3;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;

const normalizeName = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length >= NAME_MIN && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

const toISO = (v) => {
  try {
    if (!v) return null;
    return typeof v === "string" ? v : new Date(v).toISOString();
  } catch { return null; }
};

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const router = express.Router();
  router.use(express.json());

  // 🔐 Require auth for all inventory category routes so audit logs have req.user
  router.use(requireAuth);

  // ----------------------------- AUDIT HELPERS ----------------------------- //

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

  async function logInvCategoryAudit(db, req, { action, detail }) {
    const u = getAuditUser(req);

    const finalDetail = {
      ...(detail || {}),
      actionDetails: {
        app: "backoffice",
        module: "inventory-categories",
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

  async function logInvCategoryAuditSafe(db, req, payload) {
    try {
      await logInvCategoryAudit(db, req, payload);
    } catch (err) {
      console.error("[inventory/inv-categories] failed to write audit trail:", err);
    }
  }

  // ------------------------------- Helpers --------------------------------- //

  async function getCategoryById(id) {
    const rows = await db.query(
      `SELECT id, name, name_lower, active, created_at, updated_at
         FROM inventory_categories
        WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async function categoryUsageById(id) {
    const cat = await getCategoryById(id);
    if (!cat) return { exists: false, ingredientCount: 0, activityCount: 0, sampleIngredients: [] };

    // Use generated lowercase columns for fast, case-insensitive match
    const ingr = await db.query(
      `SELECT id, name
         FROM inventory_ingredients
        WHERE category_lower = ? 
        ORDER BY id DESC
        LIMIT 8`,
      [cat.name_lower]
    );

    const ingredientIds = ingr.map(r => r.id);
    let activityCount = 0;
    if (ingredientIds.length) {
      const placeholders = ingredientIds.map(() => "?").join(",");
      const act = await db.query(
        `SELECT COUNT(*) AS cnt
           FROM inventory_activity
          WHERE ingredientId IN (${placeholders})`,
        ingredientIds
      );
      activityCount = Number(act?.[0]?.cnt || 0);
    }

    const ingredientCount = ingr.length
      ? Number(
          await db
            .query(
              `SELECT COUNT(*) AS cnt
                 FROM inventory_ingredients
                WHERE category_lower = ?`,
              [cat.name_lower]
            )
            .then(r => r?.[0]?.cnt || 0)
        )
      : 0;

    return {
      exists: true,
      ingredientCount,
      activityCount,
      sampleIngredients: ingr.map(r => String(r.name || "")),
      category: { id: String(cat.id), name: cat.name }
    };
  }

  // ------------------------------- Routes ---------------------------------- //

  // GET /api/inventory/inv-categories
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, name, name_lower, active, created_at, updated_at
           FROM inventory_categories
          ORDER BY updated_at DESC`
      );
      const categories = rows.map((r) => ({
        id: String(r.id),
        name: r.name,
        createdAt: toISO(r.created_at),
        updatedAt: toISO(r.updated_at),
        active: r.active ? 1 : 0,
      }));
      res.json({ ok: true, categories });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || "List failed" });
    }
  });

  // GET /api/inventory/inv-categories/:id/usage
  router.get("/:id/usage", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const usage = await categoryUsageById(id);
      if (!usage.exists) return res.status(404).json({ ok: false, error: "not found" });
      return res.json({ ok: true, usage });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e?.message || "Usage check failed" });
    }
  });

  // POST /api/inventory/inv-categories  { name }
  router.post("/", async (req, res) => {
    try {
      const raw = normalizeName(req.body?.name);
      if (!isValidName(raw)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid name. Must be at least ${NAME_MIN} characters (max ${NAME_MAX}); allowed letters, numbers, spaces, - ' & . , ( ) /.`,
        });
      }

      const now = new Date();
      // name_lower is GENERATED by SQL; do not set it here.
      const result = await db.query(
        `INSERT INTO inventory_categories (name, active, created_at, updated_at)
         VALUES (?, 1, ?, ?)`,
        [raw, now, now]
      );

      const id = result.insertId;
      const row = await getCategoryById(id);
      const category = {
        id: String(row.id),
        name: row.name,
        createdAt: toISO(row.created_at),
        updatedAt: toISO(row.updated_at),
        active: row.active ? 1 : 0,
      };

      // 🔹 Audit: Inventory Category Created
      await logInvCategoryAuditSafe(db, req, {
        action: "Inventory Category Created",
        detail: {
          statusMessage: `Inventory category "${row.name}" created.`,
          actionDetails: {
            actionType: "create",
            categoryId: id,
            name: row.name,
          },
          affectedData: {
            items: [{ id: String(id), name: row.name }],
            statusChange: "NONE",
          },
        },
      });

      return res.status(201).json({ ok: true, category });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062) {
        return res
          .status(409)
          .json({ ok: false, error: "That category name already exists (names are case-insensitive)." });
      }
      return res.status(400).json({ ok: false, error: e?.message || "Create failed" });
    }
  });

  // PATCH /api/inventory/inv-categories/:id { name }
  router.patch("/:id", async (req, res) => {
    // Helper: run the rename logic using a plain "db" (no transaction)
    async function renameWithoutTxn(id, newName, oldNameLower, newNameLower) {
      const now = new Date();

      // 1) Update the category row
      await db.query(
        `UPDATE inventory_categories
          SET name = ?, updated_at = ?
        WHERE id = ?`,
        [newName, now, id]
      );

      // 2) Propagate: update ONLY the base column; generated column will follow
      const upd = await db.query(
        `UPDATE inventory_ingredients
            SET category = ?
          WHERE category_lower = ?`,
        [newName, oldNameLower]
      );
      const affectedIngredients = Number(upd?.affectedRows || 0);

      // 3) Sample after rename (use NEW generated value in WHERE)
      const sampleRows = await db.query(
        `SELECT name
          FROM inventory_ingredients
          WHERE category_lower = ?
          ORDER BY id DESC
          LIMIT 5`,
        [newNameLower]
      );
      const sample = (sampleRows || []).map(r => String(r.name || ""));

      return { affectedIngredients, sample };
    }

    async function renameWithTxn(pool, id, newName, oldNameLower, newNameLower) {
      const conn = await pool.getConnection();
      try {
        await conn.query("BEGIN");

        const now = new Date();

        await conn.query(
          `UPDATE inventory_categories
            SET name = ?, updated_at = ?
          WHERE id = ?`,
          [newName, now, id]
        );

        // Only set the base column
        const [upd] = await conn.query(
          `UPDATE inventory_ingredients
              SET category = ?
            WHERE category_lower = ?`,
          [newName, oldNameLower]
        );
        const affectedIngredients = Number(upd?.affectedRows || 0);

        const [sampleRows] = await conn.query(
          `SELECT name
            FROM inventory_ingredients
            WHERE category_lower = ?
            ORDER BY id DESC
            LIMIT 5`,
          [newNameLower]
        );
        const sample = (sampleRows || []).map(r => String(r.name || ""));

        await conn.query("COMMIT");
        conn.release();
        return { affectedIngredients, sample };
      } catch (err) {
        try { await conn.query("ROLLBACK"); } catch {}
        conn.release();
        throw err;
      }
    }

    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }

      const raw = normalizeName(req.body?.name);
      if (!isValidName(raw)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid name. Must be at least ${NAME_MIN} characters (max ${NAME_MAX}); allowed letters, numbers, spaces, - ' & . , ( ) /.`,
        });
      }

      // Fetch current (to get old name_lower)
      const before = await getCategoryById(id);
      if (!before) return res.status(404).json({ ok: false, error: "not found" });

      const oldNameLower = before.name_lower;
      const newName = raw;
      const newNameLower = newName.toLowerCase();

      // No-op rename → just echo usage so the UI can still show the dialog
      if (before.name === newName) {
        const usageNow = await categoryUsageById(id);
        const sampleNow = Array.isArray(usageNow?.sampleIngredients)
          ? usageNow.sampleIngredients.slice(0, 5)
          : [];
        return res.json({
          ok: true,
          category: {
            id: String(before.id),
            name: before.name,
            createdAt: toISO(before.created_at),
            updatedAt: toISO(before.updated_at),
            active: before.active ? 1 : 0,
          },
          affectedIngredients: usageNow?.ingredientCount || 0,
          sample: sampleNow,
        });
      }

      // Try to detect a real pool to use a transaction; otherwise fallback
      let result;
      if (typeof db.getConnection === "function") {
        // (future-proof) direct pool
        result = await renameWithTxn(db, id, newName, oldNameLower, newNameLower);
      } else if (db.pool && typeof db.pool.getConnection === "function") {
        // Some wrappers expose the pool on .pool
        result = await renameWithTxn(db.pool, id, newName, oldNameLower, newNameLower);
      } else {
        // Fallback: sequential updates
        result = await renameWithoutTxn(id, newName, oldNameLower, newNameLower);
      }

      // Return updated category row (fresh after rename)
      const after = await getCategoryById(id);
      const category = {
        id: String(after.id),
        name: after.name,
        createdAt: toISO(after.created_at),
        updatedAt: toISO(after.updated_at),
        active: after.active ? 1 : 0,
      };

      // 🔹 Audit: Inventory Category Updated
      await logInvCategoryAuditSafe(db, req, {
        action: "Inventory Category Updated",
        detail: {
          statusMessage: `Inventory category "${after.name}" updated.`,
          actionDetails: {
            actionType: "update",
            categoryId: id,
            oldName: before.name,
            newName: after.name,
            affectedIngredients: result.affectedIngredients,
            itemsSample: result.sample,
          },
          affectedData: {
            items: [{ id: String(id), name: after.name }],
            statusChange: "NONE",
          },
        },
      });

      return res.json({
        ok: true,
        category,
        affectedIngredients: result.affectedIngredients,
        sample: result.sample,
      });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062) {
        return res
          .status(409)
          .json({ ok: false, error: "That category name already exists (names are case-insensitive)." });
      }
      return res.status(400).json({ ok: false, error: e?.message || "Update failed" });
    }
  });

  // DELETE /api/inventory/inv-categories/:id — single (block if in use)
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

      const usage = await categoryUsageById(id);
      if (!usage.exists) return res.status(404).json({ ok: false, error: "not found" });

      if (usage.ingredientCount > 0 || usage.activityCount > 0) {
        return res.status(409).json({
          ok: false,
          error: "Category is in use and cannot be deleted.",
          usage
        });
      }

      const catName = usage.category?.name || null;

      await db.query(`DELETE FROM inventory_categories WHERE id = ?`, [id]);

      // 🔹 Audit: Inventory Category Deleted
      await logInvCategoryAuditSafe(db, req, {
        action: "Inventory Category Deleted",
        detail: {
          statusMessage: catName
            ? `Inventory category "${catName}" deleted.`
            : `Inventory category ID ${id} deleted.`,
          actionDetails: {
            actionType: "delete",
            categoryId: id,
            name: catName,
          },
          affectedData: {
            items: [{ id: String(id), name: catName }],
            statusChange: "NONE",
          },
        },
      });

      return res.json({ ok: true, deleted: 1 });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e?.message || "Delete failed" });
    }
  });

  // DELETE /api/inventory/inv-categories  { ids: string[] } — bulk with partial success
  router.delete("/", async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((x) => Number(x)).filter(Number.isFinite)
        : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: "ids array required" });

      const deletable = [];
      const blocked = [];
      const deletedItemsForAudit = [];

      for (const id of ids) {
        const usage = await categoryUsageById(id);
        if (!usage.exists) continue; // ignore missing silently
        if (usage.ingredientCount > 0 || usage.activityCount > 0) {
          blocked.push({ id: String(id), name: usage?.category?.name, usage });
        } else {
          deletable.push(id);
          deletedItemsForAudit.push({
            id: String(id),
            name: usage?.category?.name || null,
          });
        }
      }

      if (deletable.length) {
        const placeholders = deletable.map(() => "?").join(",");
        await db.query(
          `DELETE FROM inventory_categories WHERE id IN (${placeholders})`,
          deletable
        );
      }

      // 🔹 Audit: Inventory Categories Bulk Deleted
      await logInvCategoryAuditSafe(db, req, {
        action: "Inventory Categories Bulk Deleted",
        detail: {
          statusMessage: `Deleted ${deletable.length} inventory category(ies).`,
          actionDetails: {
            actionType: "bulk-delete",
            deletedIds: deletable,
            blocked,
          },
          affectedData: {
            items: deletedItemsForAudit,
            statusChange: "NONE",
          },
        },
      });

      return res.json({ ok: true, deleted: deletable.length, blocked });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e?.message || "Delete failed" });
    }
  });

  return router;
};