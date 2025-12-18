// Backoffice/Backend/src/routes/Users/users.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth } = require("../../auth/requireAuth");

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
  if (items.length > 1) throw new Error("Only one security question is allowed.");

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
  const [rows] = await conn.query(
    `SELECT MAX(employee_id) AS max_id FROM employees WHERE employee_id LIKE ?`,
    [`${prefix}%`]
  );
  const max_id = rows?.[0]?.max_id;
  const base = Number(`${prefix}00000`);
  const nextNum = Math.max(base, Number(max_id || 0)) + 1;
  const nextStr = String(nextNum);
  return /^\d{9}$/.test(nextStr) ? nextStr : `${prefix}00001`;
}

module.exports = ({ db } = {}) => {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");
  const router = express.Router();

  router.use(requireAuth);

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
          (e.pin_hash IS NOT NULL) AS has_pin,

          -- legacy/global counters (kept for back-compat)
          e.failed_login_count, e.lock_until, e.permanent_lock,

          -- security questions (ids only; text is mapped on API)
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', sq.question_id))
            FROM employee_security_questions sq
            WHERE sq.employee_id = e.employee_id
          ) AS sq_json,

          -- NEW: per-system lock states, aggregated to a JSON object
          (
            SELECT JSON_OBJECTAGG(
              els.app,
              JSON_OBJECT(
                'failedLoginCount', els.failed_login_count,
                'lockUntil', els.lock_until,
                'permanentLock', els.permanent_lock,
                'lastFailedLogin', els.last_failed_login
              )
            )
            FROM employee_lock_state els
            WHERE els.employee_id = e.employee_id
          ) AS lock_states_json

        FROM employees e
        ORDER BY e.created_at DESC
      `);

      const safe = rows.map((r) => {
        // SQ ids
        let sqIds = [];
        try {
          const parsed = typeof r.sq_json === "string" ? JSON.parse(r.sq_json || "[]") : (r.sq_json || []);
          sqIds = Array.isArray(parsed) ? parsed : [];
        } catch { sqIds = []; }

        // Per-system lock states
        let lockStates = {};
        try {
          lockStates = typeof r.lock_states_json === "string"
            ? JSON.parse(r.lock_states_json || "{}")
            : (r.lock_states_json || {});
        } catch { lockStates = {}; }

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
          hasPin: !!r.has_pin,
          securityQuestions: sqIdsToDisplay(sqIds),
          createdAt: r.created_at,
          updatedAt: r.updated_at,

          // legacy/global (still returned for existing UI)
          failedLoginCount: r.failed_login_count ?? 0,
          lockUntil: r.lock_until,                 // may be null
          permanentLock: !!r.permanent_lock,       // boolean

          // NEW: explicit per-system states with safe defaults
          lockStates: {
            backoffice: lockStates.backoffice || {
              failedLoginCount: 0, lockUntil: null, permanentLock: 0, lastFailedLogin: null,
            },
            pos: lockStates.pos || {
              failedLoginCount: 0, lockUntil: null, permanentLock: 0, lastFailedLogin: null,
            },
          },
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
      const roleNorm = String(role || "").trim();
      const passwordProvided =
        typeof password === "string" && password.length >= 8;
      const pinProvided =
        typeof pin === "string" && /^\d{6}$/.test(String(pin || ""));

      if (roleNorm === "Admin" && !passwordProvided) {
        return res.status(400).json({ error: "password must be at least 8 chars" });
      }

      if (roleNorm === "Cashier" && !pinProvided) {
        return res.status(400).json({ error: "pin must be 6 digits" });
      }

      const uname = String(username || "").trim().toLowerCase();
      const mail = String(email || "").trim();
      const desiredLoginVia = mergeLoginVia(undefined, loginVia);
      ensureAtLeastOneMethod(desiredLoginVia);

      const sqEntries = await buildSQEntries(securityQuestions);
      const passwordHash = passwordProvided ? await bcrypt.hash(password, SALT_ROUNDS) : null;
      const pinHash = pinProvided ? await bcrypt.hash(pin, SALT_ROUNDS) : null;

      const subjectAfterBase = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: String(phone),
        role,
        status,
        username: uname || null,
        email: mail || null,
        loginVia: desiredLoginVia,
      };

      await db.tx(async (conn) => {
        let id = /^\d{9}$/.test(String(employeeId)) ? String(employeeId) : null;
        const lv = objToDbLoginVia(desiredLoginVia);

        for (let attempt = 0; attempt < 5; attempt++) {
          if (!id) id = await generateNextEmployeeId(conn);

          try {
            if (passwordHash) {
              // Roles WITH password (Admin)
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
            } else {
              // No password provided (Cashier) → do NOT touch password_hash
              await conn.execute(
                `INSERT INTO employees
                  (employee_id, first_name, last_name, phone, role, status,
                   username, email,
                   login_employee_id, login_username, login_email,
                   pin_hash, password_last_changed, photo_url,
                   created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?,
                         ?, ?,
                         ?, ?, ?,
                         ?, NULL, ?,
                         NOW(), NOW())`,
                [
                  id, firstName.trim(), lastName.trim(), String(phone),
                  role, status,
                  uname || null, mail || null,
                  lv.login_employee_id, lv.login_username, lv.login_email,
                  pinHash, photoUrl || null,
                ]
              );
            }

            // Insert succeeded, break retry loop
            break;
          } catch (err) {
            if (err?.code === "ER_DUP_ENTRY") {
              // ID collision → regenerate and retry
              id = null;
              continue;
            }
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

        const subjectAfter = subjectAfterBase;

        await logUserAudit(conn, req, {
          action: "User - Created",
          actionType: "create",
          statusChange: "USER_CREATED",
          targetEmployeeId: String(id),
          subjectAfter,
          statusMessage: `User created: ${subjectAfter.firstName} ${subjectAfter.lastName} (${id}).`,
          extraActionDetails: {
            createdEmployeeId: String(id),
            role: subjectAfter.role,
            status: subjectAfter.status,
            username: subjectAfter.username,
            email: subjectAfter.email,
            loginVia: subjectAfter.loginVia,
          },
        });
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

      const nextRole = patch.role !== undefined ? String(patch.role).trim() : String(cur.role || "").trim();

      // Block password updates for Cashier
      if (hasNewPassword && nextRole === "Cashier") {
        return res.status(400).json({ error: "Cashier cannot have a password (PIN only)." });
      }

      // Block PIN updates for Admin
      if (hasNewPin && nextRole === "Admin") {
        return res.status(400).json({ error: "Admin cannot have a PIN (password only)." });
      }

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

      const subjectBefore = {
        firstName: cur.first_name,
        lastName: cur.last_name,
        phone: cur.phone,
        role: cur.role,
        status: cur.status,
        username: cur.username,
        email: cur.email,
        loginVia: curLoginVia,
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

        // ===============================
        // 🔍 Build "after" snapshot
        // ===============================
        const subjectAfter = {
          firstName:
            next.firstName !== undefined ? next.firstName : cur.first_name,
          lastName:
            next.lastName !== undefined ? next.lastName : cur.last_name,
          phone: next.phone !== undefined ? next.phone : cur.phone,
          role: next.role !== undefined ? next.role : cur.role,
          status: next.status !== undefined ? next.status : cur.status,
          username:
            next.username !== undefined ? newUsername : cur.username,
          email: next.email !== undefined ? newEmail : cur.email,
          loginVia: desiredLoginVia,
        };

        // What changed?
        const basicChangedKeys = [];
        if (subjectBefore.firstName !== subjectAfter.firstName) basicChangedKeys.push("firstName");
        if (subjectBefore.lastName !== subjectAfter.lastName)  basicChangedKeys.push("lastName");
        if (subjectBefore.phone !== subjectAfter.phone)        basicChangedKeys.push("phone");
        if (subjectBefore.role !== subjectAfter.role)          basicChangedKeys.push("role");
        if (subjectBefore.status !== subjectAfter.status)      basicChangedKeys.push("status");
        if (subjectBefore.username !== subjectAfter.username)  basicChangedKeys.push("username");
        if (subjectBefore.email !== subjectAfter.email)        basicChangedKeys.push("email");

        const loginViaChanged =
          JSON.stringify(subjectBefore.loginVia) !== JSON.stringify(subjectAfter.loginVia);

        const hasSqChange = !!sqProvided;
        const authChanges = {
          passwordChanged: !!hasNewPassword,
          pinChanged: !!hasNewPin,
          securityQuestionsChanged: hasSqChange,
        };

        // Build changedFields for audit (extra detail)
        const changedFields = {};

        basicChangedKeys.forEach((key) => {
          changedFields[key] = {
            before: subjectBefore[key],
            after: subjectAfter[key],
          };
        });

        if (loginViaChanged) {
          changedFields.loginVia = {
            before: subjectBefore.loginVia,
            after: subjectAfter.loginVia,
          };
        }

        // Determine type of update
        const onlyPasswordChange =
          authChanges.passwordChanged &&
          !authChanges.pinChanged &&
          !authChanges.securityQuestionsChanged &&
          !basicChangedKeys.length &&
          !loginViaChanged;

        const onlySqChange =
          authChanges.securityQuestionsChanged &&
          !authChanges.passwordChanged &&
          !authChanges.pinChanged &&
          !basicChangedKeys.length &&
          !loginViaChanged;

        let actionLabel = "User - Updated";
        let statusKey = "USER_UPDATED";
        let actionType = "update";

        if (onlyPasswordChange) {
          actionLabel = "User - Password Changed";
          statusKey = "USER_PASSWORD_CHANGED";
          actionType = "password_update";
        } else if (onlySqChange) {
          actionLabel = "User - Security Questions Updated";
          statusKey = "USER_SQ_UPDATED";
          actionType = "security_questions_update";
        }

        const changedLabels = [
          ...basicChangedKeys,
          loginViaChanged ? "loginVia" : null,
          authChanges.passwordChanged ? "password" : null,
          authChanges.pinChanged ? "pin" : null,
          authChanges.securityQuestionsChanged ? "securityQuestions" : null,
        ].filter(Boolean);

        const statusMessage =
          changedLabels.length
            ? `Updated user ${subjectAfter.firstName} ${subjectAfter.lastName} (${employeeId}): ${changedLabels.join(", ")}.`
            : `Updated user ${subjectAfter.firstName} ${subjectAfter.lastName} (${employeeId}).`;

        const extraActionDetails = {
          changedFields: Object.keys(changedFields).length ? changedFields : undefined,
          authChanges:
            authChanges.passwordChanged ||
            authChanges.pinChanged ||
            authChanges.securityQuestionsChanged
              ? authChanges
              : undefined,
        };

        await logUserAudit(conn, req, {
          action: actionLabel,
          actionType,
          statusChange: statusKey,
          targetEmployeeId: String(employeeId),
          subjectBefore,
          subjectAfter,
          statusMessage,
          extraActionDetails,
        });
      });

      res.json({ ok: true });
    } catch (e) {
      console.error("[PATCH /api/users/:employeeId] fail:", e);
      res.status(e.statusCode ?? 500).json({ error: e?.message ?? "Failed to update user" });
    }
  });

  /* =============================
    POST /api/users/:employeeId/unlock
    ============================= */
  router.post("/:employeeId/unlock", async (req, res) => {
    try {
      const { employeeId } = req.params;
      const app = String(req.body?.app || "").trim().toLowerCase();
      const scope = String(req.body?.scope || "").trim().toLowerCase();

      // Always clear legacy/global columns so old UIs stay in sync
      await db.query(
        `UPDATE employees
            SET failed_login_count = 0,
                lock_until = NULL,
                permanent_lock = 0,
                updated_at = NOW()
          WHERE employee_id = ?`,
        [String(employeeId)]
      );

      // Helper to clear one app row in employee_lock_state (upsert to ensure row exists)
      async function clearApp(appKey) {
        await db.query(
          `INSERT INTO employee_lock_state
             (employee_id, app, failed_login_count, lock_until, permanent_lock, last_failed_login)
           VALUES (?, ?, 0, NULL, 0, NULL)
           ON DUPLICATE KEY UPDATE
             failed_login_count = 0,
             lock_until = NULL,
             permanent_lock = 0,
             last_failed_login = NULL`,
          [String(employeeId), appKey]
        );
      }

      if (scope === "all") {
        await clearApp("backoffice");
        await clearApp("pos");
      } else if (app === "pos" || app === "backoffice") {
        await clearApp(app);
      } // else: legacy-only clear (kept for backward compatibility)

      // ===========================
      // 🔐 Audit: User Unlock
      // ===========================
      let subjectRow = null;
      try {
        const rows = await db.query(
          `SELECT employee_id, first_name, last_name, role, status, username, email
           FROM employees
           WHERE employee_id = ? LIMIT 1`,
          [String(employeeId)]
        );
        if (rows.length) subjectRow = rows[0];
      } catch {
        // ignore – audit will still log with ID only
      }

      const subjectAfter = subjectRow
        ? {
            firstName: subjectRow.first_name,
            lastName: subjectRow.last_name,
            role: subjectRow.role,
            status: subjectRow.status,
            username: subjectRow.username,
            email: subjectRow.email,
          }
        : { firstName: "", lastName: "" };

      const unlockScope =
        scope === "all"
          ? "all"
          : app === "pos" || app === "backoffice"
          ? app
          : "legacy";

      const niceScope =
        unlockScope === "all"
          ? "all systems"
          : unlockScope === "pos"
          ? "Cashier-POS"
          : unlockScope === "backoffice"
          ? "Backoffice"
          : "legacy/global";

      const displayName =
        (subjectAfter.firstName || subjectAfter.lastName)
          ? `${subjectAfter.firstName} ${subjectAfter.lastName}`.trim()
          : String(employeeId);

      await logUserAudit(db, req, {
        action: "User - Unlock",
        actionType: "unlock",
        statusChange: "USER_UNLOCKED",
        targetEmployeeId: String(employeeId),
        subjectAfter,
        statusMessage: `Unlocked ${niceScope} for ${displayName}.`,
        extraActionDetails: {
          unlockScope,
        },
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error("[POST /api/users/:employeeId/unlock] fail:", e);
      res.status(500).json({ error: e?.message ?? "Failed to unlock user" });
    }
  });

  /* =============================
     DELETE /api/users/:employeeId
     ============================= */
  router.delete("/:employeeId", async (req, res) => {
    try {
      const { employeeId } = req.params;

      await db.tx(async (conn) => {
        // Fetch current user for audit context
        let cur = null;
        try {
          const rows = await conn.query(
            `SELECT employee_id, first_name, last_name, phone, role, status, username, email
             FROM employees
             WHERE employee_id = ? LIMIT 1`,
            [String(employeeId)]
          );
          if (rows.length) cur = rows[0];
        } catch {
          // ignore – delete still proceeds
        }

        // Defensive: remove aliases first
        await conn.execute(
          `DELETE FROM aliases WHERE employee_id = ?`,
          [String(employeeId)]
        );
        await conn.execute(
          `DELETE FROM employees WHERE employee_id = ?`,
          [String(employeeId)]
        );

        if (cur) {
          const subjectBefore = {
            firstName: cur.first_name,
            lastName: cur.last_name,
            phone: cur.phone,
            role: cur.role,
            status: cur.status,
            username: cur.username,
            email: cur.email,
          };

          await logUserAudit(conn, req, {
            action: "User - Deleted",
            actionType: "delete",
            statusChange: "USER_DELETED",
            targetEmployeeId: String(employeeId),
            subjectBefore,
            statusMessage: `Deleted user ${subjectBefore.firstName} ${subjectBefore.lastName} (${employeeId}).`,
          });
        }
      });

      res.json({ ok: true });
    } catch (e) {
      console.error("[DELETE /api/users/:employeeId] fail:", e);

      // MySQL FK constraint: row is referenced in another table (e.g. pos_shifts)
      if (e?.code === "ER_ROW_IS_REFERENCED_2" || e?.errno === 1451) {
        return res.status(400).json({
          error:
            "This user cannot be deleted because they are already used in POS shifts or other records. ",
        });
      }

      res.status(500).json({ error: e?.message ?? "Failed to delete user" });
    }
  });

  // =============================================
  // 🔎 Audit Trail helpers for User Management
  // =============================================
  function getActorFromReq(req) {
    const u = req.user || {};
    const name =
      u.fullName ||
      [u.firstName || u.first_name, u.lastName || u.last_name]
        .filter(Boolean)
        .join(" ") ||
      u.username ||
      u.employeeId ||
      "System";

    const role = u.role || u.employeeRole || "—";
    return { employee: name, role };
  }

  async function insertAuditLog(connOrDb, { employee, role, action, detail }) {
    const payload = [
      employee || "System",
      role || "—",
      action,
      JSON.stringify(detail || {}),
    ];

    if (connOrDb && typeof connOrDb.execute === "function") {
      await connOrDb.execute(
        `INSERT INTO audit_trail (employee, role, action, detail)
        VALUES (?, ?, ?, ?)`,
        payload
      );
    } else if (connOrDb && typeof connOrDb.query === "function") {
      await connOrDb.query(
        `INSERT INTO audit_trail (employee, role, action, detail)
        VALUES (?, ?, ?, ?)`,
        payload
      );
    }
  }

  /**
   * Standardized User Management audit entry
   *
   * - action: "User - Created", "User - Updated", "User - Deleted", "User - Unlock", ...
   * - actionType: "create" | "update" | "delete" | "unlock" | "password_update" | "security_questions_update"
   * - statusChange: matches AUTH_STATUS_LEGEND key (e.g. "USER_CREATED")
   */
  async function logUserAudit(
    connOrDb,
    req,
    {
      action,
      actionType,
      statusChange,
      targetEmployeeId,
      subjectBefore,
      subjectAfter,
      statusMessage,
      extraActionDetails = {},
      extraAffectedData = {},
      meta = {},
    }
  ) {
    const { employee, role } = getActorFromReq(req);

    const subject = subjectAfter || subjectBefore || {};
    const nameParts = [
      subject.firstName || subject.first_name,
      subject.lastName || subject.last_name,
    ].filter(Boolean);

    const subjectLabel = `${nameParts.join(" ") || "Employee"} (${targetEmployeeId})`;

    const items = [{ name: subjectLabel, qty: 1 }];

    const detail = {
      statusMessage,
      actionDetails: {
        actionType,
        app: "backoffice", // 🔹 used by AuditTrail "Source" column
        targetEmployeeId,
        ...extraActionDetails,
      },
      affectedData: {
        statusChange,
        items,
        ...extraAffectedData,
      },
      meta: {
        app: "backoffice",
        ...meta,
      },
    };

    await insertAuditLog(connOrDb, { employee, role, action, detail });
  }

  return router;
};