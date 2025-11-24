// backend/src/util/db.js
import sql from "mssql";

// --- Config BD principal (FacturacionCBMedic) ---
const mainConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,      // 10.33.10.230
  database: process.env.SQL_DATABASE,  // FacturacionCBMedic
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  // timeouts (ms)
  requestTimeout: 300000,      // 5 minutos por si alguna consulta pesada
  connectionTimeout: 30000,    // 30 s para conectar
};

// --- Config BD cbmedic (productiva) ---
const cbmedicConfig = {
  user: process.env.SQL_CBMEDIC_USER || process.env.SQL_USER,
  password: process.env.SQL_CBMEDIC_PASSWORD || process.env.SQL_PASSWORD,
  server: process.env.SQL_CBMEDIC_SERVER,
  database: process.env.SQL_CBMEDIC_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  // aquí estaba el problema: subimos el timeout de la consulta
  requestTimeout: 300000,      // 5 minutos
  connectionTimeout: 30000,
};

let mainPoolPromise = null;
let cbmedicPoolPromise = null;

/** Conexión a FacturacionCBMedic */
export function getPool() {
  if (!mainPoolPromise) {
    console.log(
      "🔌 Conectando a BD principal:",
      mainConfig.server,
      mainConfig.database
    );
    mainPoolPromise = sql.connect(mainConfig);
  }
  return mainPoolPromise;
}

/** Conexión a cbmedic */
export async function getPoolCbmedic() {
  if (!cbmedicPoolPromise) {
    console.log(
      "🔌 Conectando a BD CBMEDIC:",
      cbmedicConfig.server,
      cbmedicConfig.database
    );
    cbmedicPoolPromise = new sql.ConnectionPool(cbmedicConfig).connect();
  }
  return cbmedicPoolPromise;
}

export { sql };