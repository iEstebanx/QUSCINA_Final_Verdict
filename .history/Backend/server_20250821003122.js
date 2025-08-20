// Backend/server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const discountsRouter = require("./src/routes/discounts");

const app = express();
app.use(cors());
app.use(express.json());

// mount routers
app.use("/api/discounts", discountsRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));