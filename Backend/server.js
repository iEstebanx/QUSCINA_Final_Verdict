// Backend/server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ health FIRST — guaranteed to work even if other modules fail
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Try to mount the router, but don't crash the whole server if it fails
try {
  const discountsRouter = require("./src/routes/discounts");
  app.use("/api/discounts", discountsRouter);
} catch (err) {
  console.error("Failed to mount /api/discounts:", err);
}

// JSON 404 for any other /api path
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// global error handler
app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));