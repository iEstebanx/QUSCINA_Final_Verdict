// Backend/src/routes/index.js
const { Router } = require("express");
const fs = require("fs");
const path = require("path");

module.exports = function mountAllRoutes() {
  const router = Router();
  const dir = __dirname;

  for (const file of fs.readdirSync(dir)) {
    if (file === "index.js" || !file.endsWith(".js")) continue;
    const name = file.replace(/\.js$/, "");      // e.g. "discounts"
    const mod = require(path.join(dir, file));   // must export an Express router
    router.use(`/${name}`, mod);
  }

  return router;
};