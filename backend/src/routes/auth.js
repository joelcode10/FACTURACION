import { Router } from "express";
import { getPool, sql } from "../util/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = Router();

// ==========================================
// POST /login: Iniciar Sesión
// ==========================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Ingrese correo y contraseña." });
    }

    const pool = await getPool();

    // 1. Buscar usuario por Email
    // NOTA: Traemos PasswordHash y el Rol
    const result = await pool.request()
      .input("Email", sql.NVarChar, email)
      .query(`
        SELECT 
            u.Id, 
            u.Email, 
            u.Nombre, 
            u.PasswordHash, 
            u.Estado, 
            u.RolCodigo,
            r.Name as RolNombre
        FROM dbo.Users u
        LEFT JOIN dbo.Roles r ON u.RolCodigo = r.Name
        WHERE u.Email = @Email
      `);

    const user = result.recordset[0];

    // 2. Validar si existe
    if (!user) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
    }

    // 3. Validar Estado
    if (user.Estado !== 'ACTIVO') {
      return res.status(403).json({ 
        message: `Tu cuenta no está activa (Estado: ${user.Estado}). Revisa tu correo o contacta al administrador.` 
      });
    }

    // 4. Validar Contraseña (BCRYPT)
    // Comparamos la contraseña que escribe el usuario con el Hash de la BD
    const isMatch = await bcrypt.compare(password, user.PasswordHash || "");

    if (!isMatch) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
    }

    // 5. Generar Token JWT
    // Usamos una clave secreta (debería estar en .env, pero aquí ponemos un fallback)
    const secret = process.env.JWT_SECRET || "secreto_super_seguro_123";
    
    const token = jwt.sign(
      {
        id: user.Id,
        email: user.Email,
        rol: user.RolCodigo || user.RolNombre, // Guardamos el rol en el token
        nombre: user.Nombre
      },
      secret,
      { expiresIn: "8h" } // El token dura 8 horas
    );

    // 6. Actualizar Último Login
    await pool.request()
      .input("Id", sql.UniqueIdentifier, user.Id)
      .query("UPDATE dbo.Users SET UltimoLogin = GETDATE() WHERE Id = @Id");

    // 7. Responder con datos y token
    res.json({
      ok: true,
      token,
      user: {
        id: user.Id,
        nombre: user.Nombre,
        email: user.Email,
        rol: user.RolCodigo || user.RolNombre
      }
    });

  } catch (e) {
    console.error("Error en Login:", e);
    res.status(500).json({ message: "Error interno del servidor." });
  }
});

// ==========================================
// GET /me: Validar Token (Persistencia)
// ==========================================
// Esta ruta sirve para que cuando recargues la página, no se cierre la sesión
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Sin token" });

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "secreto_super_seguro_123";

    // Verificar token
    const decoded = jwt.verify(token, secret);

    // Opcional: Verificar si sigue activo en BD
    const pool = await getPool();
    const result = await pool.request()
        .input("Id", sql.UniqueIdentifier, decoded.id)
        .query("SELECT Id, Nombre, Email, RolCodigo, Estado FROM dbo.Users WHERE Id = @Id");
    
    const user = result.recordset[0];
    if (!user || user.Estado !== 'ACTIVO') {
        return res.status(401).json({ message: "Sesión inválida" });
    }

    res.json({
      ok: true,
      user: {
        id: user.Id,
        nombre: user.Nombre,
        email: user.Email,
        rol: user.RolCodigo
      }
    });

  } catch (e) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
});

export default router;