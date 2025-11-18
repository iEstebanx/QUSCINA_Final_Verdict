// Backend/src/auth/auth.js
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

  const LOCK_POLICY = {
    step4_minutes: 5,
    step5_minutes: 15,
    permanent_on: 6, // the attempt index that triggers permanent
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

  // POST /api/auth/login
  router.post("/login", async (req, res, next) => {
    try {
      const app = getAppRealm(req); // "backoffice" (default) or "pos" if you ever pass it
      const { identifier, password, remember } = req.body || {};
      if (!identifier || !password) {
        return res
          .status(400)
          .json({ error: "identifier and password are required" });
      }

      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 255);
      const identLower = String(identifier).trim().toLowerCase();

      const { user, type } = await findByAlias(identifier);

      // No account found → generic error + audit (avoid username enumeration)
      if (!user) {
        await db.query(
          `INSERT INTO login_attempts (employee_id, app, identifier, success, reason, ip, user_agent)
          VALUES (NULL, ?, ?, 0, 'no_account', ?, ?)`,
          [app, identLower, ip, ua]
        );

        await logAuditLogin({
          employeeName: "Unknown",
          role: "—",
          action: "Auth - Login Attempt (Unknown ID)",
          detail: {
            statusMessage: "Invalid Login ID.",
            actionDetails: {
              actionType: "login",
              app,
              loginType: type, // employee_id / username / email
              identifier: identLower,
              result: "unknown_identifier",
            },
            affectedData: {
              statusChange: AUTH_STATUS.LOGIN_UNKNOWN_IDENTIFIER,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });

        return res
          .status(404)
          .json({ error: "Invalid Login ID", code: "UNKNOWN_IDENTIFIER" });
      }

      // HR status
      if (String(user.status || "").toLowerCase() !== "active") {
        await db.query(
          `INSERT INTO login_attempts (employee_id, app, identifier, success, reason, ip, user_agent)
          VALUES (?, ?, ?, 0, 'not_active', ?, ?)`,
          [user.employee_id, app, identLower, ip, ua]
        );

        await logAuditLogin({
          employeeName: prettyEmployeeName(user),
          role: user.role,
          action: "Auth - Login Blocked (Not Active)",
          detail: {
            statusMessage: "Account is not active.",
            actionDetails: {
              actionType: "login",
              app,
              loginType: type,
              identifier: identLower,
              result: "not_active",
            },
            affectedData: {
              statusChange: AUTH_STATUS.LOGIN_ACCOUNT_NOT_ACTIVE,
              items: [],
              hrStatus: user.status || "unknown",
            },
            meta: { ip, userAgent: ua },
          },
        });

        return res
          .status(403)
          .json({ error: "Account is not active" });
      }

      // 🔒 Per-app lock check (employee_lock_state)
      const lockRow = await readLockRow(db, user.employee_id, app);
      const { locked, msLeft, permanent } = lockInfoFromRow(lockRow);

      if (permanent) {
        await db.query(
          `INSERT INTO login_attempts (employee_id, app, identifier, success, reason, ip, user_agent)
          VALUES (?, ?, ?, 0, 'perm_locked', ?, ?)`,
          [user.employee_id, app, identLower, ip, ua]
        );

        await logAuditLogin({
          employeeName: prettyEmployeeName(user),
          role: user.role,
          action: "Auth - Login Blocked (Permanent Lock)",
          detail: {
            statusMessage: "Account is permanently locked.",
            actionDetails: {
              actionType: "login",
              app,
              loginType: type,
              identifier: identLower,
              result: "perm_locked",
            },
            affectedData: {
              statusChange: AUTH_STATUS.LOGIN_LOCK_PERMA,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });

        return res
          .status(423)
          .json({
            error:
              "Account locked. Please contact an Admin or Manager.",
          });
      }

      if (locked) {
        const sec = Math.ceil(msLeft / 1000);
        await db.query(
          `INSERT INTO login_attempts (employee_id, app, identifier, success, reason, ip, user_agent)
          VALUES (?, ?, ?, 0, 'locked', ?, ?)`,
          [user.employee_id, app, identLower, ip, ua]
        );

        await logAuditLogin({
          employeeName: prettyEmployeeName(user),
          role: user.role,
          action: "Auth - Login Blocked (Temporary Lock)",
          detail: {
            statusMessage:
              "Account temporarily locked due to repeated failed attempts.",
            actionDetails: {
              actionType: "login",
              app,
              loginType: type,
              identifier: identLower,
              result: "locked",
            },
            affectedData: {
              statusChange: AUTH_STATUS.LOGIN_LOCK_TEMP,
              lockSeconds: sec,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });

        return res.status(423).json({
          error:
            "Account temporarily locked. Please wait before trying again.",
          remaining_seconds: sec,
        });
      }

      // Method allowed?
      if (!loginMethodAllowed(user, type)) {
        await db.query(
          `INSERT INTO login_attempts (employee_id, app, identifier, success, reason, ip, user_agent)
          VALUES (?, ?, ?, 0, 'method_disabled', ?, ?)`,
          [user.employee_id, app, identLower, ip, ua]
        );

        await logAuditLogin({
          employeeName: prettyEmployeeName(user),
          role: user.role,
          action: "Auth - Login Blocked (Method Disabled)",
          detail: {
            statusMessage:
              "Login method is disabled for this account.",
            actionDetails: {
              actionType: "login",
              app,
              loginType: type,
              identifier: identLower,
              result: "method_disabled",
            },
            affectedData: {
              statusChange: AUTH_STATUS.LOGIN_METHOD_DISABLED,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });

        return res
          .status(400)
          .json({
            error: "This login method is disabled for the account",
          });
      }

      // Password check
      const ok = await bcrypt.compare(
        String(password),
        user.password_hash
      );
      if (!ok) {
        // ❌ Wrong password → bump per-app counters and set locks in employee_lock_state
        await db.query(
          `INSERT INTO employee_lock_state
            (employee_id, app, failed_login_count, lock_until, permanent_lock, last_failed_login)
          VALUES (?, ?, 1, NULL, 0, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE
            failed_login_count = failed_login_count + 1,
            last_failed_login  = UTC_TIMESTAMP(),
            lock_until = CASE
              WHEN failed_login_count + 1 = 4 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
              WHEN failed_login_count + 1 = 5 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
              ELSE lock_until
            END,
            permanent_lock = CASE
              WHEN failed_login_count + 1 >= ? THEN 1
              ELSE permanent_lock
            END`,
          [
            user.employee_id,
            app,
            LOCK_POLICY.step4_minutes,
            LOCK_POLICY.step5_minutes,
            LOCK_POLICY.permanent_on,
          ]
        );

        // Read back to know exact state for response + audit
        const fresh = await readLockRow(db, user.employee_id, app);
        const {
          locked: nowLocked,
          msLeft: nowLeft,
          permanent: nowPerm,
        } = lockInfoFromRow(fresh);

        const reason = nowPerm
          ? "perm_locked"
          : nowLocked
          ? "locked"
          : "bad_password";

        await db.query(
          `INSERT INTO login_attempts (employee_id, app, identifier, success, reason, ip, user_agent)
          VALUES (?, ?, ?, 0, ?, ?, ?)`,
          [user.employee_id, app, identLower, reason, ip, ua]
        );

        const baseAffected = {
          items: [],
        };

        let statusChange = AUTH_STATUS.LOGIN_BAD_PASSWORD;
        let lockSeconds = null;

        if (nowPerm) {
          statusChange = AUTH_STATUS.LOGIN_LOCK_PERMA;
        } else if (nowLocked) {
          statusChange = AUTH_STATUS.LOGIN_LOCK_TEMP;
          lockSeconds = Math.ceil(nowLeft / 1000);
        }

        await logAuditLogin({
          employeeName: prettyEmployeeName(user),
          role: user.role,
          action: "Auth - Login Failed",
          detail: {
            statusMessage: nowPerm
              ? "Account locked permanently after repeated invalid passwords."
              : nowLocked
              ? "Account temporarily locked after repeated invalid passwords."
              : "Invalid password.",
            actionDetails: {
              actionType: "login",
              app,
              loginType: type,
              identifier: identLower,
              result: reason,
            },
            affectedData: {
              ...baseAffected,
              statusChange,
              ...(lockSeconds != null ? { lockSeconds } : {}),
            },
            meta: { ip, userAgent: ua },
          },
        });

        if (nowPerm) {
          return res
            .status(423)
            .json({
              error:
                "Account locked. Please contact an Admin or Manager.",
            });
        }
        if (nowLocked) {
          return res.status(423).json({
            error:
              "Account temporarily locked. Please wait before trying again.",
            remaining_seconds: Math.ceil(nowLeft / 1000),
          });
        }
        // Option B: known ID, bad password
        return res
          .status(401)
          .json({ error: "Invalid Password", code: "INVALID_PASSWORD" });
      }

      // ✅ Success → reset only this app’s lock row; keep last_login_* in employees
      await db.query(
        `INSERT INTO employee_lock_state
          (employee_id, app, failed_login_count, lock_until, permanent_lock, last_failed_login)
        VALUES (?, ?, 0, NULL, 0, NULL)
        ON DUPLICATE KEY UPDATE
          failed_login_count = 0,
          lock_until = NULL,
          permanent_lock = 0,
          last_failed_login = NULL`,
        [user.employee_id, app]
      );

      await db.query(
        `UPDATE employees
            SET last_login_at = ${nowUtcSql()},
                last_login_ip = ?
          WHERE employee_id = ?`,
        [ip, user.employee_id]
      );

      await db.query(
        `INSERT INTO login_attempts (employee_id, app, identifier, success, reason, ip, user_agent)
        VALUES (?, ?, ?, 1, 'ok', ?, ?)`,
        [user.employee_id, app, identLower, ip, ua]
      );

      const baseAuditDetail = {
        actionType: "login",
        app,
        loginType: type,
        identifier: identLower,
        result: "ok",
      };

      // Role gate (Backoffice)
      if (
        !["admin", "manager"].includes(
          String(user.role || "").toLowerCase()
        )
      ) {
        await logAuditLogin({
          employeeName: prettyEmployeeName(user),
          role: user.role,
          action: "Auth - Login Success (Backoffice Not Allowed)",
          detail: {
            statusMessage:
              "Login successful but role is not allowed to access Admin Dashboard.",
            actionDetails: baseAuditDetail,
            affectedData: {
              statusChange: AUTH_STATUS.LOGIN_OK_BACKOFFICE_DENIED,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });
        return res
          .status(403)
          .json({ error: "Not authorized for Admin Dashboard" });
      }

      await logAuditLogin({
        employeeName: prettyEmployeeName(user),
        role: user.role,
        action: "Auth - Login Success",
        detail: {
          statusMessage: "User signed in successfully.",
          actionDetails: baseAuditDetail,
          affectedData: {
            statusChange: AUTH_STATUS.LOGIN_OK,
            items: [],
          },
          meta: { ip, userAgent: ua },
        },
      });

      const token = issueAuthToken(user);
      if (remember) {
        res.cookie("qd_token", token, {
          httpOnly: true,
          sameSite: "lax",
          secure: false, // set to true on HTTPS
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: "/",
        });
      }

      return res.json({
        ok: true,
        token,
        user: {
          employeeId: String(user.employee_id),
          role: user.role,
          status: user.status,
          username: user.username || "",
          email: user.email || "",
          firstName: user.first_name || "",
          lastName: user.last_name || "",
          photoUrl: user.photo_url || "",
        },
      });
    } catch (e) {
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
  router.post("/logout", (_req, res) => {
    res.clearCookie("qd_token", { path: "/" });
    res.json({ ok: true });
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
              result: "missing_email",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
              result: "email_not_allowed",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
              result: "email_not_registered",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
              verifyType,
              result: "extra_verification_failed",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
                result: "cooldown_active",
              },
              affectedData: {
                statusChange: AUTH_STATUS.OTP_COOLDOWN_ACTIVE,
                items: [],
              },
              meta: {
                ip,
                userAgent: ua,
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
              result: "server_error",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
            result: "otp_sent",
          },
          affectedData: {
            statusChange: AUTH_STATUS.OTP_EMAIL_SENT,
            items: [],
          },
          meta: { ip, userAgent: ua, expiresAt: r.expiresAt },
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
              result: "missing_email",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
              result: "email_not_allowed",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
              result: "email_not_registered",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
                result: "cooldown_active",
              },
              affectedData: {
                statusChange: AUTH_STATUS.OTP_COOLDOWN_ACTIVE,
                items: [],
              },
              meta: {
                ip,
                userAgent: ua,
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
              result: "server_error",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
            result: "otp_resent",
          },
          affectedData: {
            statusChange: AUTH_STATUS.OTP_EMAIL_RESENT,
            items: [],
          },
          meta: { ip, userAgent: ua, expiresAt: r.expiresAt },
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

      if (!email || !code) {
        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Verify Failed)",
          detail: {
            statusMessage: "Email and code are required.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              result: "missing_email_or_code",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });
        return res
          .status(400)
          .json({ error: "Email and code are required" });
      }

      const rec = await getLatestPendingOtp(email, { db });
      if (!rec || rec.data.status !== "pending") {
        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Verify Failed)",
          detail: {
            statusMessage: "Invalid or expired code.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              result: "no_pending_otp",
            },
            affectedData: {
              statusChange: AUTH_STATUS.OTP_INVALID_OR_EXPIRED,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });
        return res
          .status(400)
          .json({ error: "Invalid or expired code" });
      }

      // Expired? (rec.data.expiresAt is from DB; helper used UTC in logic)
      if (Date.now() > new Date(rec.data.expiresAt).getTime()) {
        await db.query(
          `UPDATE otp SET status='expired', expired_at=UTC_TIMESTAMP() WHERE id=?`,
          [rec.id]
        );

        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Expired)",
          detail: {
            statusMessage: "OTP has expired.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              result: "expired",
            },
            affectedData: {
              statusChange: AUTH_STATUS.OTP_EXPIRED,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });

        return res
          .status(400)
          .json({ error: "Invalid or expired code" });
      }

      const attempts = Number(rec.data.attempts || 0);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await db.query(
          `UPDATE otp SET status='blocked', blocked_at=UTC_TIMESTAMP() WHERE id=?`,
          [rec.id]
        );

        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Blocked)",
          detail: {
            statusMessage: "Too many OTP attempts.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              result: "blocked",
            },
            affectedData: {
              statusChange: AUTH_STATUS.OTP_BLOCKED,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });

        return res
          .status(400)
          .json({
            error: "Too many attempts. Request a new code.",
          });
      }

      const ok = await bcrypt.compare(code, rec.data.codeHash);
      if (!ok) {
        await db.query(
          `UPDATE otp SET attempts=attempts+1, last_attempt_at=UTC_TIMESTAMP() WHERE id=?`,
          [rec.id]
        );

        await logAuditLogin({
          employeeName: email || "Unknown",
          role: "—",
          action: "Auth - Forgot Password (Email OTP Verify Failed)",
          detail: {
            statusMessage: "Invalid OTP code.",
            actionDetails: {
              actionType: "password_reset_otp",
              step: "verify",
              email,
              result: "invalid_code",
            },
            affectedData: {
              statusChange: AUTH_STATUS.OTP_INVALID_OR_EXPIRED,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });

        return res
          .status(400)
          .json({ error: "Invalid or expired code" });
      }

      await db.query(
        `UPDATE otp SET status='used', used_at=UTC_TIMESTAMP() WHERE id=?`,
        [rec.id]
      );

      const emp = await findByEmail(email);
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
        employeeName: emp
          ? prettyEmployeeName(emp)
          : email || "Unknown",
        role: emp?.role,
        action: "Auth - Forgot Password (Email OTP Verified)",
        detail: {
          statusMessage: "OTP verified. Reset token issued.",
          actionDetails: {
            actionType: "password_reset_otp",
            step: "verify",
            email,
            result: "otp_verified",
          },
          affectedData: {
            statusChange: AUTH_STATUS.OTP_VERIFIED_RESET_ALLOWED,
            items: [],
          },
          meta: { ip, userAgent: ua },
        },
      });

      res.json({ ok: true, resetToken });
    } catch (e) {
      next(e);
    }
  });

  // -------------------- Security Questions --------------------
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
              result: "missing_identifier",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
            statusMessage:
              "Account not found for identifier.",
            actionDetails: {
              actionType: "password_reset_sq",
              step: "start",
              identifier,
              result: "account_not_found",
            },
            affectedData: {
              statusChange: AUTH_STATUS.NONE,
              items: [],
            },
            meta: { ip, userAgent: ua },
          },
        });
        return res.status(404).json({ error: "Account not found" });
      }

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
          statusMessage: "Security questions flow started.",
          actionDetails: {
            actionType: "password_reset_sq",
            step: "start",
            identifier,
            result: "sq_started",
          },
          affectedData: {
            statusChange: AUTH_STATUS.SQ_FLOW_STARTED,
            items: [],
          },
          meta: { ip, userAgent: ua },
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

      const fail = () =>
        res.status(400).json({
          error:
            "The details you entered don’t match our records.",
        });

      if (!sqToken || !Array.isArray(answers) || answers.length !== 1)
        return fail();

      let payload;
      try {
        payload = jwt.verify(sqToken, RESET_JWT_SECRET);
      } catch {
        return fail();
      }
      if (payload?.purpose !== "security-questions") return fail();

      const employeeId = payload.employeeId;
      const allowedIds = Array.isArray(payload.allowedIds)
        ? payload.allowedIds
        : [];
      if (!employeeId || !allowedIds.length) return fail();

      const { id, answer } = answers[0] || {};
      if (
        !id ||
        typeof answer !== "string" ||
        !allowedIds.includes(id)
      )
        return fail();

      const rows = await db.query(
        `SELECT answer_hash FROM employee_security_questions WHERE employee_id = ? AND question_id = ? LIMIT 1`,
        [employeeId, id]
      );
      if (!rows.length) return fail();

      const ok = await bcrypt.compare(
        norm(answer),
        rows[0].answer_hash
      );
      if (!ok) return fail();

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
        employeeName: empAud
          ? prettyEmployeeName(empAud)
          : String(employeeId),
        role: empAud?.role,
        action: "Auth - Forgot Password (SQ Verified)",
        detail: {
          statusMessage:
            "Security question verified. Reset token issued.",
          actionDetails: {
            actionType: "password_reset_sq",
            step: "verify",
            questionId: id,
            result: "sq_verified",
          },
          affectedData: {
            statusChange: AUTH_STATUS.SQ_VERIFIED_RESET_ALLOWED,
            items: [],
          },
          meta: { ip, userAgent: ua },
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
              result: "invalid_token",
            },
            affectedData: {
              statusChange: AUTH_STATUS.PASSWORD_RESET_FAILED,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
              result: "invalid_purpose",
            },
            affectedData: {
              statusChange: AUTH_STATUS.PASSWORD_RESET_FAILED,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
              result: "employee_not_found",
            },
            affectedData: {
              statusChange: AUTH_STATUS.PASSWORD_RESET_FAILED,
              items: [],
            },
            meta: { ip, userAgent: ua },
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
            method: payload.emailLower
              ? "email_otp_or_email"
              : "security_questions_or_unknown",
            result: "password_updated",
          },
          affectedData: {
            statusChange: AUTH_STATUS.PASSWORD_RESET_SUCCESS,
            items: [],
          },
          meta: { ip, userAgent: ua },
        },
      });

      res.json({ ok: true, message: "Password updated" });
    } catch (e) {
      next(e);
    }
  });

  return router;
};