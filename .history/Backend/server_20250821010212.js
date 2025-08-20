// Backend/server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Health first so you can always verify server is UP
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Start listening ASAP so import-time errors don't prevent boot
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
});

// Try to load and mount routes; if they fail, keep server running
try {
  const discountsRouter = require("./src/routes/discounts");
  app.use("/api/discounts", discountsRouter);
} catch (e) {
  console.error("[ROUTES LOAD ERROR] Failed to mount /api/discounts:", e);
}

// JSON 404 for unknown /api/* to avoid HTML/empty bodies
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Global error handler (always returns JSON)
app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: err?.message || "Internal Server Error" });
});

// Extra: log unhandled promise rejections instead of crashing the process
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});