// test-cbmedic.js
import dotenv from "dotenv";
dotenv.config();

import sql from "mssql";

const config = {
  user: process.env.SQL_CBMEDIC_USER,
  password: process.env.SQL_CBMEDIC_PASSWORD,
  server: process.env.SQL_CBMEDIC_SERVER,
  database: process.env.SQL_CBMEDIC_DATABASE,
  options: {
    encrypt: false,              // en redes internas suele ser false
    trustServerCertificate: true,
  },
};

async function main() {
  console.log("🔌 Probando conexión a BD CBMEDIC...");
  console.log("  ➤ SERVER  :", config.server);
  console.log("  ➤ DATABASE:", config.database);
  console.log("  ➤ USER    :", config.user);

  if (!config.server || !config.database || !config.user || !config.password) {
    console.error("❌ Faltan variables de entorno SQL_CBMEDIC_* en el .env");
    process.exit(1);
  }

  try {
    const pool = await sql.connect(config);
    console.log("✅ Conexión establecida correctamente con CBMEDIC.");

    // Consulta mínima para comprobar que responde
    const result = await pool
      .request()
      .query("SELECT TOP 1 name FROM sys.tables ORDER BY name");

    console.log("✅ Consulta de prueba OK. Ejemplo de tabla en la BD:");
    console.log(result.recordset[0]);

    await pool.close();
  } catch (err) {
    console.error("❌ Error al conectar o consultar la BD CBMEDIC:");
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();
