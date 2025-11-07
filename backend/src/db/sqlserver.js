// backend/src/db/sqlserver.js
import sql from "mssql";

const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,      // LAPTOP-TVE7FV9J
  database: process.env.SQL_DATABASE,  // FacturacionCBMedic
  options: {
    encrypt: false,                    // en local suele ser false
    trustServerCertificate: true,
  },
};

let poolPromise = null;

export async function getPool() {
  if (!poolPromise) {
    console.log(
      "🔗 Conectando a SQL Server:",
      sqlConfig.server,
      sqlConfig.database
    );
    poolPromise = sql.connect(sqlConfig);
  }
  return poolPromise;
}

export { sql };
