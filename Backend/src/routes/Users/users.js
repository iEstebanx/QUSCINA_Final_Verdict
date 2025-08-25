// Backend/src/routes/Users/users.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { db, FieldValue, Timestamp } = require("../../lib/firebaseAdmin");

const SALT_ROUNDS = 12;

// 🔐 Supported questions (must match frontend)
const SQ_CATALOG = {
  pet: "What is the name of your first pet?",
  school: "What is the name of your elementary school?",
  city: "In what city were you born?",
  mother_maiden: "What is your mother’s maiden name?",
  nickname: "What was your childhood nickname?",
};

function aliasKey(type, value) {
  return `${type}:${String(value || "").trim().toLowerCase()}`;
}

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => {
    if (obj?.[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

// Normalize answers (case/space-insensitive by design)
function normalizeAnswer(s) {
  return String(s || "").trim().toLowerCase();
}

// Build validated + hashed SQ entries
// `when` must be a concrete Timestamp (not FieldValue.serverTimestamp())
async function buildSQEntries(inputArr, when) {
  if (!Array.isArray(inputArr)) return undefined; // not provided
  if (inputArr.length === 0) return []; // allow clearing

  const items = (inputArr ?? []).filter(
    (q) => !!q?.id && typeof q?.answer === "string" && q.answer.trim().length > 0
  );
  if (items.length > 2) throw new Error("You can only set up to 2 security questions.");

  const ids = items.map((q) => q.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Security questions must be different.");
  }

  const out = [];
  for (const q of items) {
    if (!SQ_CATALOG[q.id]) throw new Error("Unknown security question id.");
    const norm = normalizeAnswer(q.answer);
    if (!norm) throw new Error("Security question answers cannot be empty.");
    const answerHash = await bcrypt.hash(norm, SALT_ROUNDS);
    out.push({ id: q.id, question: SQ_CATALOG[q.id], answerHash, updatedAt: when });
  }
  return out;
}

/* ===========================
   Helpers to reduce complexity
   =========================== */

function mergeLoginVia(currentLoginVia = { employeeId: true, username: true, email: true }, nextLoginVia = {}) {
  return {
    employeeId: !!(nextLoginVia.employeeId ?? currentLoginVia.employeeId),
    username: !!(nextLoginVia.username ?? currentLoginVia.username),
    email: !!(nextLoginVia.email ?? currentLoginVia.email),
  };
}

function makeAliases(loginVia, username, email, employeeId) {
  const keys = [];
  if (loginVia.employeeId) keys.push(aliasKey("employee_id", employeeId));
  if (loginVia.username && username) keys.push(aliasKey("username", username));
  if (loginVia.email && email) keys.push(aliasKey("email", email));
  return keys;
}

function ensureAtLeastOneMethod(loginVia) {
  if (!loginVia.employeeId && !loginVia.username && !loginVia.email) {
    throw new Error("At least one login method must be enabled");
  }
}

async function requireCurrentPasswordIfNeeded(curDoc, hasNewPassword, currentPassword) {
  if (!hasNewPassword) return;
  const hasExisting = !!curDoc?.passwordHash;
  if (!hasExisting) return; // allow set if none before
  if (!currentPassword) {
    const err = new Error("Current password is required.");
    err.statusCode = 400;
    throw err;
  }
  const ok = await bcrypt.compare(currentPassword, curDoc.passwordHash);
  if (!ok) {
    const err = new Error("Current password is incorrect.");
    err.statusCode = 400;
    throw err;
  }
}

function diffAliases(currentKeys, desiredKeys) {
  return {
    toDelete: currentKeys.filter((k) => !desiredKeys.includes(k)),
    toCreate: desiredKeys.filter((k) => !currentKeys.includes(k)),
  };
}

async function assertAliasUniquenessTx(tx, keysToCreate, employeeId) {
  for (const key of keysToCreate) {
    const aref = db.collection("aliases").doc(key);
    const a = await tx.get(aref);
    if (a.exists && a.data()?.employeeId !== String(employeeId)) {
      throw new Error("Credential (alias) already in use");
    }
  }
}

async function buildUpdateDoc({
  cur,
  next,
  newUsername,
  newEmail,
  desiredLoginVia,
  hasNewPassword,
  hasNewPin,
  patch,
  now, // serverTimestamp sentinel
  sqProvided,
  sqEntries, // [] or array or undefined
}) {
  const updateDoc = {
    ...next,
    username: newUsername,
    email: newEmail,
    loginVia: desiredLoginVia,
    updatedAt: now,
  };

  if (hasNewPassword) {
    updateDoc.passwordHash = await bcrypt.hash(patch.password, SALT_ROUNDS);
    updateDoc.passwordLastChanged = now;
  }
  if (hasNewPin) {
    updateDoc.pinHash = await bcrypt.hash(patch.pin, SALT_ROUNDS);
  }
  if (sqProvided) {
    updateDoc.securityQuestions = sqEntries; // replace with [] or array
  }
  return { ...cur, ...updateDoc };
}

function applyAliasWritesTx(tx, { toDelete, toCreate }, now, employeeId) {
  for (const key of toDelete) {
    tx.delete(db.collection("aliases").doc(key));
  }
  for (const key of toCreate) {
    const [type, valueLower] = key.split(":");
    tx.set(db.collection("aliases").doc(key), {
      type,
      valueLower,
      employeeId: String(employeeId),
      createdAt: now,
    });
  }
}

/* ===========================
   Routes
   =========================== */

// GET /api/users  (simple list — omit answer hashes)
router.get("/", async (_req, res) => {
  try {
    const snap = await db.collection("employees").orderBy("createdAt", "desc").get();
    const rows = snap.docs.map((d) => {
      const data = d.data() ?? {};
      const safeSQ = Array.isArray(data.securityQuestions)
        ? data.securityQuestions.map((q) => ({ id: q.id, question: q.question }))
        : [];
      return { id: d.id, ...data, securityQuestions: safeSQ };
    });
    res.json(rows);
  } catch (e) {
    console.error("[GET /api/users] fail:", e);
    res.status(500).json({ error: e?.message ?? "Failed to list users" });
  }
});

// POST /api/users  (create)
router.post("/", async (req, res) => {
  try {
    const {
      employeeId,
      firstName, lastName, phone, role, status,
      username = "", email = "",
      loginVia = { employeeId: true, username: true, email: true },
      password, pin, photoUrl = "",
      securityQuestions = undefined,
    } = req.body;

    // Basic validation (backend must re-check)
    if (!/^\d{9}$/.test(String(employeeId))) return res.status(400).json({ error: "employeeId must be 9 digits" });
    if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: "firstName and lastName are required" });
    if (!/^\d{10,11}$/.test(String(phone || ""))) return res.status(400).json({ error: "phone must be 10–11 digits" });
    if (!role) return res.status(400).json({ error: "role is required" });
    if (!status) return res.status(400).json({ error: "status is required" });
    if (!password || password.length < 8) return res.status(400).json({ error: "password must be at least 8 chars" });
    if (!/^\d{6}$/.test(String(pin || ""))) return res.status(400).json({ error: "pin must be 6 digits" });
    if (!loginVia?.employeeId && !loginVia?.username && !loginVia?.email) {
      return res.status(400).json({ error: "At least one login method must be enabled" });
    }

    const now = FieldValue.serverTimestamp();
    const nowTS = Timestamp.now();
    const employeeRef = db.collection("employees").doc(String(employeeId));

    const uname = String(username || "").trim().toLowerCase();
    const mail = String(email || "").trim();

    const aliasDocsToCreate = [];
    if (loginVia.employeeId) aliasDocsToCreate.push({ ref: db.collection("aliases").doc(aliasKey("employee_id", employeeId)) });
    if (loginVia.username && uname) aliasDocsToCreate.push({ ref: db.collection("aliases").doc(aliasKey("username", uname)) });
    if (loginVia.email && mail) aliasDocsToCreate.push({ ref: db.collection("aliases").doc(aliasKey("email", mail)) });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

    // Prepare SQ entries (may be [], undefined, or array)
    const sqEntries = await buildSQEntries(securityQuestions, nowTS);

    await db.runTransaction(async (tx) => {
      const existingEmployee = await tx.get(employeeRef);
      if (existingEmployee.exists) throw new Error("Employee already exists");

      // check uniqueness for each alias
      for (const { ref } of aliasDocsToCreate) {
        const a = await tx.get(ref);
        if (a.exists) throw new Error("Credential (alias) already in use");
      }

      // create employee
      const doc = {
        employeeId: String(employeeId),
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        phone: String(phone),
        role, status,
        username: uname,
        email: mail,
        loginVia: {
          employeeId: !!loginVia.employeeId,
          username: !!loginVia.username,
          email: !!loginVia.email,
        },
        passwordHash,
        pinHash,
        passwordLastChanged: now,
        photoUrl,
        createdAt: now,
        updatedAt: now,
      };

      if (sqEntries !== undefined) {
        doc.securityQuestions = sqEntries; // set [] or array
      }

      tx.set(employeeRef, doc);

      // create alias docs
      for (const { ref } of aliasDocsToCreate) {
        const [type, valueLower] = ref.id.split(":");
        tx.set(ref, { type, valueLower, employeeId: String(employeeId), createdAt: now });
      }
    });

    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("[POST /api/users] fail:", e);
    res.status(500).json({ error: e?.message ?? "Failed to create user" });
  }
});

// PATCH /api/users/:employeeId  (update + alias maintenance)
router.patch("/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const patch = req.body ?? {};

    const now = FieldValue.serverTimestamp();
    const nowTS = Timestamp.now();
    const employeeRef = db.collection("employees").doc(String(employeeId));

    // Optional sensitive updates (re-hash if provided)
    const next = pick(patch, [
      "firstName", "lastName", "phone", "role", "status",
      "username", "email", "loginVia", "photoUrl",
    ]);

    const hasNewPassword = typeof patch.password === "string" && patch.password.length >= 8;
    const hasNewPin = typeof patch.pin === "string" && /^\d{6}$/.test(patch.pin);
    const currentPassword = typeof patch.currentPassword === "string" ? patch.currentPassword : "";

    // Prepare SQ entries if the field is present (replace semantics)
    const sqProvided = patch != null && Object.hasOwn(patch, "securityQuestions");
    const sqEntries = sqProvided ? await buildSQEntries(patch.securityQuestions, nowTS) : undefined;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(employeeRef);
      if (!snap.exists) throw new Error("Employee not found");
      const cur = snap.data();

      // 🔒 Current-password check (extracted)
      await requireCurrentPasswordIfNeeded(cur, hasNewPassword, currentPassword);

      const desiredLoginVia = mergeLoginVia(cur.loginVia, next.loginVia);
      ensureAtLeastOneMethod(desiredLoginVia);

      const newUsername = (next.username ?? cur.username ?? "").trim().toLowerCase();
      const newEmail = (next.email ?? cur.email ?? "").trim();

      const curAliases = makeAliases(cur.loginVia ?? { employeeId: true, username: true, email: true }, cur.username, cur.email, employeeId);
      const desiredAliases = makeAliases(desiredLoginVia, newUsername, newEmail, employeeId);

      const { toDelete, toCreate } = diffAliases(curAliases, desiredAliases);
      await assertAliasUniquenessTx(tx, toCreate, employeeId);

      const updateDoc = await buildUpdateDoc({
        cur,
        next,
        newUsername,
        newEmail,
        desiredLoginVia,
        hasNewPassword,
        hasNewPin,
        patch,
        now,
        sqProvided,
        sqEntries,
      });

      // Write employee
      tx.set(employeeRef, updateDoc, { merge: true });

      // Delete/Write alias docs
      applyAliasWritesTx(tx, { toDelete, toCreate }, now, employeeId);
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/users/:employeeId] fail:", e);
    const code = e.statusCode ?? 500;
    res.status(code).json({ error: e?.message ?? "Failed to update user" });
  }
});

// DELETE /api/users/:employeeId  (remove user + aliases)
router.delete("/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employeeRef = db.collection("employees").doc(String(employeeId));

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(employeeRef);
      if (!snap.exists) return; // idempotent

      const cur = snap.data() ?? {};
      const aliasKeys = [];
      if (cur.loginVia?.employeeId) aliasKeys.push(aliasKey("employee_id", employeeId));
      if (cur.loginVia?.username && cur.username) aliasKeys.push(aliasKey("username", cur.username));
      if (cur.loginVia?.email && cur.email) aliasKeys.push(aliasKey("email", cur.email));

      aliasKeys.forEach((k) => tx.delete(db.collection("aliases").doc(k)));
      tx.delete(employeeRef);
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/users/:employeeId] fail:", e);
    res.status(500).json({ error: e?.message ?? "Failed to delete user" });
  }
});

module.exports = router;