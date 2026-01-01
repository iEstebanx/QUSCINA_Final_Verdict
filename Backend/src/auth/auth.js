// QUSCINA_BACKOFFICE/Backend/src/auth/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Prefer DI from server.js, but fall back to shared pool if not provided
let sharedDb = null;
try {
  sharedDb = require("../shared/db/mysql").db;
} catch {
  /* ok until DI passes db */
}

// Keep your email sender
const { sendOtpEmail } = require("../shared/email/mailer");

const {
  safeCreateEmailOtp,
  getLatestPendingOtp,
} = require("../shared/OTP/EmailOTP/otp");

module.exports = function authRouterFactory({ db } = {}) {
  db = db || sharedDb;
  if (!db)
    throw new Error(
      "DB pool not available. Pass { db } from server.js or ensure ../shared/db/mysql exists."
    );

  const router = express.Router();

  async function withTransaction(db, fn) {
    const getConn =
      (db && typeof db.getConnection === "function" && (() => db.getConnection())) ||
      (db && db.pool && typeof db.pool.getConnection === "function" && (() => db.pool.getConnection()));

    if (getConn) {
      const conn = await getConn();
      try {
        await conn.beginTransaction();
        const result = await fn(conn, { inTx: true });
        await conn.commit();
        return result;
      } catch (err) {
        try { await conn.rollback(); } catch {}
        throw err;
      } finally {
        try { conn.release(); } catch {}
      }
    }

    return fn(db, { inTx: false });
  }

  // ---- Config ----
  const DEBUG = process.env.DEBUG_AUTH === "1";
  const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
  const RESET_JWT_SECRET = process.env.JWT_RESET_SECRET || JWT_SECRET;

  const OTP_TTL_SEC = Number(process.env.OTP_TTL_SEC || 10 * 60);
  const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
  const RESET_TOKEN_TTL = String(process.env.RESET_TOKEN_TTL || "15m");
  const SQ_TOKEN_TTL = String(process.env.SQ_TOKEN_TTL || "10m");

  // ----- App realm + per-app lock helpers -----
  const APP_DEFAULT = "backoffice";
  function getAppRealm(req) {
    const fromBody = String(req.body?.app || "").trim().toLowerCase();
    const fromHeader = String(req.headers["x-app"] || "")
      .trim()
      .toLowerCase();
    const app = fromBody || fromHeader || APP_DEFAULT;
    return app === "pos" ? "pos" : "backoffice";
  }

  async function readLockRow(db, employeeId, app) {
    const rows = await db.query(
      `SELECT failed_login_count, lock_until, permanent_lock
        FROM employee_lock_state
        WHERE employee_id = ? AND app = ? LIMIT 1`,
      [employeeId, app]
    );
    return (
      rows[0] || {
        failed_login_count: 0,
        lock_until: null,
        permanent_lock: 0,
      }
    );
  }

  function lockInfoFromRow(row) {
    const untilMs = row.lock_until
      ? new Date(row.lock_until).getTime()
      : 0;
    const msLeft = Math.max(0, untilMs - Date.now());
    return { locked: msLeft > 0, msLeft, permanent: !!row.permanent_lock };
  }

  async function bumpLockForApp({ employeeId, app }) {
    const row = await readLockRow(db, employeeId, app);
    const newFails = Number(row.failed_login_count || 0) + 1;

    // compute lock outcome
    const next = computeNextLock(newFails); // uses LOCK_POLICY
    const lockUntilSql =
      next.perm ? null :
      next.minutes && next.minutes > 0
        ? `DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${Number(next.minutes)} MINUTE)`
        : null;

    // upsert
    await db.query(
      `
      INSERT INTO employee_lock_state (employee_id, app, failed_login_count, lock_until, permanent_lock, last_failed_login)
      VALUES (?, ?, 1, ${lockUntilSql ? lockUntilSql : "NULL"}, ?, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        failed_login_count = failed_login_count + 1,
        lock_until = ${lockUntilSql ? lockUntilSql : "lock_until"},
        permanent_lock = CASE
          WHEN failed_login_count + 1 >= ? THEN 1
          ELSE permanent_lock
        END,
        last_failed_login = UTC_TIMESTAMP()
      `,
      [
        employeeId,
        app,
        next.perm ? 1 : 0,
        LOCK_POLICY.permanent_on,
      ]
    );

    const fresh = await readLockRow(db, employeeId, app);
    const info = lockInfoFromRow(fresh);

    return {
      locked: info.locked,
      permanent: info.permanent,
      remaining_seconds: info.locked ? Math.ceil(info.msLeft / 1000) : 0,
      failed_login_count: Number(fresh.failed_login_count || 0),
    };
  }

  async function clearLockForApp({ employeeId, app }) {
    await db.query(
      `
      UPDATE employee_lock_state
        SET failed_login_count = 0,
            lock_until = NULL,
            permanent_lock = 0,
            last_failed_login = NULL
      WHERE employee_id = ? AND app = ?
      `,
      [employeeId, app]
    );
  }

  const LOCK_POLICY = {
    step4_minutes: 0,       // no lock on 4th attempt anymore
    step5_minutes: 15,      // 15-minute lock on 5th attempt
    permanent_on: 6,        // 6th failed attempt -> permanent lock
  };
  const MIRROR_PERM_LOCK_TO_STATUS_INACTIVE = false;

  // ---- Auth Status Legend (for audit_trail.detail.affectedData.statusChange) ----
  const AUTH_STATUS = {
    // generic
    NONE: "NONE",

    // login / account
    LOGIN_UNKNOWN_IDENTIFIER: "LOGIN_UNKNOWN_IDENTIFIER",
    LOGIN_ACCOUNT_NOT_ACTIVE: "LOGIN_ACCOUNT_NOT_ACTIVE",
    LOGIN_METHOD_DISABLED: "LOGIN_METHOD_DISABLED",
    LOGIN_BAD_PASSWORD: "LOGIN_BAD_PASSWORD",
    LOGIN_LOCK_TEMP: "LOGIN_LOCK_TEMP",
    LOGIN_LOCK_PERMA: "LOGIN_LOCK_PERMA",
    LOGIN_OK: "LOGIN_OK",
    LOGIN_OK_BACKOFFICE_DENIED: "LOGIN_OK_BACKOFFICE_DENIED",

    // email OTP
    OTP_EMAIL_SENT: "OTP_EMAIL_SENT",
    OTP_EMAIL_RESENT: "OTP_EMAIL_RESENT",
    OTP_COOLDOWN_ACTIVE: "OTP_COOLDOWN_ACTIVE",
    OTP_INVALID_OR_EXPIRED: "OTP_INVALID_OR_EXPIRED",
    OTP_EXPIRED: "OTP_EXPIRED",
    OTP_BLOCKED: "OTP_BLOCKED",
    OTP_VERIFIED_RESET_ALLOWED: "OTP_VERIFIED_RESET_ALLOWED",

    // security questions
    SQ_FLOW_STARTED: "SQ_FLOW_STARTED",
    SQ_VERIFIED_RESET_ALLOWED: "SQ_VERIFIED_RESET_ALLOWED",

    // final reset
    PASSWORD_RESET_SUCCESS: "PASSWORD_RESET_SUCCESS",
    PASSWORD_RESET_FAILED: "PASSWORD_RESET_FAILED",

    // logout
    LOGOUT_OK: "LOGOUT_OK",
  };

  // ---- Audit helper for auth events ----
  async function logAuditLogin({ employeeName, role, action, detail }) {
    try {
      await db.query(
        `INSERT INTO audit_trail (employee, role, action, detail)
         VALUES (?, ?, ?, ?)`,
        [
          employeeName || "System",
          role || "—",
          action,
          JSON.stringify(detail || {}),
        ]
      );
    } catch (e) {
      if (DEBUG) {
        console.error(
          "[audit_trail][auth] insert failed:",
          e.message || e
        );
      }
      // Do NOT block auth if audit insert fails
    }
  }

  function prettyEmployeeName(userRow) {
    const full = `${userRow.first_name || ""} ${
      userRow.last_name || ""
    }`.trim();
    if (full) return full;
    if (userRow.username) return userRow.username;
    return String(userRow.employee_id || "Unknown");
  }

  // ---- Helpers ----
  const lower = (s) => String(s || "").trim().toLowerCase();

  function normalizeIdentifier(idRaw) {
    const s = String(idRaw || "").trim();
    if (/^\d{9}$/.test(s))
      return { type: "employee_id", valueLower: s }; // id is digits; not lowercased
    if (s.includes("@"))
      return { type: "email", valueLower: s.toLowerCase() };
    return { type: "username", valueLower: s.toLowerCase() };
  }

  function nowUtcSql() {
    return "UTC_TIMESTAMP()";
  }

  function lockInfo(user) {
    const until = user.lock_until ? new Date(user.lock_until).getTime() : 0;
    const msLeft = Math.max(0, until - Date.now());
    return {
      locked: !!user.lock_until && msLeft > 0,
      msLeft,
      permanent: !!user.permanent_lock,
    };
  }

  function computeNextLock(fails) {
    // fails is the *new* consecutive count after increment
    if (fails >= LOCK_POLICY.permanent_on) return { perm: true };
    if (fails === 5) return { minutes: LOCK_POLICY.step5_minutes };
    if (fails === 4) return { minutes: LOCK_POLICY.step4_minutes };
    return { minutes: 0 };
  }

  async function findByAlias(identifierRaw) {
    const { type, valueLower } = normalizeIdentifier(identifierRaw);

    // 1) resolve employee_id via aliases
    const a = await db.query(
      `SELECT employee_id FROM aliases WHERE type = ? AND value_lower = ? LIMIT 1`,
      [type, valueLower]
    );
    if (!a.length) return { user: null, type };

    // 2) fetch employee row
    const empId = a[0].employee_id;
    const rows = await db.query(
      `SELECT * FROM employees WHERE employee_id = ? LIMIT 1`,
      [empId]
    );
    return { user: rows[0] || null, type };
  }

  async function findByEmail(emailRaw) {
    const emailLower = lower(emailRaw);
    if (!emailLower) return null;
    const a = await db.query(
      `SELECT employee_id FROM aliases WHERE type='email' AND value_lower=? LIMIT 1`,
      [emailLower]
    );
    if (!a.length) return null;
    const empId = a[0].employee_id;
    const rows = await db.query(
      `SELECT * FROM employees WHERE employee_id = ? LIMIT 1`,
      [empId]
    );
    return rows[0] || null;
  }

  function makeJwtUserPayload(userRow) {
    return {
      sub: String(userRow.employee_id),
      role: userRow.role,
      name: `${userRow.first_name || ""} ${
        userRow.last_name || ""
      }`.trim(),
      username: userRow.username || "",
      email: userRow.email || "",
      employeeId: String(userRow.employee_id),
    };
  }

  function issueAuthToken(userRow) {
    return jwt.sign(makeJwtUserPayload(userRow), JWT_SECRET, {
      expiresIn: "7d",
    });
  }

  function setAuthCookie(res, token, { remember } = {}) {
    const maxAgeMs = remember ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000; // 7d or 12h
    res.cookie("qd_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // dev (http)
      path: "/",     // IMPORTANT: allow all /api/* not just /api/auth
      maxAge: maxAgeMs,
    });
  }

  function loginMethodAllowed(userRow, loginType) {
    // employees table uses login_employee_id / login_username / login_email (tinyint)
    if (loginType === "employee_id") return !!userRow.login_employee_id;
    if (loginType === "username") return !!userRow.login_username;
    if (loginType === "email") return !!userRow.login_email;
    return false;
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  function isEmailAllowed(email) {
    if (!EMAIL_RE.test(email)) return false;
    if (!ALLOWED_EMAIL_DOMAINS.length) return true;
    const domain = email.split("@")[1].toLowerCase();
    return ALLOWED_EMAIL_DOMAINS.includes(domain);
  }

  // ---- Routes ----

  
// 1) ADD: POST /api/auth/login/precheck
router.post("/login/precheck", async (req, res, next) => {
  try {
    const app = getAppRealm(req); // "backoffice" default
    const { identifier } = req.body || {};
    if (!identifier) return res.status(400).json({ error: "identifier is required" });

    const { user, type } = await findByAlias(identifier);

    if (!user) {
      return res.status(404).json({ error: "Invalid Login ID", code: "UNKNOWN_IDENTIFIER" });
    }

    // HR status gate (reuse your existing “not active” logic)
    if (String(user.status || "").toLowerCase() !== "active") {
      return res.status(403).json({ error: "Account is not active" });
    }

    // Method allowed? (reuse your existing loginMethodAllowed(user,type))
    if (!loginMethodAllowed(user, type)) {
      return res.status(400).json({ error: "This login method is disabled for the account" });
    }

    const roleLower = String(user.role || "").toLowerCase();
    const loginMode = roleLower === "cashier" ? "pin" : "password";

    // For Cashier, tell UI if PIN not set + ticket status flags if you already have them
    // (If you already implemented POS precheck flags, reuse same logic here.)
    const pinNotSet = loginMode === "pin" && !user.pin_hash;

    const lockRow = await readLockRow(db, String(user.employee_id), app);
    const li = lockInfoFromRow(lockRow);

    if (li.permanent) {
      return res.status(423).json({
        error: "Account locked. Please contact an Admin.",
        code: "ACCOUNT_LOCKED_PERMANENT",
      });
    }

    if (li.locked) {
      return res.status(423).json({
        error: "Account temporarily locked",
        code: "ACCOUNT_LOCKED",
        remaining_seconds: Math.ceil(li.msLeft / 1000),
        locked_until: lockRow.lock_until,
      });
    }

    return res.json({
      ok: true,
      role: user.role,
      employeeId: String(user.employee_id),
      loginMode,              // "password" | "pin"
      pinNotSet: !!pinNotSet, // so UI can guide to ticket
      // OPTIONAL if you already have ticket info:
      // ticketExpired, ticketExpiresAt
    });
  } catch (e) {
    next(e);
  }
});

  // POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const app = getAppRealm(req); // "backoffice" | "pos"
    const { identifier, password, pin, remember } = req.body || {};

    const id = String(identifier || "").trim();
    const pw = password != null ? String(password) : "";
    const p = pin != null ? String(pin) : "";

    if (!id) {
      return res.status(400).json({
        error: "identifier is required",
        code: "MISSING_IDENTIFIER",
      });
    }

    const { user, type: aliasType } = await findByAlias(id);

    if (!user) {
      try {
        await logAuthAudit({
          app,
          action: "AUTH_LOGIN_FAILED",
          employeeId: null,
          meta: { reason: "UNKNOWN_IDENTIFIER", identifier: id },
          req,
        });
      } catch {}
      return res.status(404).json({ error: "Invalid Login ID", code: "UNKNOWN_IDENTIFIER" });
    }

    // status gate
    if (String(user.status || "").toLowerCase() !== "active") {
      try {
        await logAuthAudit({
          app,
          action: "AUTH_LOGIN_FAILED",
          employeeId: String(user.employee_id),
          meta: { reason: "INACTIVE_ACCOUNT" },
          req,
        });
      } catch {}
      return res.status(403).json({ error: "Account is not active", code: "ACCOUNT_INACTIVE" });
    }

    const roleLower = String(user.role || "").toLowerCase();
    const isCashier = roleLower === "cashier";
    const isAdmin = roleLower === "admin";

    // ✅ Decide auth secret FIRST (PIN for cashier, password for others)
    const secret = isCashier ? p : pw;

    if (!secret) {
      return res.status(400).json({
        error: isCashier ? "pin is required" : "password is required",
        code: isCashier ? "MISSING_PIN" : "MISSING_PASSWORD",
      });
    }

    // ✅ Enforce required hashes
    if (isCashier && !user.pin_hash) {
      return res.status(400).json({
        error: "PIN is not set. Use Reset Ticket to set a PIN.",
        code: "PIN_NOT_SET",
      });
    }
    if (!isCashier && !user.password_hash) {
      return res.status(400).json({
        error: "This account has no password set. Please ask an Admin to set one.",
        code: "NO_PASSWORD_SET",
      });
    }

    // ✅ Alias login permission (employee_id/username/email) is separate from PIN/PASSWORD
    if (typeof loginMethodAllowed === "function") {
      const okMethod = loginMethodAllowed(user, aliasType);
      if (!okMethod) {
        try {
          await logAuthAudit({
            app,
            action: "AUTH_LOGIN_FAILED",
            employeeId: String(user.employee_id),
            meta: { reason: "LOGIN_METHOD_DISABLED", aliasType },
            req,
          });
        } catch {}
        return res.status(400).json({
          error: "This login method is disabled for the account",
          code: "LOGIN_METHOD_DISABLED",
        });
      }
    }

    // lock gate (per-app lock state)
    const lockRow = await readLockRow(db, String(user.employee_id), app);
    const li = lockInfoFromRow(lockRow);

    if (li.permanent) {
      return res.status(423).json({
        error: "Account locked. Please contact an Admin.",
        code: "ACCOUNT_LOCKED_PERMANENT",
      });
    }
    if (li.locked) {
      return res.status(423).json({
        error: "Account temporarily locked",
        code: "ACCOUNT_LOCKED",
        remaining_seconds: Math.ceil(li.msLeft / 1000),
        locked_until: lockRow.lock_until,
      });
    }

    // verify secret
    const hashToCompare = isCashier ? user.pin_hash : user.password_hash;
    let ok = false;
    try {
      ok = await bcrypt.compare(secret, hashToCompare);
    } catch {
      ok = false;
    }

    if (!ok) {
      // bump lock / failed attempts
      let lockPayload = null;
      if (typeof bumpLockForApp === "function") {
        try {
          lockPayload = await bumpLockForApp({
            employeeId: String(user.employee_id),
            app,
            ip: req.ip,
            ua: req.get("user-agent") || "",
          });
        } catch {
          lockPayload = null;
        }
      }

      if (lockPayload?.permanent) {
        return res.status(423).json({
          error: "Account locked. Please contact an Admin.",
          code: "ACCOUNT_LOCKED_PERMANENT",
        });
      }

      try {
        await logAuthAudit({
          app,
          action: "AUTH_LOGIN_FAILED",
          employeeId: String(user.employee_id),
          meta: {
            reason: isCashier ? "INVALID_PIN" : "INVALID_PASSWORD",
            aliasType,
            locked: !!lockPayload?.locked,
            remaining_seconds: lockPayload?.remaining_seconds,
          },
          req,
        });
      } catch {}

      if (lockPayload?.locked && Number(lockPayload?.remaining_seconds) > 0) {
        return res.status(423).json({
          error: "Account temporarily locked",
          code: "ACCOUNT_LOCKED",
          remaining_seconds: Number(lockPayload.remaining_seconds),
        });
      }

      return res.status(401).json({
        error: isCashier ? "Invalid PIN" : "Invalid Password",
        code: isCashier ? "INVALID_PIN" : "INVALID_PASSWORD",
      });
    }

    // ✅ success path
    if (typeof clearLockForApp === "function") {
      try {
        await clearLockForApp({ employeeId: String(user.employee_id), app });
      } catch {}
    }

    try {
      await logAuthAudit({
        app,
        action: "AUTH_LOGIN_SUCCESS",
        employeeId: String(user.employee_id),
        meta: { aliasType },
        req,
      });
    } catch {}

    const token = issueAuthToken(user);
    setAuthCookie(res, token, { remember: !!remember });

    const clientUser =
      typeof mapUserForClient === "function"
        ? mapUserForClient(user)
        : {
            employeeId: String(user.employee_id),
            role: user.role,
            name: prettyEmployeeName(user),
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            username: user.username || "",
            email: user.email || "",
            status: user.status || "",
          };

    return res.json({ ok: true, token, user: clientUser });
  } catch (e) {
    next(e);
  }
});


