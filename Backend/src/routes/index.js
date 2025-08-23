// Backend/src/routes/index.js
const { Router } = require("express");
const fs = require("fs");
const path = require("path");

function toKebabLower(s) {
  // "UserAuth" -> "user-auth", "user_auth" -> "user-auth"
  return String(s)
    .replace(/[_\s]+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

module.exports = function mountAllRoutes() {
  const router = Router();
  const root = __dirname;

  /** Keep track of mounted paths to detect collisions */
  const mounted = new Set();

  /** Recursively walk and mount */
  function walk(dir, segs = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // 1) If the folder has an index.js, mount it at /<...segs>
    const hasIndex = entries.some((e) => e.isFile() && e.name === "index.js");
    if (hasIndex && segs.length) {
      const mountPath = "/" + segs.map(toKebabLower).join("/");
      if (!mounted.has(mountPath)) {
        const mod = require(path.join(dir, "index.js"));
        router.use(mountPath, mod);
        mounted.add(mountPath);
      } else {
        console.warn(`[routes] Duplicate mount skipped: ${mountPath}`);
      }
    }

    // 2) Mount each .js file (except index.js) at /<...segs>/<fileBase>
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".js") && entry.name !== "index.js") {
        const fileBase = entry.name.replace(/\.js$/, "");

        // Special case: if the file name equals the last segment (e.g., Users/users.js),
        // mount at the folder path (same as having an index.js)
        const segsOut =
          segs.length && toKebabLower(fileBase) === toKebabLower(segs[segs.length - 1])
            ? segs
            : [...segs, fileBase];

        const mountPath = "/" + segsOut.map(toKebabLower).join("/");
        if (!mounted.has(mountPath)) {
          const mod = require(path.join(dir, entry.name));
          router.use(mountPath, mod);
          mounted.add(mountPath);
        } else {
          console.warn(`[routes] Duplicate mount skipped: ${mountPath}`);
        }
      }
    }

    // 3) Recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...segs, entry.name]);
      }
    }
  }

  // Top-level: mount any top-level files (like your original code)
  const topEntries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of topEntries) {
    if (entry.isFile() && entry.name.endsWith(".js") && entry.name !== "index.js") {
      const fileBase = entry.name.replace(/\.js$/, "");
      const mountPath = "/" + toKebabLower(fileBase);
      if (!mounted.has(mountPath)) {
        const mod = require(path.join(root, entry.name));
        router.use(mountPath, mod);
        mounted.add(mountPath);
      } else {
        console.warn(`[routes] Duplicate mount skipped: ${mountPath}`);
      }
    }
  }

  // Then walk subfolders
  for (const entry of topEntries) {
    if (entry.isDirectory()) {
      walk(path.join(root, entry.name), [entry.name]);
    }
  }

  return router;
};