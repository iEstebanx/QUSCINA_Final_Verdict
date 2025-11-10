// Backend/src/routes/Users/users.js
const express = require("express");
const bcrypt = require("bcryptjs");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try { sharedDb = require("../../shared/db/mysql").db; } catch {}

const SALT_ROUNDS = 12;

// 🔐 Supported security questions
const SQ_CATALOG = {
  pet: "What is the name of your first pet?",
  school: "What is the name of your elementary school?",
  city: "In what city were you born?",
  mother_maiden: "What is your mother’s maiden name?",
  nickname: "What was your childhood nickname?",
};

// Utility helpers
const normalizeAnswer = (s) => String(s || "").trim().toLowerCase();

const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => { if (obj?.[k] !== undefined) out[k] = obj[k]; });
  return out;
};

function aliasKey(type, value) {
  return `${type}:${String(value || "").trim().toLowerCase()}`;
}

function mergeLoginVia(cur = { employeeId: true, username: true, email: true }, next = {}) {
  return {
    employeeId: !!(next.employeeId ?? cur.employeeId),
    username: !!(next.username ?? cur.username),
    email: !!(next.email ?? cur.email),
  };
}

function ensureAtLeastOneMethod(loginVia) {
  if (!loginVia.employeeId && !loginVia.username && !loginVia.email) {
    const err = new Error("At least one login method must be enabled");
    err.statusCode = 400;
    throw err;
  }
}

function makeAliases(loginVia, username, email, employeeId) {
  const keys = [];
  if (loginVia.employeeId) keys.push(aliasKey("employee_id", employeeId));
  if (loginVia.username && username) keys.push(aliasKey("username", username));
  if (loginVia.email && email) keys.push(aliasKey("email", email));
  return keys;
}

function diffAliases(currentKeys, desiredKeys) {
  return {
    toDelete: currentKeys.filter((k) => !desiredKeys.includes(k)),
    toCreate: desiredKeys.filter((k) => !currentKeys.includes(k)),
  };
}

// ---- DB <-> API mappers ----
function dbLoginViaToObj(row) {
  return {
    employeeId: !!row.login_employee_id,
    username: !!row.login_username,
    email: !!row.login_email,
  };
}

function objToDbLoginVia(loginVia = { employeeId: true, username: true, email: true }) {
  return {
    login_employee_id: loginVia.employeeId ? 1 : 0,
    login_username: loginVia.username ? 1 : 0,
    login_email: loginVia.email ? 1 : 0,
  };
}

function sqIdsToDisplay(items = []) {
  return items.map((q) => ({ id: q.id, question: SQ_CATALOG[q.id] || "Security question" }));
}

async function requireCurrentPasswordIfNeeded(curRow, hasNewPassword, currentPassword) {
  if (!hasNewPassword) return;
  const hasExisting = !!curRow?.passwordHash;
  if (!hasExisting) return;
  if (!currentPassword) throw new Error("Current password is required.");
  const ok = await bcrypt.compare(currentPassword, curRow.passwordHash);
  if (!ok) throw new Error("Current password is incorrect.");
}

// Build validated + hashed SQ entries
async function buildSQEntries(inputArr) {
  if (!Array.isArray(inputArr)) return undefined;
  if (inputArr.length === 0) return [];
  const items = inputArr.filter(
    (q) => !!q?.id && typeof q?.answer === "string" && q.answer.trim().length > 0
  );
  if (items.length > 2) throw new Error("You can only set up to 2 security questions.");
  const ids = items.map((q) => q.id);
  if (new Set(ids).size !== ids.length) throw new Error("Security questions must be different.");

  const out = [];
  for (const q of items) {
    if (!SQ_CATALOG[q.id]) throw new Error("Unknown security question id.");
    const norm = normalizeAnswer(q.answer);
    const answerHash = await bcrypt.hash(norm, SALT_ROUNDS);
    out.push({ id: q.id, question: SQ_CATALOG[q.id], answerHash, updatedAt: new Date().toISOString() });
  }
  return out;
}

