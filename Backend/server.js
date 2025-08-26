// Backend/server.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const admin = require("firebase-admin");

const app = express();
if (!admin.apps.length) admin.initializeApp();

app.use(express.json());
app.use(cookieParser());

const allowedPatterns = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^capacitor:\/\/localhost$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/,
];

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedPatterns.some(rx => rx.test(origin))) cb(null, true);
    else cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

// health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// routes
app.use("/api/auth", require("./src/routes/auth")());
app.use("/api", require("./src/routes")());

// 404 for unknown /api paths
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// error handler
app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

const { PORT } = process.env;
if (!PORT) {
  console.error("❌ PORT not set. Put PORT=5000 in Backend/.env");
  process.exit(1);
}
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));