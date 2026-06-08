const mysql = require("mysql2/promise");

/**
 * Pool MySQL (mysql2/promise)
 * Requiere variables de entorno:
 *  - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "phototop",
  password: process.env.DB_PASSWORD || "phototop",
  database: process.env.DB_NAME || "phototop",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10,
  queueLimit: 0,
});

module.exports = pool;
