// Backend/src/routes/index.js
const { Router } = require("express");
const fs = require("fs");
const path = require("path");

// ⬇️ NEW: import shared DB so we can inject it
let sharedDb = null;
try {
  sharedDb = require("../shared/db/mysql").db;
} catch { /* will be provided by server.js DI in some setups */ }

// Convert "UserAuth" -> "user-auth", "user_auth" -> "user-auth"
function toKebabLower(s) {
  return String(s)
    .replace(/[_\s]+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

// Mount helper: supports either a router instance OR a factory function
function mountWithDb(router, mountPath, mod, db) {
  try {
    const candidate = (mod && mod.__esModule && mod.default) ? mod.default : mod;
    if (typeof candidate === "function") {
      // Factory style: export default (opts) => Router
      router.use(mountPath, candidate({ db }));
    } else {
      // Direct router instance
      router.use(mountPath, candidate);
    }
  } catch (e) {
    console.error(`[routes] Failed to mount ${mountPath}:`, e);
  }
}

module.exports = function mountAllRoutes({ db } = {}) {
  db = db || sharedDb; // fallback if not DI'd
  const router = Router();
  const root = __dirname;
  const mounted = new Set();

  function walk(dir, segs = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // 1) If folder has index.js, mount at /<...segs>
    const hasIndex = entries.some((e) => e.isFile() && e.name === "index.js");
    if (hasIndex && segs.length) {
      const mountPath = "/" + segs.map(toKebabLower).join("/");
      if (!mounted.has(mountPath)) {
        const mod = require(path.join(dir, "index.js"));
        mountWithDb(router, mountPath, mod, db);
        mounted.add(mountPath);
      } else {
        console.warn(`[routes] Duplicate mount skipped: ${mountPath}`);
      }
    }

    // 2) Mount each .js file (except index.js)
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".js") && entry.name !== "index.js") {
        const fileBase = entry.name.replace(/\.js$/, "");
        const segsOut =
          segs.length && toKebabLower(fileBase) === toKebabLower(segs[segs.length - 1])
            ? segs
            : [...segs, fileBase];

        const mountPath = "/" + segsOut.map(toKebabLower).join("/");
        if (!mounted.has(mountPath)) {
          const mod = require(path.join(dir, entry.name));
          mountWithDb(router, mountPath, mod, db);
          mounted.add(mountPath);
        } else {
          console.warn(`[routes] Duplicate mount skipped: ${mountPath}`);
        }
      }
    }

    // 3) Recurse subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...segs, entry.name]);
      }
    }
  }

  // Top-level files
  const topEntries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of topEntries) {
    if (entry.isFile() && entry.name.endsWith(".js") && entry.name !== "index.js") {
      const fileBase = entry.name.replace(/\.js$/, "");
      const mountPath = "/" + toKebabLower(fileBase);
      if (!mounted.has(mountPath)) {
        const mod = require(path.join(root, entry.name));
        mountWithDb(router, mountPath, mod, db);
        mounted.add(mountPath);
      } else {
        console.warn(`[routes] Duplicate mount skipped: ${mountPath}`);
      }
    }
  }

  // Then subfolders
  for (const entry of topEntries) {
    if (entry.isDirectory()) {
      walk(path.join(root, entry.name), [entry.name]);
    }
  }

  return router;
};