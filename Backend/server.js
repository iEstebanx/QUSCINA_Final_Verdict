// Backoffice/Backend/server.js
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// ⬇️ MySQL pool + health ping
const { db, ping } = require("./src/shared/db/mysql");

// ✅ create app FIRST
const app = express();

// Trust proxy if you ever place this behind Nginx, etc.
app.set("trust proxy", true);

// Core middleware
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Allowed origins for local dev, LAN, Vercel, Railway domain
const allowedPatterns = [
  /^http:\/\/localhost(?::\d+)?$/,                   // local dev
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,                // local dev
  /^capacitor:\/\/localhost$/,                      // mobile
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/,  // LAN
  /^http:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/,           // LAN
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,             // any Vercel app
  /^https:\/\/quscinabackofficebackend-production\.up\.railway\.app$/,
];

// 🔹 Explicit frontend origin (env or fallback)
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://quscina-backoffice.vercel.app";

app.use(
  cors({
    origin(origin, cb) {
      // allow server-to-server / curl / Postman (no Origin header)
      if (!origin) {
        console.log("[CORS] no origin (server-to-server) -> allowed");
        return cb(null, true);
      }

      const matchPattern = allowedPatterns.some((rx) => rx.test(origin));
      const matchFrontend = origin === FRONTEND_ORIGIN;

      console.log("[CORS] incoming origin:", origin, {
        matchPattern,
        matchFrontend,
        FRONTEND_ORIGIN,
      });

      if (matchPattern || matchFrontend) {
        console.log("[CORS] allowed:", origin);
        return cb(null, true);
      }

      const err = new Error(`CORS blocked: ${origin}`);
      console.error("[CORS] BLOCKED:", origin);
      return cb(err);
    },
    credentials: true,
  })
);

// 🔄 Health check (also verifies DB connectivity)
app.get("/api/health", async (_req, res) => {
  try {
    const ok = await ping();
    res.json({ ok: true, db: ok ? "up" : "down" });
  } catch (e) {
    res.status(500).json({ ok: false, db: "down", error: e.message });
  }
});

/**
 * 🔌 ROUTES
 * IMPORTANT: Mount /api/auth BEFORE the generic /api router so /api/auth/*
 * does not get swallowed by a catch-all 404 in the generic router.
 */

// Auth routes (expects { db })
try {
  const authModuleFactory = require("./src/auth/auth");
  if (typeof authModuleFactory === "function") {
    app.use("/api/auth", authModuleFactory({ db }));
  } else {
    console.warn("⚠️ ./src/auth/auth did not export a factory function; /api/auth not mounted.");
  }
} catch (err) {
  console.warn("⚠️ Auth module missing or failed to load:", err?.message || err);
}

// Generic API routes (auto-mounter). Pass { db } if your router expects it.
try {
  const mountRoutes = require("./src/routes");
  app.use("/api", typeof mountRoutes === "function" ? mountRoutes({ db }) : mountRoutes);
} catch (err) {
  console.warn("⚠️ API routes missing or failed to load:", err?.message || err);
}

// 404 for unknown /api paths (keep AFTER mounts)
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Global error handler (last)
app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// ✅ Boot
// Prefer the platform port (Railway sets PORT), fall back to 5000 for local dev.
const PORT = Number(process.env.PORT) || 5000;

// Detect if we are running on Railway
const IS_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT;

(async () => {
  try {
    if (IS_RAILWAY) {
      // On Railway: try to ping DB, but don't kill the process if it fails.
      try {
        await ping();
        console.log("✅ [Railway] DB ping OK");
      } catch (e) {
        console.warn("⚠️ [Railway] DB ping failed at startup (continuing):", e.message);
      }
    } else {
      // Local dev / other environments: fail fast if DB is misconfigured.
      await ping();
      console.log("✅ DB ping OK");
    }

    app.listen(PORT, () => {
      console.log(`🚀 API running on port ${PORT}`);
    });
  } catch (e) {
    console.error("❌ Failed during startup:", e.message);
    process.exit(1);
  }
})();