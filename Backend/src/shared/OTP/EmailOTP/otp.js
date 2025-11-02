// Backend/src/shared/OTP/EmailOTP/otp.js
const bcrypt = require("bcryptjs");

// Prefer DI, but fall back to shared pool
let sharedDb = null;
try {
  sharedDb = require("../../db/mysql").db;
} catch { /* ignore until DI provides db */ }

/** 6-digit numeric code */
function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** hash code for storage */
async function hashCode(code) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(code, salt);
}

/**
 * create an OTP row and return {otpId, code, expiresAt}
 * @param {{ db?: any, employeeId?: number, emailLower: string, ttlSec?: number }}
 */
async function createEmailOtp({ db, employeeId, emailLower, ttlSec = 10 * 60 }) {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const code = genCode();
  const codeHash = await hashCode(code);
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  const result = await db.query(
    `INSERT INTO otp (employee_id, email_lower, code_hash, status, attempts, created_at, expires_at, purpose, channel)
     VALUES (?, ?, ?, 'pending', 0, NOW(), ?, 'reset', 'email')`,
    [employeeId || null, String(emailLower || "").toLowerCase(), codeHash, expiresAt]
  );

  return { otpId: result.insertId, code, expiresAt };
}

/** fetch latest pending OTP for email */
async function getLatestPendingOtp(emailLower, { db } = {}) {
  db = db || sharedDb;
  if (!db) throw new Error("DB pool not available");

  const rows = await db.query(
    `SELECT *
       FROM otp
      WHERE email_lower = ? AND purpose = 'reset' AND status = 'pending'
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
      expiresAt: r.expires_at
    }
  };
}

module.exports = {
  genCode,
  createEmailOtp,
  getLatestPendingOtp
};