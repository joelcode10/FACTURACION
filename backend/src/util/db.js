// backend/src/util/db.js
import dotenv from "dotenv";
dotenv.config(); // 👈 Asegura que las variables de entorno estén cargadas

import sql from "mssql";

// Opcional: log rápido para depurar una sola vez
console.log("🔧 Config SQL:");
console.log("  SQL_SERVER   =", process.env.SQL_SERVER);
console.log("  SQL_DATABASE =", process.env.SQL_DATABASE);
console.log("  SQL_USER     =", process.env.SQL_USER);

// Configuración de SQL Server tomando los valores desde .env
const config = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,      // Ej: LAPTOP-TVE7FV9J
  database: process.env.SQL_DATABASE,  // Ej: FacturacionCBMedic
  options: {
    encrypt: false,                    // En local normalmente false
    trustServerCertificate: true,
  },
};

let poolPromise = null;

/**
 * Devuelve (y reutiliza) el pool de conexión a SQL Server.
 */
export async function getPool() {
  if (!poolPromise) {
    if (!config.server || typeof config.server !== "string") {
      throw new Error(
        `Config SQL inválida. Revisa SQL_SERVER en .env (valor actual: ${config.server})`
      );
    }
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

export { sql };