// 2.5) ADD: POST /api/auth/pin-reset/verify-ticket
router.post("/pin-reset/verify-ticket", async (req, res, next) => {
  try {
    const { employeeId, ticket } = req.body || {};
    const empId = String(employeeId || "").trim();
    const code = String(ticket || "").trim();

    if (!empId || !code) {
      return res.status(400).json({ error: "employeeId and ticket are required" });
    }
    if (!/^\d{9}$/.test(empId)) {
      return res.status(400).json({ error: "Invalid employeeId" });
    }
    if (!/^\d{8}$/.test(code)) {
      return res.status(400).json({ error: "Ticket code must be 8 digits." });
    }

    // employee must exist + cashier + active
    const empRows = await db.query(
      `SELECT employee_id, role, status
         FROM employees
        WHERE employee_id = ?
        LIMIT 1`,
      [empId]
    );
    const emp = empRows[0];
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    if (String(emp.status || "").toLowerCase() !== "active") {
      return res.status(403).json({ error: "Account is not active" });
    }
    if (String(emp.role || "").toLowerCase() !== "cashier") {
      return res.status(403).json({ error: "Only Cashier accounts can use Reset Ticket" });
    }

    // ✅ ONLY pick a usable ticket (pending + not used + not expired)
    const tRows = await db.query(
      `SELECT id, token_hash, expires_at
         FROM employee_pin_reset_requests
        WHERE employee_id = ?
          AND status = 'pending'
          AND used_at IS NULL
          AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [empId]
    );

    // ✅ If none found, it's either used OR expired OR no ticket exists
    if (!tRows.length) {
      return res.status(400).json({
        error: "Ticket expired or already used. Please ask Admin to issue a new one.",
        code: "TICKET_INVALID",
      });
    }

    const rec = tRows[0];

    // ✅ Verify ticket code matches this usable row
    const ok = await bcrypt.compare(code, rec.token_hash);
    if (!ok) {
      return res.status(400).json({
        error: "Invalid ticket code.",
        code: "TICKET_INVALID",
      });
    }

    return res.json({
      ok: true,
      requestId: rec.id,
      expiresAt: rec.expires_at || null,
    });
  } catch (e) {
    next(e);
  }
});


// 3) ADD: POST /api/auth/pin-reset/confirm  (used by Backoffice Forgot PIN Ticket screen)
// NOTE: This is the minimal endpoint signature the new LoginPage expects.
// Replace the problematic /pin-reset/confirm endpoint with this:
router.post("/pin-reset/confirm", async (req, res, next) => {
  let conn = null;
  try {
    const { employeeId, ticket, newPin, requestId } = req.body || {};
    const empId = String(employeeId || "").trim();
    const code = String(ticket || "").trim();
    const pin = String(newPin || "").trim();

    if (!empId || !code || !pin) {
      return res.status(400).json({ error: "employeeId, ticket, and newPin are required" });
    }
    if (!/^\d{9}$/.test(empId)) return res.status(400).json({ error: "Invalid employeeId" });
    if (!/^\d{8}$/.test(code)) return res.status(400).json({ error: "Ticket code must be 8 digits." });
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: "PIN must be 6 digits." });

    const reqId = String(requestId || "").trim();
    if (!reqId) {
      return res.status(400).json({ error: "requestId is required" });
    }

    // Check if db.pool exists (from your mysql.js structure)
    if (!db.pool || typeof db.pool.getConnection !== "function") {
      console.error("[pin-reset/confirm] db.pool.getConnection not available");
      return res.status(500).json({ error: "Database connection not available" });
    }

    // Start transaction using db.pool
    conn = await db.pool.getConnection();
    await conn.beginTransaction();

    // 1. Check employee
    const [empRows] = await conn.query(
      `SELECT employee_id, role, status FROM employees WHERE employee_id = ? LIMIT 1 FOR UPDATE`,
      [empId]
    );
    const emp = empRows[0];
    if (!emp) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: "Employee not found" });
    }
    if (String(emp.status || "").toLowerCase() !== "active") {
      await conn.rollback();
      conn.release();
      return res.status(403).json({ error: "Account is not active" });
    }
    if (String(emp.role || "").toLowerCase() !== "cashier") {
      await conn.rollback();
      conn.release();
      return res.status(403).json({ error: "Only Cashier accounts can reset PIN" });
    }

    // 2. Check ticket WITH FOR UPDATE to lock the row
    const [tRows] = await conn.query(
      `SELECT id, token_hash, expires_at
        FROM employee_pin_reset_requests
        WHERE id = ?
          AND employee_id = ?
          AND status = 'pending'
          AND used_at IS NULL
        LIMIT 1 FOR UPDATE`,
      [reqId, empId]
    );

    if (!tRows.length) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ 
        error: "Ticket expired or already used. Please ask Admin to issue a new one.",
        code: "TICKET_INVALID"
      });
    }

    const rec = tRows[0];

    // 3. Check expiry
    if (rec.expires_at && new Date(rec.expires_at) < new Date()) {
      // Mark as expired
      await conn.query(
        `UPDATE employee_pin_reset_requests SET status='expired' WHERE id=?`,
        [rec.id]
      );
      await conn.commit();
      conn.release();
      return res.status(400).json({ 
        error: "Ticket expired or already used. Please ask Admin to issue a new one.",
        code: "TICKET_EXPIRED"
      });
    }

    // 4. Verify ticket code
    const okTicket = await bcrypt.compare(code, rec.token_hash);
    if (!okTicket) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ 
        error: "Invalid ticket code.",
        code: "TICKET_INVALID"
      });
    }

    // 5. Hash new PIN
    const newHash = await bcrypt.hash(pin, 12);

    // 6. Update employee PIN
    await conn.query(
      `UPDATE employees SET pin_hash=? WHERE employee_id=?`,
      [newHash, empId]
    );

    // 7. Mark ticket as used
    await conn.query(
      `UPDATE employee_pin_reset_requests
       SET status='used', used_at=UTC_TIMESTAMP()
       WHERE id=?`,
      [rec.id]
    );

    // 8. Commit transaction
    await conn.commit();
    conn.release();

    // Audit log
    try {
      await logAuditLogin({
        employeeName: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || empId,
        role: emp.role || 'Cashier',
        action: "Auth - PIN Reset via Ticket",
        detail: {
          statusMessage: "PIN reset successfully via ticket",
          actionDetails: {
            actionType: "pin_reset",
            step: "confirm",
            result: "success",
          },
          affectedData: {
            statusChange: "PIN_RESET_SUCCESS",
            items: [],
          },
          meta: { 
            app: "backoffice",
            employeeId: empId,
            requestId: reqId 
          },
        },
      });
    } catch (auditErr) {
      console.error("[audit] PIN reset audit failed:", auditErr?.message);
    }

    return res.json({ 
      ok: true,
      message: "PIN reset successfully"
    });

  } catch (e) {
    // Clean up connection if it exists
    if (conn) {
      try { await conn.rollback(); } catch {}
      try { conn.release(); } catch {}
    }
    
    const status = e?.status || 500;
    if (status !== 500) {
      return res.status(status).json({ 
        error: e.message || "PIN reset failed",
        code: e.code || "RESET_FAILED"
      });
    }
    next(e);
  }
});

  // GET /api/auth/me?soft=1
  router.get("/me", (req, res) => {
    const soft =
      req.query.soft === "1" ||
      String(req.get("x-auth-optional") || "").toLowerCase() === "1";

    const auth = req.headers.authorization || "";
    const bearer = auth.startsWith("Bearer ")
      ? auth.slice(7)
      : null;
    const token = bearer || req.cookies?.qd_token || null;

    if (!token) {
      return soft
        ? res.json({ ok: true, authenticated: false, user: null })
        : res.status(401).json({ error: "No token" });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return res.json({
        ok: true,
        authenticated: true,
        user: payload,
        token,
      });
    } catch {
      return soft
        ? res.json({ ok: true, authenticated: false, user: null })
        : res.status(401).json({ error: "Invalid token" });
    }
  });

  // POST /api/auth/logout
  router.post("/logout", async (req, res) => {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.ip ||
      "";
    const ua = String(req.headers["user-agent"] || "").slice(0, 255);

    // Same token logic as /me
    const auth = req.headers.authorization || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const token = bearer || req.cookies?.qd_token || null;

    let payload = null;
    try {
      if (token) payload = jwt.verify(token, JWT_SECRET);
    } catch {
      payload = null;
    }

    const app = getAppRealm(req); // "backoffice" by default

    // ✅ NO LOGOUT UNTIL REMIT (only when authenticated)
    if (payload?.employeeId) {
      const employeeId = String(payload.employeeId);

      // optional terminal filter (supports query/body)
      const terminalIdRaw =
        String(req.query?.terminal_id || req.body?.terminal_id || "").trim();
      const terminalId = terminalIdRaw ? terminalIdRaw : null;

      try {
        // Block if there's ANY open shift for this employee
        // (and if terminal_id provided, also ensure it matches that terminal)
        const rows = await db.query(
          `
          SELECT shift_id, terminal_id, employee_id, opened_at
            FROM pos_shifts
          WHERE status = 'Open'
            AND employee_id = ?
            ${terminalId ? "AND terminal_id = ?" : ""}
          ORDER BY opened_at DESC, shift_id DESC
          LIMIT 1
          `,
          terminalId ? [employeeId, terminalId] : [employeeId]
        );

        if (rows && rows.length > 0) {
          const sh = rows[0];

          // Audit (optional)
          await logAuditLogin({
            employeeName:
              payload.name ||
              payload.username ||
              payload.email ||
              payload.employeeId ||
              "Unknown",
            role: payload.role,
            action: "Auth - Logout Blocked (Open Shift)",
            detail: {
              statusMessage: "Logout blocked because a shift is still open.",
              actionDetails: {
                actionType: "logout",
                app,
                result: "blocked_open_shift",
              },
              affectedData: {
                statusChange: "LOGOUT_BLOCKED_OPEN_SHIFT",
                shift: {
                  shift_id: sh.shift_id,
                  terminal_id: sh.terminal_id,
                  opened_at: sh.opened_at,
                },
              },
              meta: { ip, userAgent: ua, app },
            },
          }).catch(() => {});

          return res.status(409).json({
            ok: false,
            code: "NO_LOGOUT_UNTIL_REMIT",
            error: "Cannot logout while there is a running shift. Please end shift first.",
            shift: {
              shift_id: sh.shift_id,
              terminal_id: sh.terminal_id,
              opened_at: sh.opened_at,
            },
          });
        }
      } catch (e) {
        console.error("[auth/logout] open shift check failed:", e?.message || e);
        // fail-safe: if we can't verify, block logout (safer than allowing)
        return res.status(409).json({
          ok: false,
          code: "NO_LOGOUT_UNTIL_REMIT",
          error:
            "Cannot logout right now because shift status could not be verified. Please go to Shift Management.",
        });
      }
    }

    // If we have a decoded token, log logout event
    if (payload) {
      const employeeName =
        payload.name ||
        payload.username ||
        payload.email ||
        payload.employeeId ||
        "Unknown";

      logAuditLogin({
        employeeName,
        role: payload.role,
        action: "Auth - Logout",
        detail: {
          statusMessage: "User signed out.",
          actionDetails: {
            actionType: "logout",
            app,
            result: "ok",
          },
          affectedData: {
            statusChange: AUTH_STATUS.LOGOUT_OK,
            items: [],
          },
          meta: { ip, userAgent: ua, app },
        },
      }).catch(() => {});
    }

    // Clear cookie and return ok
    res.clearCookie("qd_token", { path: "/" });
    return res.json({ ok: true });
  });

  // POST /api/auth/forgot/start (Email OTP - start)
  router.post("/forgot/start", async (req, res, next) => {
    try {
      const email = lower(req.body?.email);
      const verifyType = req.body?.verifyType;
      const verifyValue = String(req.body?.verifyValue || "").trim();
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 255);

      const app = getAppRealm(req);

      if (!email) {
        await logAuditLogin({
          employeeName: "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Start Failed)",
          detail: {
            statusMessage: "Email is required.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "start",
              email,
              app,
              result: "missing_email",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res.status(400).json({ error: "Email is required" });
      }
      if (!isEmailAllowed(email)) {
        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Start Failed)",
          detail: {
            statusMessage: "Email is not allowed.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "start",
              email,
              app,
              result: "email_not_allowed",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(400)
          .json({ error: "Enter a valid email address." });
      }

      const emp = await findByEmail(email);
      if (!emp) {
        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Start Failed)",
          detail: {
            statusMessage: "That email is not registered.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "start",
              email,
              app,
              result: "email_not_registered",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(404)
          .json({ error: "That email is not registered." });
      }

      // Optional extra verification
      const okExtra =
        !verifyType ||
        !verifyValue ||
        (verifyType === "employeeId" &&
          String(emp.employee_id) === verifyValue) ||
        (verifyType === "username" &&
          lower(emp.username) === lower(verifyValue));
      if (!okExtra) {
        await logAuditLogin({
          employeeName: prettyEmployeeName(emp),
          role: emp.role,
          action: "Auth - Forgot Password (Email OTP Start Failed)",
          detail: {
            statusMessage: "Extra verification failed.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "start",
              email,
              app,
              verifyType,
              result: "extra_verification_failed",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(400)
          .json({
            error:
              "We couldn't verify your details. Please try again.",
          });
      }

      // Use shared, race-safe creator (UTC inside)
      const r = await safeCreateEmailOtp({
        db,
        emailLower: email,
        employeeId: emp.employee_id,
        ttlSec: OTP_TTL_SEC,
      });

      // Cooldown already active?
      if (!r.ok) {
        if (r.reason === "cooldown_active") {
          await logAuditLogin({
            employeeName: prettyEmployeeName(emp),
            role: emp.role,
            action: "Auth - Forgot Password (Email OTP Cooldown)",
            detail: {
              statusMessage:
                "OTP request blocked by active cooldown.",
              actionDetails: {
                actionType: "password_reset_otp",
                step: "start",
                email,
                app,
                result: "cooldown_active",
              },
              affectedData: {
                statusChange: AUTH_STATUS.OTP_COOLDOWN_ACTIVE,
                items: [],
              },
              meta: {
                ip,
                userAgent: ua,
                app,
                expiresAt: r.expiresAt ?? null,
              },
            },
          });

          return res.status(429).json({
            error:
              "A verification code is already active. Please wait 10 minutes before requesting another.",
            expiresAt: r.expiresAt ?? null,
          });
        }

        await logAuditLogin({
          employeeName: prettyEmployeeName(emp),
          role: emp.role,
          action: "Auth - Forgot Password (Email OTP Start Failed)",
          detail: {
            statusMessage: "Unable to start verification.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "start",
              email,
              app,
              result: "server_error",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(500)
          .json({ error: "Unable to start verification" });
      }

      // Send the code via your existing mailer
      try {
        await sendOtpEmail(email, r.code, {
          appName: "Quscina",
          expiresMinutes: Math.ceil(OTP_TTL_SEC / 60),
        });
      } catch (mailErr) {
        console.error(
          "[forgot/start] email send failed:",
          mailErr?.message || mailErr
        );
        // (optional) you can still return 200 since OTP row exists
      }

      await logAuditLogin({
        employeeName: prettyEmployeeName(emp),
        role: emp.role,
        action: "Auth - Forgot Password (Email OTP Started)",
        detail: {
          statusMessage: "OTP email issued for password reset.",
          actionDetails: {
            actionType: "password_reset_otp",
            step: "start",
            email,
            app,
            result: "otp_sent",
          },
          affectedData: {
            statusChange: AUTH_STATUS.OTP_EMAIL_SENT,
            items: [],
          },
          meta: { ip, userAgent: ua, app, expiresAt: r.expiresAt },
        },
      });

      // Also return expiresAt for the silent cooldown UI
      return res.json({ ok: true, expiresAt: r.expiresAt });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/forgot/resend (Email OTP - resend)
  router.post("/forgot/resend", async (req, res, next) => {
    try {
      const email = lower(req.body?.email);
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 255);

      const app = getAppRealm(req);

      if (!email) {
        await logAuditLogin({
          employeeName: "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Resend Failed)",
          detail: {
            statusMessage: "Email is required.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "resend",
              email,
              app,
              result: "missing_email",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res.status(400).json({ error: "Email is required" });
      }
      if (!isEmailAllowed(email)) {
        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Resend Failed)",
          detail: {
            statusMessage: "Email is not allowed.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "resend",
              email,
              app,
              result: "email_not_allowed",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(400)
          .json({ error: "Enter a valid email address." });
      }

      const emp = await findByEmail(email);
      if (!emp) {
        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Resend Failed)",
          detail: {
            statusMessage: "That email is not registered.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "resend",
              email,
              app,
              result: "email_not_registered",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(404)
          .json({ error: "That email is not registered." });
      }

      const r = await safeCreateEmailOtp({
        db,
        emailLower: email,
        employeeId: emp.employee_id,
        ttlSec: OTP_TTL_SEC,
      });

      if (!r.ok) {
        if (r.reason === "cooldown_active") {
          await logAuditLogin({
            employeeName: prettyEmployeeName(emp),
            role: emp.role,
            action:
              "Auth - Forgot Password (Email OTP Resend Cooldown)",
            detail: {
              statusMessage:
                "Resend blocked by active cooldown.",
              actionDetails: {
                actionType: "password_reset_otp",
                step: "resend",
                email,
                app,
                result: "cooldown_active",
              },
              affectedData: {
                statusChange: AUTH_STATUS.OTP_COOLDOWN_ACTIVE,
                items: [],
              },
              meta: {
                ip,
                userAgent: ua,
                app,
                expiresAt: r.expiresAt ?? null,
              },
            },
          });
          return res.status(429).json({
            error:
              "A verification code is already active. Please wait 10 minutes before requesting another.",
            expiresAt: r.expiresAt ?? null,
          });
        }

        await logAuditLogin({
          employeeName: prettyEmployeeName(emp),
          role: emp.role,
          action: "Auth - Forgot Password (Email OTP Resend Failed)",
          detail: {
            statusMessage: "Unable to resend code.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "resend",
              email,
              app,
              result: "server_error",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(500)
          .json({ error: "Unable to resend code" });
      }

      try {
        await sendOtpEmail(email, r.code, {
          appName: "Quscina",
          expiresMinutes: Math.ceil(OTP_TTL_SEC / 60),
        });
      } catch (mailErr) {
        console.error(
          "[forgot/resend] email send failed:",
          mailErr?.message || mailErr
        );
      }

      await logAuditLogin({
        employeeName: prettyEmployeeName(emp),
        role: emp.role,
        action: "Auth - Forgot Password (Email OTP Resent)",
        detail: {
          statusMessage: "A new OTP email was sent.",
          actionDetails: {
            actionType: "password_reset_otp",
            step: "resend",
            email,
            app,
            result: "otp_resent",
          },
          affectedData: {
            statusChange: AUTH_STATUS.OTP_EMAIL_RESENT,
            items: [],
          },
          meta: { ip, userAgent: ua, app, expiresAt: r.expiresAt },
        },
      });

      return res.json({ ok: true, expiresAt: r.expiresAt });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/forgot/verify (Email OTP - verify)
  router.post("/forgot/verify", async (req, res, next) => {
    try {
      const email = lower(req.body?.email);
      const code = String(req.body?.code || "").trim();

      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 255);

      const app = getAppRealm(req);

      let emp = null;
      if (email) {
        try {
          emp = await findByEmail(email);
        } catch {}
      }
      const employeeNameForLog =
        emp ? prettyEmployeeName(emp) : email || "Unknown";
      const roleForLog = emp?.role || "—";

      // 1) missing email/code
      if (!email || !code) {
        await logAuditLogin({
          employeeName: employeeNameForLog,
          role: roleForLog,
          action: "Auth - Forgot Password (Email OTP Verify Failed)",
          detail: {
            statusMessage: "Email and code are required.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              app,
              result: "missing_email_or_code",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(400)
          .json({ error: "Email and code are required" });
      }

      // 2) fetch latest *pending* OTP
      const rec = await getLatestPendingOtp(email, { db });

      if (!rec) {
        // No pending OTP at all (either never requested or already expired/used)
        await logAuditLogin({
          employeeName: employeeNameForLog,
          role: roleForLog,
          action: "Auth - Forgot Password (Email OTP Verify Failed)",
          detail: {
            statusMessage: "Invalid or expired code.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              app,
              result: "no_otp_record",
            },
            affectedData: {
              statusChange: AUTH_STATUS.OTP_INVALID_OR_EXPIRED,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });

        return res.status(400).json({
          error:
            "We couldn't find an active verification code. Please request a new one.",
          code: "OTP_NOT_FOUND",
        });
      }

      // NOTE: rec.data.status is assumed to be "pending" here because
      // getLatestPendingOtp filters by status, so we don't need a status switch.

      // 3) expired?
      if (Date.now() > new Date(rec.data.expiresAt).getTime()) {
        await db.query(
          `UPDATE otp SET status='expired', expired_at=UTC_TIMESTAMP() WHERE id=?`,
          [rec.id]
        );

        await logAuditLogin({
          employeeName: employeeNameForLog,
          role: roleForLog,
          action: "Auth - Forgot Password (Email OTP Expired)",
          detail: {
            statusMessage: "OTP has expired.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              app,
              result: "expired",
            },
            affectedData: {
              statusChange: AUTH_STATUS.OTP_EXPIRED,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });

        return res.status(400).json({
          error:
            "This verification code has expired. Please request a new one.",
          code: "OTP_EXPIRED",
        });
      }

      // 4) too many attempts → always show the same lock message
      const attempts = Number(rec.data.attempts || 0);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await logAuditLogin({
          employeeName: employeeNameForLog,
          role: roleForLog,
          action: "Auth - Forgot Password (Email OTP Blocked)",
          detail: {
            statusMessage: "Too many OTP attempts.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              app,
              result: "blocked_existing",
            },
            affectedData: {
              statusChange: AUTH_STATUS.OTP_BLOCKED,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });

        return res.status(400).json({
          error:
            "Too many incorrect codes. Please wait 10 minutes and request a new verification code.",
          code: "OTP_BLOCKED",
        });
      }

      // 5) wrong code
      const ok = await bcrypt.compare(code, rec.data.codeHash);
      if (!ok) {
        await db.query(
          `UPDATE otp
             SET attempts = attempts + 1,
                 last_attempt_at = UTC_TIMESTAMP()
           WHERE id = ?`,
          [rec.id]
        );

        await logAuditLogin({
          employeeName: employeeNameForLog,
          role: roleForLog,
          action: "Auth - Forgot Password (Email OTP Verify Failed)",
          detail: {
            statusMessage: "Invalid OTP code.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              app,
              result: "invalid_code",
            },
            affectedData: {
              statusChange: AUTH_STATUS.OTP_INVALID_OR_EXPIRED,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });

        return res.status(400).json({
          error: "Invalid verification code.",
          code: "OTP_INVALID",
        });
      }

      // 6) correct code
      await db.query(
        `UPDATE otp SET status='used', used_at=UTC_TIMESTAMP() WHERE id=?`,
        [rec.id]
      );

      const resetToken = jwt.sign(
        {
          purpose: "password-reset",
          employeeId: emp ? emp.employee_id : null,
          emailLower: email,
        },
        RESET_JWT_SECRET,
        { expiresIn: RESET_TOKEN_TTL }
      );

      await logAuditLogin({
        employeeName: employeeNameForLog,
        role: roleForLog,
        action: "Auth - Forgot Password (Email OTP Verified)",
        detail: {
          statusMessage: "OTP verified. Reset token issued.",
          actionDetails: {
            actionType: "password_reset_otp",
            step: "verify",
            email,
            app,
            result: "otp_verified",
          },
          affectedData: {
            statusChange: AUTH_STATUS.OTP_VERIFIED_RESET_ALLOWED,
            items: [],
          },
          meta: { ip, userAgent: ua, app },
        },
      });

      return res.json({ ok: true, resetToken });
    } catch (e) {
      next(e);
    }
  });

  // -------------------- Security Question (single) --------------------
  const SQ_CATALOG = {
    pet: "What is the name of your first pet?",
    school: "What is the name of your elementary school?",
    city: "In what city were you born?",
    mother_maiden: "What is your mother’s maiden name?",
    nickname: "What was your childhood nickname?",
  };
  const norm = (s) => String(s || "").trim().toLowerCase();

  // POST /api/auth/forgot/sq/start
  router.post("/forgot/sq/start", async (req, res, next) => {
    try {
      const identifier = String(req.body?.identifier || "").trim();
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 255);

      const app = getAppRealm(req);

      if (!identifier) {
        await logAuditLogin({
          employeeName: "Unknown",
          role: "—",
          action: "Auth - Forgot Password (SQ Start Failed)",
          detail: {
            statusMessage: "identifier is required.",
            actionDetails: {
              actionType: "password_reset_sq",
              step: "start",
              identifier,
              app,
              result: "missing_identifier",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(400)
          .json({ error: "identifier is required" });
      }

      const { user } = await findByAlias(identifier);
      if (!user) {
        await logAuditLogin({
          employeeName: identifier || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (SQ Start Failed)",
          detail: {
            statusMessage: "Account not found for identifier.",
            actionDetails: {
              actionType: "password_reset_sq",
              step: "start",
              identifier,
              app,
              result: "account_not_found",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res.status(404).json({ error: "Account not found" });
      }

      // still allow any question id from catalog; UI will enforce “only one configured”
      const allowedIds = Object.keys(SQ_CATALOG);
      const sqToken = jwt.sign(
        {
          purpose: "security-questions",
          employeeId: user.employee_id,
          allowedIds,
        },
        RESET_JWT_SECRET,
        { expiresIn: SQ_TOKEN_TTL }
      );

      await logAuditLogin({
        employeeName: prettyEmployeeName(user),
        role: user.role,
        action: "Auth - Forgot Password (SQ Start)",
        detail: {
          statusMessage: "Security question flow started.",
          actionDetails: {
            actionType: "password_reset_sq",
            step: "start",
            identifier,
            app,
            result: "sq_started",
          },
          affectedData: {
            statusChange: AUTH_STATUS.SQ_FLOW_STARTED,
            items: [],
          },
          meta: { ip, userAgent: ua, app },
        },
      });

      res.json({ ok: true, sqToken });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/forgot/sq/verify
  router.post("/forgot/sq/verify", async (req, res, next) => {
    try {
      const { sqToken, answers } = req.body || {};
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 255);

      const app = getAppRealm(req);

      const sqApp = `${app}_sq`;

      // 🔒 Single-question flow: must be exactly one answer
      if (!sqToken || !Array.isArray(answers) || answers.length !== 1) {
        return res.status(400).json({
          error: "The details you entered don’t match our records.",
        });
      }

      let payload;
      try {
        payload = jwt.verify(sqToken, RESET_JWT_SECRET);
      } catch {
        return res.status(400).json({
          error: "The details you entered don’t match our records.",
        });
      }
      if (payload?.purpose !== "security-questions") {
        return res.status(400).json({
          error: "The details you entered don’t match our records.",
        });
      }

      const employeeId = payload.employeeId;
      const allowedIds = Array.isArray(payload.allowedIds)
        ? payload.allowedIds
        : [];
      if (!employeeId || !allowedIds.length) {
        return res.status(400).json({
          error: "The details you entered don’t match our records.",
        });
      }

      // 🔒 1) Check if this employee/app is already locked (reuse employee_lock_state)
      const lockRow = await readLockRow(db, employeeId, sqApp);
      const { locked, msLeft, permanent } = lockInfoFromRow(lockRow);

      if (permanent) {
        return res.status(423).json({
          error: "Account locked. Please contact an Admin.",
        });
      }
      if (locked) {
        return res.status(423).json({
          error:
            "Too many incorrect answers. Please wait 15 minutes before trying again.",
          remaining_seconds: Math.ceil(msLeft / 1000),
        });
      }

      const { id, answer } = answers[0] || {};
      if (!id || typeof answer !== "string" || !allowedIds.includes(id)) {
        // malformed / unexpected – treat as generic failure (no lock bump, no info)
        return res.status(400).json({
          error: "The details you entered don’t match our records.",
        });
      }

      const rows = await db.query(
        `SELECT answer_hash FROM employee_security_questions
           WHERE employee_id = ? AND question_id = ? LIMIT 1`,
        [employeeId, id]
      );
      if (!rows.length) {
        // No stored answer; generic failure
        return res.status(400).json({
          error: "The details you entered don’t match our records.",
        });
      }

      const ok = await bcrypt.compare(norm(answer), rows[0].answer_hash);
      if (!ok) {
        // ❌ Wrong answer → bump lock counter in employee_lock_state
        await db.query(
          `INSERT INTO employee_lock_state
              (employee_id, app, failed_login_count, lock_until, permanent_lock, last_failed_login)
           VALUES (?, ?, 1, NULL, 0, UTC_TIMESTAMP())
           ON DUPLICATE KEY UPDATE
             failed_login_count = failed_login_count + 1,
             last_failed_login  = UTC_TIMESTAMP(),
             lock_until = CASE
               WHEN failed_login_count + 1 = 5 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
               ELSE lock_until
             END,
             permanent_lock = CASE
               WHEN failed_login_count + 1 >= ? THEN 1
               ELSE permanent_lock
             END`,
          [
            employeeId,
            sqApp,
            LOCK_POLICY.step5_minutes,   // 15 minutes on 5th failed answer
            LOCK_POLICY.permanent_on,    // 6th+ => permanent lock
          ]
        );

        const fresh = await readLockRow(db, employeeId, sqApp);
        const {
          locked: nowLocked,
          msLeft: nowLeft,
          permanent: nowPerm,
        } = lockInfoFromRow(fresh);

        if (nowPerm) {
          return res.status(423).json({
            error: "Account locked. Please contact an Admin.",
          });
        }
        if (nowLocked) {
          return res.status(423).json({
            error:
              "Too many incorrect answers. Please wait 15 minutes before trying again.",
            remaining_seconds: Math.ceil(nowLeft / 1000),
          });
        }

        // Still under the lock threshold → generic error
        return res.status(400).json({
          error: "The details you entered don’t match our records.",
        });
      }

      // ✅ Correct answer → issue reset token and clear lock state for this app
      await db.query(
        `UPDATE employee_lock_state
            SET failed_login_count = 0,
                lock_until = NULL,
                permanent_lock = 0,
                last_failed_login = NULL
          WHERE employee_id = ? AND app = ?`,
        [employeeId, sqApp]
      );

      const resetToken = jwt.sign(
        { purpose: "password-reset", employeeId },
        RESET_JWT_SECRET,
        { expiresIn: RESET_TOKEN_TTL }
      );

      // fetch employee for audit
      const empRows = await db.query(
        `SELECT * FROM employees WHERE employee_id = ? LIMIT 1`,
        [employeeId]
      );
      const empAud = empRows[0] || null;

      await logAuditLogin({
        employeeName: empAud ? prettyEmployeeName(empAud) : String(employeeId),
        role: empAud?.role,
        action: "Auth - Forgot Password (SQ Verified)",
        detail: {
          statusMessage:
            "Security question verified. Reset token issued.",
          actionDetails: {
            actionType: "password_reset_sq",
            step: "verify",
            questionId: id,
            app,
            result: "sq_verified",
          },
          affectedData: {
            statusChange: AUTH_STATUS.SQ_VERIFIED_RESET_ALLOWED,
            items: [],
          },
          meta: { ip, userAgent: ua, app },
        },
      });

      res.json({ ok: true, resetToken });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/forgot/reset
  router.post("/forgot/reset", async (req, res, next) => {
    try {
      const { resetToken, newPassword } = req.body || {};
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 255);

      const app = getAppRealm(req);  

      if (!resetToken || !newPassword) {
        return res.status(400).json({
          error: "resetToken and newPassword are required",
        });
      }

      let payload;
      try {
        payload = jwt.verify(resetToken, RESET_JWT_SECRET);
      } catch {
        await logAuditLogin({
          employeeName: "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Reset Failed)",
          detail: {
            statusMessage: "Invalid or expired reset token.",
            actionDetails: {
              actionType: "password_reset",
              step: "reset",
              app,
              result: "invalid_token",
            },
            affectedData: {
              statusChange: AUTH_STATUS.PASSWORD_RESET_FAILED,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(400)
          .json({ error: "Invalid or expired reset token" });
      }

      if (payload?.purpose !== "password-reset") {
        await logAuditLogin({
          employeeName: "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Reset Failed)",
          detail: {
            statusMessage: "Invalid reset token purpose.",
            actionDetails: {
              actionType: "password_reset",
              step: "reset",
              app,
              result: "invalid_purpose",
            },
            affectedData: {
              statusChange: AUTH_STATUS.PASSWORD_RESET_FAILED,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(400)
          .json({ error: "Invalid reset token" });
      }

      // Resolve employee
      let emp = null;
      if (payload.employeeId) {
        const rows = await db.query(
          `SELECT * FROM employees WHERE employee_id = ? LIMIT 1`,
          [payload.employeeId]
        );
        emp = rows[0] || null;
      }
      if (!emp && payload.emailLower) {
        emp = await findByEmail(payload.emailLower);
      }
      if (!emp) {
        await logAuditLogin({
          employeeName: "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Reset Failed)",
          detail: {
            statusMessage:
              "Unable to resolve employee from reset token.",
            actionDetails: {
              actionType: "password_reset",
              step: "reset",
              app,
              result: "employee_not_found",
            },
            affectedData: {
              statusChange: AUTH_STATUS.PASSWORD_RESET_FAILED,
              items: [],
            },
            meta: { ip, userAgent: ua, app },
          },
        });
        return res
          .status(400)
          .json({ error: "Unable to reset password" });
      }

      const hashed = await bcrypt.hash(String(newPassword), 12);
      await db.query(
        `UPDATE employees SET password_hash = ?, password_last_changed = NOW() WHERE employee_id = ?`,
        [hashed, emp.employee_id]
      );

      if (DEBUG)
        console.log(
          "[forgot/reset] password updated for",
          emp.employee_id
        );

      await logAuditLogin({
        employeeName: prettyEmployeeName(emp),
        role: emp.role,
        action: "Auth - Password Reset Success",
        detail: {
          statusMessage:
            "Password updated via forgot-password flow.",
          actionDetails: {
            actionType: "password_reset",
            step: "reset",
            app,
            method: payload.emailLower
              ? "email_otp_or_email"
              : "security_questions_or_unknown",
            result: "password_updated",
          },
          affectedData: {
            statusChange: AUTH_STATUS.PASSWORD_RESET_SUCCESS,
            items: [],
          },
          meta: { ip, userAgent: ua, app },
        },
      });

      res.json({ ok: true, message: "Password updated" });
    } catch (e) {
      next(e);
    }
  });

  return router;
};