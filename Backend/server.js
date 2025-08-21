// Backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// health stays here so it never breaks
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// mount all route files under /api
app.use("/api", require("./src/routes")());

// 404 for unknown /api paths
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// global error handler
app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));