// Generate next 9-digit id: "YYYYxxxxx"
async function generateNextEmployeeId(conn, year = new Date().getFullYear()) {
  const prefix = String(year);
  const [{ max_id }] = await conn.query(
    `SELECT MAX(employee_id) AS max_id FROM employees WHERE employee_id LIKE ?`,
    [`${prefix}%`]
  );
  const base = Number(`${prefix}00000`);
  const nextNum = Math.max(base, Number(max_id || 0)) + 1;
  const nextStr = String(nextNum);
  return /^\d{9}$/.test(nextStr) ? nextStr : `${prefix}00001`;
}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");
  const router = express.Router();

  /* =============================
     GET /api/users
     ============================= */
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.query(`
        SELECT
          e.employee_id, e.first_name, e.last_name, e.phone,
          e.role, e.status, e.username, e.email,
          e.login_employee_id, e.login_username, e.login_email,
          e.password_last_changed, e.photo_url, e.created_at, e.updated_at,
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', sq.question_id))
            FROM employee_security_questions sq
            WHERE sq.employee_id = e.employee_id
          ) AS sq_json
        FROM employees e
        ORDER BY e.created_at DESC
      `);

      const safe = rows.map((r) => {
        let sqIds = [];
        try {
          const parsed = typeof r.sq_json === "string" ? JSON.parse(r.sq_json || "[]") : (r.sq_json || []);
          sqIds = Array.isArray(parsed) ? parsed : [];
        } catch { sqIds = []; }

        return {
          id: String(r.employee_id),
          employeeId: String(r.employee_id),
          firstName: r.first_name,
          lastName: r.last_name,
          phone: r.phone,
          role: r.role,
          status: r.status,
          username: r.username,
          email: r.email,
          loginVia: dbLoginViaToObj(r),
          passwordLastChanged: r.password_last_changed,
          photoUrl: r.photo_url,
          securityQuestions: sqIdsToDisplay(sqIds),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      });

      res.json(safe);
    } catch (e) {
      console.error("[GET /api/users] fail:", e);
      res.status(500).json({ error: e?.message ?? "Failed to list users" });
    }
  });

  /* =============================
     POST /api/users (create)
     ============================= */
  router.post("/", async (req, res) => {
    try {
      const {
        employeeId, firstName, lastName, phone, role, status,
        username = "", email = "",
        loginVia = { employeeId: true, username: true, email: true },
        password, pin, photoUrl = "", securityQuestions = undefined,
      } = req.body;

      if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: "firstName and lastName are required" });
      if (!/^\d{10,11}$/.test(String(phone || ""))) return res.status(400).json({ error: "phone must be 10–11 digits" });
      if (!role) return res.status(400).json({ error: "role is required" });
      if (!status) return res.status(400).json({ error: "status is required" });
      if (!password || password.length < 8) return res.status(400).json({ error: "password must be at least 8 chars" });
      if (!/^\d{6}$/.test(String(pin || ""))) return res.status(400).json({ error: "pin must be 6 digits" });

      const uname = String(username || "").trim().toLowerCase();
      const mail = String(email || "").trim();
      const desiredLoginVia = mergeLoginVia(undefined, loginVia);
      ensureAtLeastOneMethod(desiredLoginVia);

      const sqEntries = await buildSQEntries(securityQuestions);
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

      await db.tx(async (conn) => {
        let id = /^\d{9}$/.test(String(employeeId)) ? String(employeeId) : null;
        const lv = objToDbLoginVia(desiredLoginVia);

        for (let attempt = 0; attempt < 5; attempt++) {
          if (!id) id = await generateNextEmployeeId(conn);
          try {
            await conn.execute(
              `INSERT INTO employees
                (employee_id, first_name, last_name, phone, role, status,
                 username, email,
                 login_employee_id, login_username, login_email,
                 password_hash, pin_hash, password_last_changed, photo_url,
                 created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?,
                       ?, ?,
                       ?, ?, ?,
                       ?, ?, NOW(), ?,
                       NOW(), NOW())`,
              [
                id, firstName.trim(), lastName.trim(), String(phone),
                role, status,
                uname || null, mail || null,
                lv.login_employee_id, lv.login_username, lv.login_email,
                passwordHash, pinHash, photoUrl || null,
              ]
            );
            break;
          } catch (err) {
            if (err?.code === "ER_DUP_ENTRY") { id = null; continue; }
            throw err;
          }
        }

        const aliasesWanted = makeAliases(desiredLoginVia, uname, mail, id);
        for (const key of aliasesWanted) {
          const [type, valueLower] = key.split(":");
          try {
            await conn.execute(
              `INSERT INTO aliases (alias_key, type, value_lower, employee_id, created_at)
              VALUES (?, ?, ?, ?, NOW())`,
              [key, type, valueLower, id]
            );
          } catch (err) {
            if (err?.code === "ER_DUP_ENTRY") {
              if (type === "username") throw new Error("Username already in use");
              if (type === "email") throw new Error("Email already in use");
              throw new Error("Credential (alias) already in use");
            }
            throw err;
          }
        }

        if (Array.isArray(sqEntries)) {
          for (const q of sqEntries) {
            await conn.execute(
              `INSERT INTO employee_security_questions
                 (employee_id, question_id, answer_hash, updated_at, created_at)
               VALUES (?, ?, ?, NOW(), NOW())
               ON DUPLICATE KEY UPDATE
                 answer_hash = VALUES(answer_hash),
                 updated_at = NOW()`,
              [id, q.id, q.answerHash]
            );
          }
        }
      });

      res.status(201).json({ ok: true });
    } catch (e) {
      console.error("[POST /api/users] fail:", e);
      res.status(500).json({ error: e?.message ?? "Failed to create user" });
    }
  });

  /* =============================
     PATCH /api/users/:employeeId
     ============================= */
  router.patch("/:employeeId", async (req, res) => {
    try {
      const { employeeId } = req.params;
      const patch = req.body ?? {};
      const hasNewPassword = typeof patch.password === "string" && patch.password.length >= 8;
      const hasNewPin = typeof patch.pin === "string" && /^\d{6}$/.test(patch.pin);
      const currentPassword = typeof patch.currentPassword === "string" ? patch.currentPassword : "";

      const curRows = await db.query(`SELECT * FROM employees WHERE employee_id = ? LIMIT 1`, [String(employeeId)]);
      if (!curRows.length) return res.status(404).json({ error: "Employee not found" });
      const cur = curRows[0];

      await requireCurrentPasswordIfNeeded({ passwordHash: cur.password_hash }, hasNewPassword, currentPassword);

      const next = pick(patch, ["firstName", "lastName", "phone", "role", "status", "username", "email", "loginVia", "photoUrl"]);

      const desiredLoginVia = mergeLoginVia(
        {
          employeeId: !!cur.login_employee_id,
          username: !!cur.login_username,
          email: !!cur.login_email,
        },
        next.loginVia
      );
      ensureAtLeastOneMethod(desiredLoginVia);

      const newUsername = (next.username ?? cur.username ?? "").trim().toLowerCase();
      const newEmail = (next.email ?? cur.email ?? "").trim();

      const curLoginVia = {
        employeeId: !!cur.login_employee_id,
        username: !!cur.login_username,
        email: !!cur.login_email,
      };
      const curAliases = makeAliases(curLoginVia, cur.username, cur.email, employeeId);
      const desiredAliases = makeAliases(desiredLoginVia, newUsername, newEmail, employeeId);
      const { toDelete, toCreate } = diffAliases(curAliases, desiredAliases);

      const sqProvided = Object.prototype.hasOwnProperty.call(patch, "securityQuestions");
      const sqEntries = sqProvided ? await buildSQEntries(patch.securityQuestions) : undefined;

      const now = new Date();

      await db.tx(async (conn) => {
        // BEFORE you build params/sets; still inside the transaction
        for (const key of toCreate) {
          const [type, valueLower] = key.split(":");

          // Exact key hit?
          const exist = await conn.query(
            `SELECT alias_key, employee_id FROM aliases WHERE alias_key = ? LIMIT 1`,
            [key]
          );

          if (!exist.length) continue;

          const ownerId = String(exist[0].employee_id);
          if (ownerId === String(employeeId)) {
            // Already mine — allow idempotent insert later.
            continue;
          }

          // Does the recorded owner still exist?
          const ownerRows = await conn.query(
            `SELECT employee_id, email, username,
                    login_email, login_username, login_employee_id
            FROM employees
            WHERE employee_id = ? LIMIT 1`,
            [ownerId]
          );

          if (!ownerRows.length) {
            // Orphan alias → clean up and reclaim
            await conn.execute(`DELETE FROM aliases WHERE alias_key = ?`, [key]);
            continue;
          }

          const owner = ownerRows[0];

          // Determine if that owner STILL legitimately "wants" this alias
          let ownerStillWants = false;
          if (type === "email") {
            const ownerEmailLower = String(owner.email || "").trim().toLowerCase();
            ownerStillWants = !!owner.login_email && ownerEmailLower === valueLower;
          } else if (type === "username") {
            const ownerUnameLower = String(owner.username || "").trim().toLowerCase();
            ownerStillWants = !!owner.login_username && ownerUnameLower === valueLower;
          } else if (type === "employee_id") {
            ownerStillWants = !!owner.login_employee_id && String(owner.employee_id) === valueLower;
          }

          if (!ownerStillWants) {
            // Alias is stale (belongs to an employee who no longer uses it) → reclaim it
            await conn.execute(`DELETE FROM aliases WHERE alias_key = ?`, [key]);
            continue;
          }

          // Real conflict: other employee still legitimately owns this alias
          if (type === "username") throw new Error("Username already in use");
          if (type === "email") throw new Error("Email already in use");
          throw new Error("Credential (alias) already in use");
        }

        const sets = ["updated_at = NOW()"];
        const params = [];

        if (next.firstName !== undefined) { sets.push("first_name = ?"); params.push(next.firstName.trim()); }
        if (next.lastName !== undefined)  { sets.push("last_name = ?");  params.push(next.lastName.trim()); }
        if (next.phone !== undefined)     { sets.push("phone = ?");      params.push(next.phone); }
        if (next.role !== undefined)      { sets.push("role = ?");       params.push(next.role); }
        if (next.status !== undefined)    { sets.push("status = ?");     params.push(next.status); }
        if (next.username !== undefined)  { sets.push("username = ?");   params.push(newUsername || null); }
        if (next.email !== undefined)     { sets.push("email = ?");      params.push(newEmail || null); }
        if (next.photoUrl !== undefined)  { sets.push("photo_url = ?");  params.push(next.photoUrl || ""); }
        if (next.loginVia !== undefined)  {
          const lv = objToDbLoginVia(desiredLoginVia);
          sets.push("login_employee_id = ?", "login_username = ?", "login_email = ?");
          params.push(lv.login_employee_id, lv.login_username, lv.login_email);
        }
        if (hasNewPassword) {
          const passwordHash = await bcrypt.hash(patch.password, SALT_ROUNDS);
          sets.push("password_hash = ?", "password_last_changed = ?");
          params.push(passwordHash, now);
        }
        if (hasNewPin) {
          const pinHash = await bcrypt.hash(patch.pin, SALT_ROUNDS);
          sets.push("pin_hash = ?");
          params.push(pinHash);
        }

        params.push(String(employeeId));
        await conn.execute(`UPDATE employees SET ${sets.join(", ")} WHERE employee_id = ?`, params);

        for (const key of toDelete) await conn.execute(`DELETE FROM aliases WHERE alias_key = ?`, [key]);
        for (const key of toCreate) {
          const [type, valueLower] = key.split(":");
          // Insert if missing; if it already belongs to me, do nothing.
          await conn.execute(
            `INSERT INTO aliases (alias_key, type, value_lower, employee_id, created_at)
            VALUES (?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              employee_id = IF(employee_id = VALUES(employee_id), employee_id, employee_id)`,
            [key, type, valueLower, employeeId]
          );
        }

        if (sqProvided) {
          await conn.execute(`DELETE FROM employee_security_questions WHERE employee_id = ?`, [employeeId]);
          for (const q of (sqEntries || [])) {
            await conn.execute(
              `INSERT INTO employee_security_questions
                 (employee_id, question_id, answer_hash, updated_at, created_at)
               VALUES (?, ?, ?, NOW(), NOW())`,
              [employeeId, q.id, q.answerHash]
            );
          }
        }
      });

      res.json({ ok: true });
    } catch (e) {
      console.error("[PATCH /api/users/:employeeId] fail:", e);
      res.status(e.statusCode ?? 500).json({ error: e?.message ?? "Failed to update user" });
    }
  });

  /* =============================
     DELETE /api/users/:employeeId
     ============================= */
  router.delete("/:employeeId", async (req, res) => {
    try {
      const { employeeId } = req.params;
      await db.tx(async (conn) => {
        // Defensive: remove stale aliases first
        await conn.execute(`DELETE FROM aliases WHERE employee_id = ?`, [String(employeeId)]);
        await conn.execute(`DELETE FROM employees WHERE employee_id = ?`, [String(employeeId)]);
      });
      res.json({ ok: true });
    } catch (e) {
      console.error("[DELETE /api/users/:employeeId] fail:", e);
      res.status(500).json({ error: e?.message ?? "Failed to delete user" });
    }
  });

  return router;
};