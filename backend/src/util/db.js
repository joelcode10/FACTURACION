// backend/src/util/db.js
import sql from "mssql";

// --- Config BD principal (FacturacionCBMedic) ---
const mainConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,      // 10.33.10.230
  
  // 🔴 ANTES (Posible causa del error si el .env dice 'cbmedic'):
  // database: process.env.SQL_DATABASE, 
  
  // 🟢 AHORA (Forzamos la conexión a la BD correcta):
  database: 'FacturacionCBMedic', 

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
  // Si tus credenciales son las mismas, puedes dejarlo así, o usar las específicas
  user: process.env.SQL_CBMEDIC_USER || process.env.SQL_USER,
  password: process.env.SQL_CBMEDIC_PASSWORD || process.env.SQL_PASSWORD,
  server: process.env.SQL_CBMEDIC_SERVER || process.env.SQL_SERVER,
  
  // Esta SÍ debe apuntar a cbmedic (datos clínicos)
  database: 'cbmedic', // O process.env.SQL_CBMEDIC_DATABASE si prefieres

  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  requestTimeout: 300000,      // 5 minutos
  connectionTimeout: 30000,
};

let mainPoolPromise = null;
let cbmedicPoolPromise = null;

/** Conexión a FacturacionCBMedic (Administrativa) */
export function getPool() {
  if (!mainPoolPromise) {
    console.log(
      "🔌 Conectando a BD principal (Facturacion):",
      mainConfig.server,
      mainConfig.database
    );
    mainPoolPromise = sql.connect(mainConfig);
  }
  return mainPoolPromise;
}

/** Conexión a cbmedic (Clínica) */
export async function getPoolCbmedic() {
  if (!cbmedicPoolPromise) {
    console.log(
      "🔌 Conectando a BD CBMEDIC (Clínica):",
      cbmedicConfig.server,
      cbmedicConfig.database
    );
    cbmedicPoolPromise = new sql.ConnectionPool(cbmedicConfig).connect();
  }
  return cbmedicPoolPromise;
}

export { sql };