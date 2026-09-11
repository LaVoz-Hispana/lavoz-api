import mysql from "mysql";
import "dotenv/config";

// Transactions must not interleave on the legacy shared connection.
export const notificationPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: process.env.DB_CHARSET || "UTF8MB4_GENERAL_CI",
  flags: "-FOUND_ROWS",
  connectionLimit: 4,
});

export const query = (connection, sql, values = []) => new Promise((resolve, reject) => {
  connection.query(sql, values, (error, result) => error ? reject(error) : resolve(result));
});

export const getConnection = () => new Promise((resolve, reject) => {
  notificationPool.getConnection((error, connection) => error ? reject(error) : resolve(connection));
});

export async function withTransaction(work) {
  const connection = await getConnection();
  try {
    await query(connection, "START TRANSACTION");
    const result = await work((sql, values) => query(connection, sql, values));
    await query(connection, "COMMIT");
    return result;
  } catch (error) {
    try { await query(connection, "ROLLBACK"); } catch { connection.destroy(); }
    throw error;
  } finally {
    connection.release();
  }
}
