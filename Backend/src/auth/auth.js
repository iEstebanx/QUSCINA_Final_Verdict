// Backend/src/auth/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Prefer DI from server.js, but fall back to shared pool if not provided
let sharedDb = null;
try { sharedDb = require("../shared/db/mysql").db; } catch { /* ok until DI passes db */ }

// Keep your email sender
const { sendOtpEmail } = require("../shared/email/mailer");

const {
  safeCreateEmailOtp,
  getLatestPendingOtp,
} = require("../shared/OTP/EmailOTP/otp");

module.exports = function authRouterFactory({ db } = {}) {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available. Pass { db } from server.js or ensure ../shared/db/mysql exists.");

  const router = express.Router();

  // ---- Config ----
  const DEBUG = process.env.DEBUG_AUTH === "1";
  const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
  const RESET_JWT_SECRET = process.env.JWT_RESET_SECRET || JWT_SECRET;

  const OTP_TTL_SEC = Number(process.env.OTP_TTL_SEC || 10 * 60);
  const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
  const RESEND_MIN_INTERVAL_SEC = Number(process.env.OTP_RESEND_MIN_INTERVAL_SEC || 60);
  const RESET_TOKEN_TTL = String(process.env.RESET_TOKEN_TTL || "15m");
  const SQ_TOKEN_TTL = String(process.env.SQ_TOKEN_TTL || "10m");

  // ---- Helpers ----
  const lower = (s) => String(s || "").trim().toLowerCase();

  function normalizeIdentifier(idRaw) {
    const s = String(idRaw || "").trim();
    if (/^\d{9}$/.test(s)) return { type: "employee_id", valueLower: s }; // id is digits; not lowercased
    if (s.includes("@")) return { type: "email", valueLower: s.toLowerCase() };
    return { type: "username", valueLower: s.toLowerCase() };
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
    const rows = await db.query(`SELECT * FROM employees WHERE employee_id = ? LIMIT 1`, [empId]);
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
    const rows = await db.query(`SELECT * FROM employees WHERE employee_id = ? LIMIT 1`, [empId]);
    return rows[0] || null;
  }

  function makeJwtUserPayload(userRow) {
    return {
      sub: String(userRow.employee_id),
      role: userRow.role,
      name: `${userRow.first_name || ""} ${userRow.last_name || ""}`.trim(),
      username: userRow.username || "",
      email: userRow.email || "",
      employeeId: String(userRow.employee_id),
    };
  }

  function issueAuthToken(userRow) {
    return jwt.sign(makeJwtUserPayload(userRow), JWT_SECRET, { expiresIn: "7d" });
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
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

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
      const { identifier, password, remember } = req.body || {};
      if (!identifier || !password) {
        return res.status(400).json({ error: "identifier and password are required" });
      }

      const { user, type } = await findByAlias(identifier);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      if (String(user.status || "").toLowerCase() !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }

      // Only Admin/Manager can access the Admin Dashboard
      if (!["admin", "manager"].includes(String(user.role || "").toLowerCase())) {
        return res.status(403).json({ error: "Not authorized for Admin Dashboard" });
      }

      if (!loginMethodAllowed(user, type)) {
        return res.status(400).json({ error: "This login method is disabled for the account" });
      }

      const ok = await bcrypt.compare(String(password), user.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      const token = issueAuthToken(user);
      if (remember) {
        res.cookie("qd_token", token, {
          httpOnly: true,
          sameSite: "lax",
          secure: false, // set true if you run https
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
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const token = bearer || req.cookies?.qd_token || null;

    if (!token) {
      return soft
        ? res.json({ ok: true, authenticated: false, user: null })
        : res.status(401).json({ error: "No token" });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return res.json({ ok: true, authenticated: true, user: payload, token });
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

  // POST /api/auth/forgot/start
  router.post("/forgot/start", async (req, res, next) => {
    try {
      const email = lower(req.body?.email);
      const verifyType = req.body?.verifyType;
      const verifyValue = String(req.body?.verifyValue || "").trim();

      if (!email) return res.status(400).json({ error: "Email is required" });
      if (!isEmailAllowed(email)) return res.status(400).json({ error: "Enter a valid email address." });

      const emp = await findByEmail(email);
      if (!emp) return res.status(404).json({ error: "That email is not registered." });

      // Optional extra verification
      const okExtra =
        !verifyType || !verifyValue ||
        (verifyType === "employeeId" && String(emp.employee_id) === verifyValue) ||
        (verifyType === "username" && lower(emp.username) === lower(verifyValue));
      if (!okExtra) return res.status(400).json({ error: "We couldn't verify your details. Please try again." });

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
          return res.status(429).json({
            error: "A verification code is already active. Please wait 10 minutes before requesting another.",
            expiresAt: r.expiresAt ?? null,
          });
        }
        return res.status(500).json({ error: "Unable to start verification" });
      }

      // Send the code via your existing mailer
      try {
        await sendOtpEmail(email, r.code, {
          appName: "Quscina",
          expiresMinutes: Math.ceil(OTP_TTL_SEC / 60),
        });
      } catch (mailErr) {
        console.error("[forgot/start] email send failed:", mailErr?.message || mailErr);
        // (optional) you can still return 200 since OTP row exists
      }

      // Also return expiresAt for the silent cooldown UI
      return res.json({ ok: true, expiresAt: r.expiresAt });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/forgot/resend
  router.post("/forgot/resend", async (req, res, next) => {
    try {
      const email = lower(req.body?.email);
      if (!email) return res.status(400).json({ error: "Email is required" });
      if (!isEmailAllowed(email)) return res.status(400).json({ error: "Enter a valid email address." });

      const emp = await findByEmail(email);
      if (!emp) return res.status(404).json({ error: "That email is not registered." });

      const r = await safeCreateEmailOtp({
        db,
        emailLower: email,
        employeeId: emp.employee_id,
        ttlSec: OTP_TTL_SEC,
      });

      if (!r.ok) {
        if (r.reason === "cooldown_active") {
          return res.status(429).json({
            error: "A verification code is already active. Please wait 10 minutes before requesting another.",
            expiresAt: r.expiresAt ?? null,
          });
        }
        return res.status(500).json({ error: "Unable to resend code" });
      }

      try {
        await sendOtpEmail(email, r.code, {
          appName: "Quscina",
          expiresMinutes: Math.ceil(OTP_TTL_SEC / 60),
        });
      } catch (mailErr) {
        console.error("[forgot/resend] email send failed:", mailErr?.message || mailErr);
      }

      return res.json({ ok: true, expiresAt: r.expiresAt });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/forgot/verify
  router.post("/forgot/verify", async (req, res, next) => {
    try {
      const email = lower(req.body?.email);
      const code = String(req.body?.code || "").trim();
      if (!email || !code) return res.status(400).json({ error: "Email and code are required" });

      const rec = await getLatestPendingOtp(email, { db });
      if (!rec || rec.data.status !== "pending") {
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      // Expired? (rec.data.expiresAt is from DB; helper used UTC in logic)
      if (Date.now() > new Date(rec.data.expiresAt).getTime()) {
        await db.query(`UPDATE otp SET status='expired', expired_at=UTC_TIMESTAMP() WHERE id=?`, [rec.id]);
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      const attempts = Number(rec.data.attempts || 0);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await db.query(`UPDATE otp SET status='blocked', blocked_at=UTC_TIMESTAMP() WHERE id=?`, [rec.id]);
        return res.status(400).json({ error: "Too many attempts. Request a new code." });
      }

      const ok = await bcrypt.compare(code, rec.data.codeHash);
      if (!ok) {
        await db.query(
          `UPDATE otp SET attempts=attempts+1, last_attempt_at=UTC_TIMESTAMP() WHERE id=?`,
          [rec.id]
        );
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      await db.query(`UPDATE otp SET status='used', used_at=UTC_TIMESTAMP() WHERE id=?`, [rec.id]);

      const emp = await findByEmail(email);
      const resetToken = jwt.sign(
        { purpose: "password-reset", employeeId: emp ? emp.employee_id : null, emailLower: email },
        RESET_JWT_SECRET,
        { expiresIn: RESET_TOKEN_TTL }
      );

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
      if (!identifier) return res.status(400).json({ error: "identifier is required" });

      const { user } = await findByAlias(identifier);
      if (!user) return res.status(404).json({ error: "Account not found" });

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

      res.json({ ok: true, sqToken });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/forgot/sq/verify
  router.post("/forgot/sq/verify", async (req, res, next) => {
    try {
      const { sqToken, answers } = req.body || {};
      const fail = () => res.status(400).json({ error: "The details you entered don’t match our records." });

      if (!sqToken || !Array.isArray(answers) || answers.length !== 1) return fail();

      let payload;
      try { payload = jwt.verify(sqToken, RESET_JWT_SECRET); } catch { return fail(); }
      if (payload?.purpose !== "security-questions") return fail();

      const employeeId = payload.employeeId;
      const allowedIds = Array.isArray(payload.allowedIds) ? payload.allowedIds : [];
      if (!employeeId || !allowedIds.length) return fail();

      const { id, answer } = answers[0] || {};
      if (!id || typeof answer !== "string" || !allowedIds.includes(id)) return fail();

      const rows = await db.query(
        `SELECT answer_hash FROM employee_security_questions WHERE employee_id = ? AND question_id = ? LIMIT 1`,
        [employeeId, id]
      );
      if (!rows.length) return fail();

      const ok = await bcrypt.compare(norm(answer), rows[0].answer_hash);
      if (!ok) return fail();

      const resetToken = jwt.sign(
        { purpose: "password-reset", employeeId },
        RESET_JWT_SECRET,
        { expiresIn: RESET_TOKEN_TTL }
      );

      res.json({ ok: true, resetToken });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/forgot/reset
  router.post("/forgot/reset", async (req, res, next) => {
    try {
      const { resetToken, newPassword } = req.body || {};
      if (!resetToken || !newPassword) {
        return res.status(400).json({ error: "resetToken and newPassword are required" });
      }

      let payload;
      try { payload = jwt.verify(resetToken, RESET_JWT_SECRET); }
      catch { return res.status(400).json({ error: "Invalid or expired reset token" }); }

      if (payload?.purpose !== "password-reset") {
        return res.status(400).json({ error: "Invalid reset token" });
      }

      // Resolve employee
      let emp = null;
      if (payload.employeeId) {
        const rows = await db.query(`SELECT * FROM employees WHERE employee_id = ? LIMIT 1`, [payload.employeeId]);
        emp = rows[0] || null;
      }
      if (!emp && payload.emailLower) {
        emp = await findByEmail(payload.emailLower);
      }
      if (!emp) return res.status(400).json({ error: "Unable to reset password" });

      const hashed = await bcrypt.hash(String(newPassword), 12);
      await db.query(
        `UPDATE employees SET password_hash = ?, password_last_changed = NOW() WHERE employee_id = ?`,
        [hashed, emp.employee_id]
      );

      if (DEBUG) console.log("[forgot/reset] password updated for", emp.employee_id);
      res.json({ ok: true, message: "Password updated" });
    } catch (e) {
      next(e);
    }
  });

  return router;
};