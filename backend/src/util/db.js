// backend/src/util/db.js
import sql from "mssql";

// 🧩 Configuración base común
const baseConfig = {
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// 💾 Conexión principal: Facturación (tu base local)
const configFacturacion = {
  ...baseConfig,
  user: process.env.SQL_USER || "sa",
  password: process.env.SQL_PASSWORD || "joelsql",
  server: process.env.SQL_SERVER || "LAPTOP-TVE7FV9J",
  database: process.env.SQL_DATABASE || "FacturacionCBMedic",
};

// 💾 Conexión secundaria: CBMEDIC (servidor hospital)
const configCbmedic = {
  ...baseConfig,
  user: process.env.SQL_CBMEDIC_USER || "sa",
  password: process.env.SQL_CBMEDIC_PASSWORD || "#Integramedica2023",
  server: process.env.SQL_CBMEDIC_SERVER || "10.33.10.230",
  database: process.env.SQL_CBMEDIC_DATABASE || "cbmedic",
};

// 🧠 Caches de conexión
let poolFacturacion = null;
let poolCbmedic = null;

// ======== EXPORTS ========

// 👉 conexión a tu BD local
export async function getPool() {
  if (!poolFacturacion) {
    poolFacturacion = await sql.connect(configFacturacion);
    console.log("✅ Conectado a BD Facturación");
  }
  return poolFacturacion;
}

// 👉 conexión a la BD cbmedic
export async function getPoolCbmedic() {
  if (!poolCbmedic) {
    poolCbmedic = await new sql.ConnectionPool(configCbmedic).connect();
    console.log("✅ Conectado a BD CBMEDIC");
  }
  return poolCbmedic;
}

// Exporta sql para tipos
export { sql };
