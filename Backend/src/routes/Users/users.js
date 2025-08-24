// Backend/src/routes/Users/users.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
// ⬇️ add Timestamp here
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
    if (obj[k] !== undefined) out[k] = obj[k];
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
  // Allow clearing by providing []
  if (inputArr.length === 0) return [];

  // Validate max 2 & unique ids
  const items = inputArr.filter((q) => q && q.id && typeof q.answer === "string");
  if (items.length > 2) throw new Error("You can only set up to 2 security questions.");

  const ids = items.map((q) => q.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) throw new Error("Security questions must be different.");

  // Validate IDs and hash answers
  const out = [];
  for (const q of items) {
    if (!SQ_CATALOG[q.id]) throw new Error("Unknown security question id.");
    const norm = normalizeAnswer(q.answer);
    if (!norm) throw new Error("Security question answers cannot be empty.");
    const answerHash = await bcrypt.hash(norm, SALT_ROUNDS);
    out.push({
      id: q.id,
      question: SQ_CATALOG[q.id],
      answerHash,
      // ✅ concrete timestamp allowed in arrays
      updatedAt: when,
    });
  }
  return out;
}

// GET /api/users  (simple list — omit answer hashes)
router.get("/", async (_req, res) => {
  try {
    const snap = await db.collection("employees").orderBy("createdAt", "desc").get();
    const rows = snap.docs.map((d) => {
      const data = d.data() || {};
      const safeSQ = Array.isArray(data.securityQuestions)
        ? data.securityQuestions.map((q) => ({ id: q.id, question: q.question }))
        : [];
      return {
        id: d.id,
        ...data,
        securityQuestions: safeSQ, // hide hashes
      };
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to list users" });
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
      securityQuestions = undefined, // <- NEW
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

    // ⬇️ use both: sentinel for doc-level, concrete for array items
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
    res.status(500).json({ error: e.message || "Failed to create user" });
  }
});

// PATCH /api/users/:employeeId  (update + alias maintenance)
router.patch("/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const patch = req.body || {};

    // helper to return 400s from inside the transaction path
    const badRequest = (msg) => Object.assign(new Error(msg), { statusCode: 400 });

    // ⬇️ use both timestamp types here too
    const now = FieldValue.serverTimestamp();
    const nowTS = Timestamp.now();

    const employeeRef = db.collection("employees").doc(String(employeeId));

    // Optional sensitive updates (re-hash if provided)
    const next = pick(patch, [
      "firstName", "lastName", "phone", "role", "status",
      "username", "email", "loginVia", "photoUrl"
    ]);

    const hasNewPassword = typeof patch.password === "string" && patch.password.length >= 8;
    const hasNewPin = typeof patch.pin === "string" && /^\d{6}$/.test(patch.pin);
    const currentPassword = typeof patch.currentPassword === "string" ? patch.currentPassword : "";

    // Prepare SQ entries if the field is present (replace semantics)
    const sqProvided = Object.prototype.hasOwnProperty.call(patch, "securityQuestions");
    const sqEntries = sqProvided ? await buildSQEntries(patch.securityQuestions, nowTS) : undefined;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(employeeRef);
      if (!snap.exists) throw new Error("Employee not found");
      const cur = snap.data();

      // 🔒 If password is being changed, require correct currentPassword
      if (hasNewPassword) {
        const hasExisting = !!cur.passwordHash;
        if (hasExisting) {
          if (!currentPassword) throw badRequest("Current password is required.");
          const ok = await bcrypt.compare(currentPassword, cur.passwordHash);
          if (!ok) throw badRequest("Current password is incorrect.");
        } else {
          // Optional: block setting password without a current one
          // or allow it — choose one. Here we allow it.
        }
      }

      const currentLoginVia = cur.loginVia || { employeeId: true, username: true, email: true };
      const desiredLoginVia = { ...currentLoginVia, ...(next.loginVia || {}) };

      // Compute current & desired aliases
      const curAliases = [];
      if (currentLoginVia.employeeId) curAliases.push(aliasKey("employee_id", employeeId));
      if (currentLoginVia.username && cur.username) curAliases.push(aliasKey("username", cur.username));
      if (currentLoginVia.email && cur.email) curAliases.push(aliasKey("email", cur.email));

      const newUsername = (next.username ?? cur.username ?? "").trim().toLowerCase();
      const newEmail = (next.email ?? cur.email ?? "").trim();

      const desiredAliases = [];
      if (desiredLoginVia.employeeId) desiredAliases.push(aliasKey("employee_id", employeeId));
      if (desiredLoginVia.username && newUsername) desiredAliases.push(aliasKey("username", newUsername));
      if (desiredLoginVia.email && newEmail) desiredAliases.push(aliasKey("email", newEmail));

      if (!desiredLoginVia.employeeId && !desiredLoginVia.username && !desiredLoginVia.email) {
        throw new Error("At least one login method must be enabled");
      }

      // Aliases to delete/create
      const toDelete = curAliases.filter((k) => !desiredAliases.includes(k));
      const toCreate = desiredAliases.filter((k) => !curAliases.includes(k));

      // Uniqueness checks for toCreate
      for (const key of toCreate) {
        const aref = db.collection("aliases").doc(key);
        const a = await tx.get(aref);
        if (a.exists && a.data().employeeId !== String(employeeId)) {
          throw new Error("Credential (alias) already in use");
        }
      }

      const updateDoc = {
        ...cur,
        ...next,
        username: newUsername,
        email: newEmail,
        loginVia: desiredLoginVia,
        updatedAt: now,
      };

      // Handle password / pin changes
      if (hasNewPassword) {
        updateDoc.passwordHash = await bcrypt.hash(patch.password, SALT_ROUNDS);
        updateDoc.passwordLastChanged = now;
      }
      if (hasNewPin) {
        updateDoc.pinHash = await bcrypt.hash(patch.pin, SALT_ROUNDS);
      }

      // Replace/clear security questions if provided
      if (sqProvided) {
        updateDoc.securityQuestions = sqEntries; // [] or array
      }

      // Write employee
      tx.set(employeeRef, updateDoc, { merge: true });

      // Delete/Write alias docs
      for (const key of toDelete) {
        tx.delete(db.collection("aliases").doc(key));
      }
      for (const key of toCreate) {
        const [type, valueLower] = key.split(":");
        tx.set(db.collection("aliases").doc(key), {
          type, valueLower, employeeId: String(employeeId), createdAt: now
        });
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/users/:employeeId] fail:", e);
    const code = e.statusCode || 500;
    res.status(code).json({ error: e.message || "Failed to update user" });
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
      const cur = snap.data();
      const aliasKeys = [];
      if (cur.loginVia?.employeeId) aliasKeys.push(aliasKey("employee_id", employeeId));
      if (cur.loginVia?.username && cur.username) aliasKeys.push(aliasKey("username", cur.username));
      if (cur.loginVia?.email && cur.email) aliasKeys.push(aliasKey("email", cur.email));

      aliasKeys.forEach((k) => tx.delete(db.collection("aliases").doc(k)));
      tx.delete(employeeRef);
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete user" });
  }
});

module.exports = router;