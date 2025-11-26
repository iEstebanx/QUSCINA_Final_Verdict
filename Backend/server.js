// QUSCINA_BACKOFFICE/Backend/server.js
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

/**
 * CORS: allow
 *  - local dev (localhost, LAN)
 *  - your Vercel frontend (main + preview URLs)
 *  - your own Railway domain (if ever needed)
 */
const allowedOrigins = [
  // 🔹 Your production Vercel domain
  "https://quscina-backoffice.vercel.app",

  // 🔹 Preview deployments for this project
  /^https:\/\/quscina-backoffice-[a-z0-9-]+\.vercel\.app$/,

  // 🔹 Local dev / Vite
  "http://localhost:5173",
  "http://localhost:5000",
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/,
  /^capacitor:\/\/localhost$/,

  // 🔹 Your own backend on Railway (internal calls)
  /^https:\/\/quscinabackofficebackend-production\.up\.railway\.app$/,
];

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser (curl, Postman) → no Origin header → allow
      if (!origin) return callback(null, true);

      const ok = allowedOrigins.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin
      );

      if (ok) {
        return callback(null, true);
      }

      console.warn("[CORS] blocked:", origin);
      // ❗ Do NOT throw an error here, just deny CORS silently
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-App",
      "X-Requested-With",
    ],
  })
);

// Optional: handle preflight explicitly
app.options("*", cors());

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
 */

try {
  const authModuleFactory = require("./src/auth/auth");
  if (typeof authModuleFactory === "function") {
    app.use("/api/auth", authModuleFactory({ db }));
  } else {
    console.warn("⚠️ ./src/auth/auth did not export a factory function");
  }
} catch (err) {
  console.warn("⚠️ Auth module missing or failed to load:", err?.message || err);
}

try {
  const mountRoutes = require("./src/routes");
  app.use("/api", typeof mountRoutes === "function" ? mountRoutes({ db }) : mountRoutes);
} catch (err) {
  console.warn("⚠️ API routes missing or failed to load:", err?.message || err);
}

// 404 for unknown /api paths
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// ✅ Boot
const PORT = Number(process.env.PORT) || 5000;
const IS_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT;

(async () => {
  try {
    if (IS_RAILWAY) {
      try {
        await ping();
        console.log("✅ [Railway] DB ping OK");
      } catch (e) {
        console.warn("⚠️ [Railway] DB ping failed at startup:", e.message);
      }
    } else {
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