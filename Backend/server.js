// Backend/server.js
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

// Allowed origins for local dev + LAN (Vite proxy hits from http://localhost:5173)
const allowedPatterns = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^capacitor:\/\/localhost$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedPatterns.some((rx) => rx.test(origin))) cb(null, true);
      else cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true
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
const { PORT } = process.env;
if (!PORT) {
  console.error("❌ PORT not set. Put PORT=5000 in Backend/.env");
  process.exit(1);
}

(async () => {
  try {
    await ping(); // fail fast if DB creds are wrong
    app.listen(PORT, () => {
      console.log(`🚀 API running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error("❌ Failed DB ping on startup:", e.message);
    process.exit(1);
  }
})();