// backend/resetAdmin.js
import sql from "mssql";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config(); // Cargar variables de entorno (.env)

const dbConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: 'FacturacionCBMedic', // Asegúrate que sea la BD correcta
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function reset() {
  try {
    console.log("🔌 Conectando a BD...");
    await sql.connect(dbConfig);

    const email = "admin"; // Tu usuario
    const password = "prueba123"; // Tu contraseña deseada
    const hash = await bcrypt.hash(password, 10);

    console.log(`🔐 Hash generado para '${password}': ${hash}`);

    // Verificar si existe
    const check = await sql.query`SELECT Id FROM dbo.Users WHERE Email = ${email}`;

    if (check.recordset.length > 0) {
      // Actualizar
      await sql.query`
        UPDATE dbo.Users 
        SET PasswordHash = ${hash}, Estado = 'ACTIVO', RolCodigo = 'ADMIN' 
        WHERE Email = ${email}
      `;
      console.log("✅ Usuario actualizado correctamente.");
    } else {
      // Crear
      await sql.query`
        INSERT INTO dbo.Users (Id, Email, Nombre, RolCodigo, Estado, PasswordHash, CreatedAt, UpdatedAt)
        VALUES (NEWID(), ${email}, 'Administrador', 'ADMIN', 'ACTIVO', ${hash}, GETDATE(), GETDATE())
      `;
      console.log("✅ Usuario creado correctamente.");
    }

    process.exit(0);
  } catch (e) {
    console.error("❌ Error:", e);
    process.exit(1);
  }
}

reset();