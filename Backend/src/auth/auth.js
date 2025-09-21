// Backend/src/auth/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { db } = require("../shared/firebase/firebaseAdmin");
const { createEmailOtp, getLatestPendingOtp } = require("../shared/OTP/EmailOTP/otp");
const { sendOtpEmail } = require("../shared/email/mailer");

const router = express.Router();
const DEBUG = process.env.DEBUG_AUTH === "1";

const OTP_ENUMERATION_PROTECTION = process.env.OTP_ENUMERATION_PROTECTION !== "0";

// -------------------- helpers --------------------
function makeToken(user) {
  const payload = {
    sub: String(user.employeeId),
    role: user.role,
    name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    username: user.username || "",
    email: user.email || "",
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function detectType(identifier) {
  const id = String(identifier || "").trim();
  if (!id) return "username";
  if (/^\d{9}$/.test(id)) return "employeeId";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) return "email";
  return "username";
}

async function getBy(field, value) {
  if (value === null || value === undefined || value === "") return null;
  const snap = await db.collection("employees").where(field, "==", value).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function tryProbes(probes) {
  for (const [field, value] of probes) {
    const u = await getBy(field, value);
    if (u) return u;
  }
  return null;
}

async function findUserByIdentifier(identifierRaw) {
  const raw = String(identifierRaw || "").trim();
  const primary = detectType(raw);
  const lowerVal = raw.toLowerCase();
  const looksNumeric = /^\d+$/.test(raw);
  const asNumber = looksNumeric ? Number(raw) : null;

  let probes = [];
  if (primary === "email") {
    probes = [
      ["emailLower", lowerVal],
      ["email", lowerVal],
      ["email", raw],
      ["usernameLower", lowerVal],
      ["username", raw],
    ];
  } else if (primary === "employeeId") {
    probes = [
      ["employeeId", raw],
      ["employeeId", asNumber],
      ["usernameLower", lowerVal],
      ["emailLower", lowerVal],
      ["email", raw],
    ];
  } else {
    probes = [
      ["usernameLower", lowerVal],
      ["username", raw],
      ["emailLower", lowerVal],
      ["email", raw],
      ["employeeId", asNumber],
      ["employeeId", raw],
    ];
  }
  const user = await tryProbes(probes);
  if (!user) return null;

  const via = user.loginVia || {};
  const ok =
    (primary === "email" && via.email !== false) ||
    (primary === "username" && via.username !== false) ||
    (primary === "employeeId" && via.employeeId !== false) ||
    (via.email !== false && via.username !== false && via.employeeId !== false);

  return ok ? user : null;
}

// Less strict finder for security-questions (ignore loginVia toggles)
async function findEmployeeByAnyIdentifier(identifierRaw) {
  const raw = String(identifierRaw || "").trim();
  const primary = detectType(raw);
  const lowerVal = raw.toLowerCase();
  const looksNumeric = /^\d+$/.test(raw);
  const asNumber = looksNumeric ? Number(raw) : null;

  let probes = [];
  if (primary === "email") {
    probes = [
      ["emailLower", lowerVal],
      ["email", lowerVal],
      ["email", raw],
      ["usernameLower", lowerVal],
      ["username", raw],
    ];
  } else if (primary === "employeeId") {
    probes = [
      ["employeeId", raw],
      ["employeeId", asNumber],
      ["usernameLower", lowerVal],
      ["emailLower", lowerVal],
      ["email", raw],
    ];
  } else {
    probes = [
      ["usernameLower", lowerVal],
      ["username", raw],
      ["emailLower", lowerVal],
      ["email", raw],
      ["employeeId", asNumber],
      ["employeeId", raw],
    ];
  }
  return await tryProbes(probes);
}

function sanitizePassword(pw) {
  return typeof pw === "string" ? pw.trim() : "";
}

function getPasswordHash(user) {
  return user.passwordHash || user.passwordhash || user.passHash || user.hash || null;
}

const lower = (s) => String(s || "").trim().toLowerCase();

// -------------------- /login --------------------
router.post("/login", async (req, res, next) => {
  try {
    const { identifier, password, remember } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: "identifier and password are required" });
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (String(user.status || "").toLowerCase() !== "active") {
      return res.status(403).json({ error: "Account is not active" });
    }
    if (!["admin", "manager"].includes(String(user.role || "").toLowerCase())) {
      return res.status(403).json({ error: "Not authorized for Admin Dashboard" });
    }

    const hash = getPasswordHash(user);
    if (!hash) return res.status(401).json({ error: "Password not set" });

    const ok = await bcrypt.compare(sanitizePassword(password), hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = makeToken(user);
    if (remember) {
      res.cookie("qd_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    }
    res.json({
      token,
      user: {
        employeeId: String(user.employeeId ?? ""),
        role: user.role,
        status: user.status,
        username: user.username || "",
        email: user.email || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
      },
    });
  } catch (e) {
    next(e);
  }
});

// -------------------- /me (soft) --------------------
router.get("/me", (req, res) => {
  // add a soft mode via query (?soft=1) or header (x-auth-optional: 1)
  const soft =
    req.query.soft === "1" ||
    String(req.get("x-auth-optional") || "").toLowerCase() === "1";

  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const token = bearer || req.cookies?.qd_token || null;

  if (!token) {
    // no token
    return soft
      ? res.json({ ok: true, authenticated: false, user: null })
      : res.status(401).json({ error: "No token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ ok: true, authenticated: true, user: payload, token });
  } catch {
    return soft
      ? res.json({ ok: true, authenticated: false, user: null })
      : res.status(401).json({ error: "Invalid token" });
  }
});

// -------------------- Forgot Password (Email OTP) --------------------
// Config
const OTP_TTL_SEC = Number(process.env.OTP_TTL_SEC || 10 * 60); // 10 minutes
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const RESEND_MIN_INTERVAL_SEC = Number(process.env.OTP_RESEND_MIN_INTERVAL_SEC || 60);
const RESET_TOKEN_TTL = String(process.env.RESET_TOKEN_TTL || "15m");
const RESET_JWT_SECRET = process.env.JWT_RESET_SECRET || process.env.JWT_SECRET;

// helper: normalize & lookup employee by email
async function findEmployeeByEmail(emailRaw) {
  const emailLower = String(emailRaw || "").trim().toLowerCase();
  if (!emailLower) return null;

  const byLower = await db
    .collection("employees")
    .where("emailLower", "==", emailLower)
    .limit(1)
    .get();

  if (!byLower.empty) {
    const d = byLower.docs[0];
    return { id: d.id, emailLower, ...d.data() };
  }

  const byEmail = await db
    .collection("employees")
    .where("email", "==", emailLower)
    .limit(1)
    .get();

  if (!byEmail.empty) {
    const d = byEmail.docs[0];
    return {
      id: d.id,
      emailLower,
      ...d.data(),
      email: emailLower,
    };
  }

  return null;
}

// extra verification checker (ONLY if client sent extra data)
function verifyExtraInfo(emp, verifyType, verifyValueRaw) {
  if (!verifyType || !verifyValueRaw) return true; // nothing to verify
  const value = String(verifyValueRaw).trim();
  if (verifyType === "employeeId") {
    return String(emp.employeeId ?? "") === value;
  }
  if (verifyType === "username") {
    return lower(emp.username) === lower(value);
  }
  return false;
}


  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

  function isEmailAllowed(email) {
    if (!EMAIL_RE.test(email)) return false;
    if (!ALLOWED_EMAIL_DOMAINS.length) return true;
    const domain = email.split("@")[1].toLowerCase();
    return ALLOWED_EMAIL_DOMAINS.includes(domain);
  }


// POST /api/auth/forgot/start  (OTP)
router.post("/forgot/start", async (req, res, next) => {
  try {
    const email = lower(req.body?.email);
    const verifyType  = req.body?.verifyType;   // 'employeeId' | 'username' | undefined
    const verifyValue = req.body?.verifyValue;  // string | undefined

    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!isEmailAllowed(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const employee = await findEmployeeByEmail(email);
    if (!employee) {
      // STRICT: do not send, do not pretend; hard error
      return res.status(404).json({ error: "That email is not registered." });
    }

    if (verifyType || verifyValue) {
      const ok = verifyExtraInfo(employee, verifyType, verifyValue);
      if (!ok) return res.status(400).json({ error: "We couldn't verify your details. Please check and try again." });
    }

    const { otpId, code, expiresAt } = await createEmailOtp({
      employeeRefPath: `employees/${employee.id}`,
      emailLower: email,
      ttlSec: OTP_TTL_SEC,
    });

    if (DEBUG) console.log("[forgot/start] OTP created", { otpId, email, expiresAt });

    try {
      await sendOtpEmail(email, code, {
        appName: "Quscina",
        expiresMinutes: Math.ceil(OTP_TTL_SEC / 60),
      });
    } catch (mailErr) {
      console.error("[forgot/start] Email send failed:", mailErr?.message || mailErr);
      // Optional: consider rolling back OTP doc or marking it failed if send fails
    }

    return res.json({ ok: true, message: "We’ve sent a 6-digit code to your email." });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/forgot/resend
router.post("/forgot/resend", async (req, res, next) => {
  try {
    const email = lower(req.body?.email);
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!isEmailAllowed(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const employee = await findEmployeeByEmail(email);
    if (!employee) return res.status(404).json({ error: "That email is not registered." });

    const latest = await getLatestPendingOtp(email);
    const now = Date.now();

    if (latest?.data?.createdAt?.toMillis) {
      const lastMs = latest.data.createdAt.toMillis();
      if ((now - lastMs) / 1000 < RESEND_MIN_INTERVAL_SEC) {
        if (DEBUG) console.log("[forgot/resend] throttled for", email);
        // Still respond OK but do NOT send again
        return res.status(429).json({ error: "Please wait before requesting another code." });
      }
    }

    const { otpId, code, expiresAt } = await createEmailOtp({
      employeeRefPath: `employees/${employee.id}`,
      emailLower: email,
      ttlSec: OTP_TTL_SEC,
    });

    if (DEBUG) console.log("[forgot/resend] OTP created", { otpId, email, expiresAt });

    try {
      await sendOtpEmail(email, code, {
        appName: "Quscina",
        expiresMinutes: Math.ceil(OTP_TTL_SEC / 60),
      });
    } catch (mailErr) {
      console.error("[forgot/resend] Email send failed:", mailErr?.message || mailErr);
    }

    return res.json({ ok: true, message: "A new code has been sent." });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/forgot/verify  (OTP -> resetToken)
router.post("/forgot/verify", async (req, res, next) => {
  try {
    const email = lower(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !code) return res.status(400).json({ error: "Email and code are required" });

    const latest = await getLatestPendingOtp(email);
    if (!latest) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    const otpDocRef = db.collection("otp").doc(latest.id);
    const otp = latest.data;

    if (otp.status !== "pending") return res.status(400).json({ error: "Invalid or expired code" });

    const now = Date.now();
    const expMs = otp.expiresAt instanceof Date ? otp.expiresAt.getTime() : otp.expiresAt?.toMillis?.() || 0;
    if (!expMs || now > expMs) {
      await otpDocRef.update({ status: "expired", expiredAt: new Date() });
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    const attempts = Number(otp.attempts || 0);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await otpDocRef.update({ status: "blocked", blockedAt: new Date() });
      return res.status(400).json({ error: "Too many attempts. Request a new code." });
    }

    const ok = await bcrypt.compare(code, otp.codeHash);
    if (!ok) {
      await otpDocRef.update({ attempts: attempts + 1, lastAttemptAt: new Date() });
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    await otpDocRef.update({ status: "used", usedAt: new Date() });

    const resetToken = jwt.sign(
      {
        purpose: "password-reset",
        emailLower: email,
        employeeRefPath: otp.employeeRefPath || "",
        otpId: latest.id,
      },
      RESET_JWT_SECRET,
      { expiresIn: RESET_TOKEN_TTL }
    );

    if (DEBUG) console.log("[forgot/verify] success for", email);

    return res.json({ ok: true, resetToken });
  } catch (e) {
    next(e);
  }
});

// -------------------- Security Questions (NEW) --------------------
const SQ_TOKEN_TTL = String(process.env.SQ_TOKEN_TTL || "10m");

// Fixed catalog — do NOT reveal per-user configuration
const SQ_CATALOG = {
  pet: "What is the name of your first pet?",
  school: "What is the name of your elementary school?",
  city: "In what city were you born?",
  mother_maiden: "What is your mother’s maiden name?",
  nickname: "What was your childhood nickname?",
};

// normalize for hashing/compare
const norm = (s) => String(s || "").trim().toLowerCase();

// POST /api/auth/forgot/sq/start
// body: { identifier: string }
// response: { ok, sqToken }
router.post("/forgot/sq/start", async (req, res, next) => {
  try {
    const identifier = String(req.body?.identifier || "").trim();
    if (!identifier) return res.status(400).json({ error: "identifier is required" });

    const emp = await findEmployeeByAnyIdentifier(identifier);
    if (!emp) return res.status(404).json({ error: "Account not found" });

    // Do NOT leak which questions the user configured.
    // Just issue a token with the set of allowed IDs (the 5 hardcoded ones).
    const allowedIds = Object.keys(SQ_CATALOG);

    const sqToken = jwt.sign(
      {
        purpose: "security-questions",
        employeeRefPath: `employees/${emp.id}`,
        allowedIds,
      },
      RESET_JWT_SECRET,
      { expiresIn: SQ_TOKEN_TTL }
    );

    // Return only the token; no questions array.
    return res.json({ ok: true, sqToken });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/forgot/sq/verify
// body: { sqToken, answers: [{id, answer}] }  // exactly one
// response: { ok, resetToken }
router.post("/forgot/sq/verify", async (req, res, next) => {
  try {
    const { sqToken, answers } = req.body || {};
    const fail = () =>
      res.status(400).json({ error: "The details you entered don’t match our records." });

    // Basic input validation
    if (!sqToken || !Array.isArray(answers) || answers.length !== 1) {
      return fail();
    }

    // Validate token
    let payload;
    try {
      payload = jwt.verify(sqToken, RESET_JWT_SECRET);
    } catch {
      return fail();
    }
    if (payload?.purpose !== "security-questions") return fail();

    const employeeRefPath = String(payload.employeeRefPath || "");
    const allowedIds = Array.isArray(payload.allowedIds) ? payload.allowedIds : [];
    if (!employeeRefPath || !allowedIds.length) return fail();

    // Validate answer input
    const { id, answer } = answers[0] || {};
    if (!id || typeof answer !== "string" || !allowedIds.includes(id)) {
      return fail();
    }

    // Load employee
    const docRef = db.doc(employeeRefPath);
    const snap = await docRef.get();
    if (!snap.exists) return fail();
    const emp = { id: snap.id, ...snap.data() };

    // Check stored security questions
    const configured = Array.isArray(emp.securityQuestions) ? emp.securityQuestions : [];
    const stored = configured.find((q) => q && q.id === id);
    if (!stored || !(stored.answerHash || stored.answerhash)) return fail();

    // Compare hashes
    const storedHash = stored.answerHash || stored.answerhash;
    const ok = await bcrypt.compare(norm(answer), storedHash);
    if (!ok) return fail();

    // Success -> issue resetToken compatible with /forgot/reset
    const resetToken = jwt.sign(
      {
        purpose: "password-reset",
        employeeRefPath,
        via: "security-questions",
      },
      RESET_JWT_SECRET,
      { expiresIn: RESET_TOKEN_TTL }
    );

    return res.json({ ok: true, resetToken });
  } catch (e) {
    next(e);
  }
});

// -------------------- POST /api/auth/forgot/reset (shared) --------------------
router.post("/forgot/reset", async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body || {};
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: "resetToken and newPassword are required" });
    }
    let payload;
    try {
      payload = jwt.verify(resetToken, RESET_JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    if (payload?.purpose !== "password-reset") {
      return res.status(400).json({ error: "Invalid reset token" });
    }

    const employeeRefPath = String(payload.employeeRefPath || "");
    let employee = null;

    if (employeeRefPath) {
      const snap = await db.doc(employeeRefPath).get();
      if (snap.exists) {
        employee = { id: snap.id, ...snap.data() };
      }
    }

    if (!employee) {
      // Fallback path for OTP token (which carries emailLower)
      const emailLower = String(payload.emailLower || "").trim().toLowerCase();
      if (emailLower) {
        employee = await findEmployeeByEmail(emailLower);
      }
    }

    if (!employee) {
      return res.status(400).json({ error: "Unable to reset password" });
    }

    const hashed = await bcrypt.hash(String(newPassword || ""), 10);

    await db.collection("employees").doc(employee.id).update({
      passwordHash: hashed,
      passwordUpdatedAt: new Date(),
    });

    if (DEBUG) console.log("[forgot/reset] password updated for", employee.id);

    return res.json({ ok: true, message: "Password updated" });
  } catch (e) {
    next(e);
  }
});

// -------------------- export --------------------
module.exports = () => router;