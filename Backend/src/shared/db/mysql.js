// Backend/src/shared/db/mysql.js
// Simple MySQL helper for pooled queries and transactions
const mysql = require("mysql2/promise");

// Required envs:
// DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
const {
  DB_HOST,
  DB_PORT = "3306",
  DB_USER,
  DB_PASSWORD,
  DB_NAME
} = process.env;

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error(
    "❌ DB env missing. Provide DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (and optional DB_PORT)."
  );
  process.exit(1);
}

// Create a single shared pool for the entire process
const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  // important for time/tz correctness; adjust if needed
  timezone: "Z"
});

// Basic query helper
async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Transaction helper
async function tx(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Quick health ping
async function ping() {
  const [rows] = await pool.query("SELECT 1 AS ok");
  return rows && rows[0] && rows[0].ok === 1;
}

module.exports = {
  db: { pool, query, tx },
  ping
};