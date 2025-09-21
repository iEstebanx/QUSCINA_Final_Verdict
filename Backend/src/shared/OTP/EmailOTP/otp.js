// Backend/src/shared/OTP/EmailOTP/otp.js
const bcrypt = require("bcryptjs");
const { db, FieldValue } = require("../../firebase/firebaseAdmin");

/** 6-digit numeric code */
function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** hash code for storage */
async function hashCode(code) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(code, salt);
}

/** create an OTP doc (purpose: 'reset') and return {otpId, code, expiresAt} */
async function createEmailOtp({ employeeRefPath, emailLower, ttlSec = 10 * 60 }) {
  const code = genCode();
  const hash = await hashCode(code);
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  const otpDoc = {
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    purpose: "reset",
    channel: "email",
    emailLower,
    employeeRefPath,    // e.g. `employees/abc123`
    codeHash: hash,
    attempts: 0,
    usedAt: null,
    status: "pending",  // 'pending' | 'used' | 'expired' | 'blocked'
  };

  const ref = await db.collection("otp").add(otpDoc);
  return { otpId: ref.id, code, expiresAt };
}

/** fetch latest pending OTP for email */
async function getLatestPendingOtp(emailLower) {
  const snap = await db.collection("otp")
    .where("emailLower", "==", emailLower)
    .where("purpose", "==", "reset")
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

module.exports = {
  genCode,
  createEmailOtp,
  getLatestPendingOtp,
};