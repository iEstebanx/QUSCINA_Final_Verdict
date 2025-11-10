// Backend/src/shared/OTP/EmailOTP/otp.js
const express = require("express");
const bcrypt = require("bcryptjs");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try { sharedDb = require("../../db/mysql").db; } catch { /* ignore until DI provides db */ }

/** adapter so this works with mysql2(promise) or custom wrapper */
async function q(db, sql, params) {
  const res = await db.query(sql, params);
  if (Array.isArray(res) && Array.isArray(res[0])) return res[0]; // mysql2
  if (Array.isArray(res)) return res;                              // rows directly
  if (res && Array.isArray(res.rows)) return res.rows;             // pg-like
  return [];
}

const COOLDOWN_MINUTES = 10;
const COOLDOWN_MESSAGE =
  `A verification code is already active. Please wait ${COOLDOWN_MINUTES} minutes before requesting another.`;

const NOW_SQL = "UTC_TIMESTAMP()"; // single source of truth for 'now' in DB (avoid TZ skew)

/** 6-digit numeric code */
function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** hash code for storage */
async function hashCode(code) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(code, salt);
}

/** seconds left until expiry */
function secondsLeft(until) {
  const ms = new Date(until).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

/** detect duplicate key error safely */
function isDupKey(err) {
  const msg = String(err?.message || err?.sqlMessage || "");
  return (
    err?.code === "ER_DUP_ENTRY" ||
    err?.errno === 1062 ||
    err?.sqlState === "23000" ||
    /duplicate entry/i.test(msg)
  );
}

/**
 * Create an OTP row and return { otpId, code, expiresAt }.
 * Enforces: if a pending (unexpired) OTP exists, throws COOLDOWN_ACTIVE.
 */
async function createEmailOtp({ db, employeeId, emailLower, ttlSec = 10 * 60 }) {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  emailLower = String(emailLower || "").toLowerCase();

  // Expire any pending rows that are already past their expiry (safe cleanup).
  await db.query(
    `UPDATE otp
        SET status='expired', expired_at=${NOW_SQL}
      WHERE email_lower=? AND purpose='reset' AND status='pending' AND expires_at <= ${NOW_SQL}`,
    [emailLower]
  );

  const code = genCode();
  const codeHash = await hashCode(code);
  const ttlSecVal = ttlSec | 0;

  let ins; // can be [ResultSetHeader, fields] (mysql2) OR ResultSetHeader-like object (custom wrapper)
  try {
    // ATOMIC insert: only if no active pending exists
    ins = await db.query(
      `
      INSERT INTO otp (
        employee_id, email_lower, code_hash, status, attempts,
        created_at, expires_at, purpose, channel
      )
      SELECT
        ?, ?, ?, 'pending', 0,
        ${NOW_SQL}, DATE_ADD(${NOW_SQL}, INTERVAL ? SECOND), 'reset', 'email'
      FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1
          FROM otp
         WHERE email_lower=? AND purpose='reset' AND status='pending' AND expires_at > ${NOW_SQL}
         LIMIT 1
      )
      `,
      [employeeId || null, emailLower, codeHash, ttlSecVal, emailLower]
    );
  } catch (e) {
    // Race condition: both passed NOT EXISTS; one loses here with a dup-key on the functional unique index.
    if (isDupKey(e)) {
      const rows = await q(
        db,
        `SELECT id, expires_at
           FROM otp
          WHERE email_lower=? AND purpose='reset' AND status='pending' AND expires_at > ${NOW_SQL}
          ORDER BY created_at DESC
          LIMIT 1`,
        [emailLower]
      );
      const active = rows[0];
      const err = new Error("A verification code is already active. Please wait before requesting another.");
      err.code = "COOLDOWN_ACTIVE";
      err.expiresAt = active?.expires_at;
      err.remainingSec = active ? secondsLeft(active.expires_at) : undefined;
      throw err;
    }
    throw e; // other DB errors
  }

  // Normalize INSERT result across drivers/wrappers
  const result = Array.isArray(ins) ? ins[0] : ins; // mysql2: [ResultSetHeader, fields]
  const affected = Number(result?.affectedRows || 0);

  if (!affected) {
    // NOT EXISTS short-circuited us: treat as active cooldown
    const rows = await q(
      db,
      `SELECT id, expires_at
         FROM otp
        WHERE email_lower=? AND purpose='reset' AND status='pending' AND expires_at > ${NOW_SQL}
        ORDER BY created_at DESC
        LIMIT 1`,
      [emailLower]
    );
    const active = rows[0];
    const remainingSec = active ? secondsLeft(active.expires_at) : ttlSecVal;
    const err = new Error("A verification code is already active. Please wait before requesting another.");
    err.code = "COOLDOWN_ACTIVE";
    err.expiresAt = active?.expires_at;
    err.remainingSec = remainingSec;
    throw err;
  }

  const otpId = (typeof result?.insertId !== "undefined") ? result.insertId : undefined;
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  // Return newly created OTP info (email sending is handled by the caller)
  return { otpId, code, expiresAt };
}

/** latest pending OTP for email */
async function getLatestPendingOtp(emailLower, { db } = {}) {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const rows = await q(
    db,
    `SELECT *
       FROM otp
      WHERE email_lower=? AND purpose='reset' AND status='pending'
      ORDER BY created_at DESC
      LIMIT 1`,
    [String(emailLower || "").toLowerCase()]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    data: {
      ...r,
      codeHash: r.code_hash,
      attempts: r.attempts,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    },
  };
}

/** wrapper returning cooldown info instead of throwing */
async function safeCreateEmailOtp(opts) {
  try {
    const created = await createEmailOtp(opts);
    return { ok: true, ...created };
  } catch (err) {
    if (err.code === "COOLDOWN_ACTIVE") {
      return {
        ok: false,
        reason: "cooldown_active",
        message: err.message,
        expiresAt: err.expiresAt,
        remainingSec: err.remainingSec,
      };
    }
    throw err;
  }
}

/** Express router builder */
function buildForgotRouter({ db, baseTtlSec = COOLDOWN_MINUTES * 60 } = {}) {
  const router = express.Router();

  router.post("/start", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "Email is required" });

      const r = await safeCreateEmailOtp({
        db: db || sharedDb,
        emailLower: email,
        ttlSec: baseTtlSec,
        employeeId: null,
      });

      if (!r.ok) {
        if (r.reason === "cooldown_active") {
          return res.status(429).json({
            error: COOLDOWN_MESSAGE,
            // keep expiresAt for silent disabling; omit remainingSec
            expiresAt: r.expiresAt ?? null,
          });
        }
        return res.status(500).json({ error: "Unable to start verification" });
      }

      return res.status(200).json({ expiresAt: r.expiresAt });
    } catch (err) {
      if (isDupKey(err)) {
        // optional: try to fetch expiresAt; still use the fixed message
        try {
          const rows = await q(
            db || sharedDb,
            `SELECT expires_at FROM otp
               WHERE email_lower=? AND purpose='reset' AND status='pending' AND expires_at > ${NOW_SQL}
               ORDER BY created_at DESC LIMIT 1`,
            [String(req.body?.email || "").trim().toLowerCase()]
          );
          return res.status(429).json({
            error: COOLDOWN_MESSAGE,
            expiresAt: rows?.[0]?.expires_at ?? null,
          });
        } catch (_) {
          return res.status(429).json({ error: COOLDOWN_MESSAGE });
        }
      }
      console.error("[forgot/start] ERROR:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post("/resend", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "Email is required" });

      const r = await safeCreateEmailOtp({
        db: db || sharedDb,
        emailLower: email,
        ttlSec: baseTtlSec,
        employeeId: null,
      });

      if (!r.ok) {
        if (r.reason === "cooldown_active") {
          return res.status(429).json({
            error: COOLDOWN_MESSAGE,
            expiresAt: r.expiresAt ?? null,
          });
        }
        return res.status(500).json({ error: "Unable to resend code" });
      }

      return res.status(200).json({ expiresAt: r.expiresAt });
    } catch (err) {
      if (isDupKey(err)) {
        return res.status(429).json({ error: COOLDOWN_MESSAGE });
      }
      console.error("[forgot/resend] ERROR:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // GET /forgot/status?email=someone@example.com
  router.get("/status", async (req, res) => {
    try {
      const email = String(req.query?.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "Email is required" });

      const rows = await q(
        db || sharedDb,
        `SELECT expires_at
           FROM otp
          WHERE email_lower=? AND purpose='reset' AND status='pending'
            AND expires_at > ${NOW_SQL}
          ORDER BY created_at DESC
          LIMIT 1`,
        [email]
      );

      const active = rows[0];
      if (!active) return res.json({ active: false, remaining_seconds: 0, expiresAt: null });

      const remaining = secondsLeft(active.expires_at);
      return res.json({
        active: true,
        remaining_seconds: remaining,
        expiresAt: active.expires_at,
        can_request: remaining <= 0,
      });
    } catch (err) {
      console.error("[forgot/status] ERROR:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
}

module.exports = {
  genCode,
  hashCode,
  createEmailOtp,
  getLatestPendingOtp,
  safeCreateEmailOtp,
  buildForgotRouter,
};