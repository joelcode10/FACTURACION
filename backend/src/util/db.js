// backend/src/util/db.js
import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

/**      
 * Config BD Local (FacturacionCBMedic)
 */
const localConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

/**
 * Config BD CBMEDIC
 */
const cbmedicConfig = {
  user: process.env.SQL_CBMEDIC_USER,
  password: process.env.SQL_CBMEDIC_PASSWORD,
  server: process.env.SQL_CBMEDIC_SERVER,
  database: process.env.SQL_CBMEDIC_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let localPoolPromise = null;
let cbmedicPoolPromise = null;

/**
 * Pool para tu BD local de facturación
 * (Usuarios, roles, mantenimiento, logs, etc.)
 */
export async function getPool() {
  if (!localPoolPromise) {
    if (!localConfig.server || !localConfig.database) {
      throw new Error(
        `Config SQL local inválida. Revisa SQL_SERVER y SQL_DATABASE en .env (actual: ${process.env.SQL_SERVER}, ${process.env.SQL_DATABASE})`
      );
    }
    localPoolPromise = sql.connect(localConfig);
  }
  return localPoolPromise;
}

/**
 * Pool para la BD CBMEDIC
 * (Datos clínicos, valorizaciones, etc.)
 */
export async function getCbmedicPool() {
  if (!cbmedicPoolPromise) {
    if (!cbmedicConfig.server || !cbmedicConfig.database) {
      throw new Error(
        `Config SQL CBMEDIC inválida. Revisa SQL_CBMEDIC_SERVER y SQL_CBMEDIC_DATABASE en .env (actual: ${process.env.SQL_CBMEDIC_SERVER}, ${process.env.SQL_CBMEDIC_DATABASE})`
      );
    }
    cbmedicPoolPromise = new sql.ConnectionPool(cbmedicConfig)
      .connect()
      .catch((err) => {
        console.error("❌ Error conectando a CBMEDIC:", err);
        throw err;
      });
  }
  return cbmedicPoolPromise;
}

export { sql };
