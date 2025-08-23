// Backend/src/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../lib/firebaseAdmin");

const router = express.Router();
const DEBUG = process.env.DEBUG_AUTH === "1";

// ---------- utils ----------
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
  // FIX: point to "employees"
  const snap = await db.collection("employees").where(field, "==", value).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const user = { id: doc.id, ...doc.data() };
  if (DEBUG) console.log("[AUTH] matched field:", field, "value:", value, "doc:", doc.id);
  return user;
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
  const lower = raw.toLowerCase();
  const looksNumeric = /^\d+$/.test(raw);
  const asNumber = looksNumeric ? Number(raw) : null;

  let probes = [];
  if (primary === "email") {
    probes = [
      ["emailLower", lower],
      ["email", lower],
      ["email", raw],
      ["usernameLower", lower],
      ["username", raw],
    ];
  } else if (primary === "employeeId") {
    probes = [
        ["employeeId", raw],        // string match FIRST (your screenshot)
        ["employeeId", asNumber],   // numeric fallback
        ["usernameLower", lower],
        ["emailLower", lower],
        ["email", raw],
    ];
  } else {
    // username primary
    probes = [
      ["usernameLower", lower],
      ["username", raw],
      ["emailLower", lower],
      ["email", raw],
      ["employeeId", asNumber],
      ["employeeId", raw],
    ];
  }

  if (DEBUG) console.log("[AUTH] probes:", probes);
  const user = await tryProbes(probes);
  if (!user) return null;

  // Default-permissive loginVia (only block if explicitly false)
  const via = user.loginVia || {};
  const ok =
    (primary === "email"      && via.email      !== false) ||
    (primary === "username"   && via.username   !== false) ||
    (primary === "employeeId" && via.employeeId !== false) ||
    (via.email !== false && via.username !== false && via.employeeId !== false);

  return ok ? user : null;
}

// Normalize password: trim accidental outer whitespace only
function sanitizePassword(pw) {
  if (typeof pw !== "string") return "";
  return pw.replace(/^\s+|\s+$/g, "");
}

// Pick hash from multiple possible field names
function getPasswordHash(user) {
  return (
    user.passwordHash ||
    user.passwordhash ||      // <-- matches what your screenshot likely shows
    user.passHash ||
    user.hash ||
    null
  );
}

// ---------- routes ----------

router.post("/login", async (req, res, next) => {
  try {
    const { identifier, password, remember } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: "identifier and password are required" });
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      if (DEBUG) console.log("[AUTH] user not found for identifier:", identifier);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (String(user.status || "").toLowerCase() !== "active") {
      if (DEBUG) console.log("[AUTH] blocked: inactive status:", user.status);
      return res.status(403).json({ error: "Account is not active" });
    }
    if (!["admin", "manager"].includes(String(user.role || "").toLowerCase())) {
      if (DEBUG) console.log("[AUTH] blocked: role:", user.role);
      return res.status(403).json({ error: "Not authorized for Admin Dashboard" });
    }

    const hash = getPasswordHash(user);
    if (!hash) {
      if (DEBUG) console.log("[AUTH] no password hash on user doc");
      return res.status(401).json({ error: "Password not set" });
    }

    const pw = sanitizePassword(password);
    const ok = await bcrypt.compare(pw, hash);
    if (!ok) {
      if (DEBUG) console.log("[AUTH] bcrypt mismatch");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = makeToken(user);

    if (remember) {
      res.cookie("qd_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // true if HTTPS
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
    if (DEBUG) console.error("[AUTH] error:", e);
    next(e);
  }
});

router.get("/me", (req, res) => {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const token = bearer || req.cookies?.qd_token || null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ ok: true, user: payload });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = () => router;
