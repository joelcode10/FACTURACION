// backend/src/routes/auth.js
import { Router } from "express";
import { getPool, sql } from "../util/db.js";

const router = Router();

/**
 * Usuarios de prueba en memoria (fallback)
 * Sirve mientras terminamos de usar 100% SQL.
 */
const mockUsers = [
  {
    id: 1,
    email: "admin",        // usuario
    password: "admin123",  // contraseña
    nombre: "Administrador General",
    rol: "ADMIN",
  },
];

/**
 * POST /api/auth/login
 * Body: { email, password }  ó  { username, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, username, password } = req.body || {};

    // Aceptamos tanto "email" como "username"
    const loginId = (email || username || "").trim();

    if (!loginId || !password) {
      return res
        .status(400)
        .json({ ok: false, message: "Ingresa usuario y contraseña." });
    }

    // 1) Intentar autenticación contra SQL Server
    try {
      const pool = await getPool();
      const result = await pool
        .request()
        .input("Email", sql.NVarChar, loginId)
        .query(`
          SELECT TOP 1
            Id,
            Email,
            Nombre,
            RolCodigo,
            PasswordHash,
            Estado
          FROM dbo.Users
          WHERE Email = @Email
        `);

      if (result.recordset.length) {
        const u = result.recordset[0];

        if (u.Estado !== "ACTIVO") {
          return res.status(401).json({
            ok: false,
            message: "El usuario no está activo.",
          });
        }

        // TODO: aquí debería ir bcrypt. Por ahora comparamos texto plano.
        if (u.PasswordHash === password) {
          const fakeToken = "token-sql-" + u.Id;

          return res.json({
            ok: true,
            user: {
              id: u.Id,
              nombre: u.Nombre,
              email: u.Email,
              rol: u.RolCodigo || "SIN_ROL",
            },
            token: fakeToken,
          });
        }
        // Si hay usuario en SQL pero la contraseña no coincide, más abajo probamos mock.
      }
    } catch (dbErr) {
      console.error("Error consultando SQL en /api/auth/login:", dbErr);
      // No rompemos: seguimos con el fallback mock.
    }

    // 2) Fallback: usuarios mock (admin/admin123)
    const mock = mockUsers.find(
      (u) => u.email === loginId && u.password === password
    );

    if (!mock) {
      return res
        .status(401)
        .json({ ok: false, message: "Usuario o contraseña incorrectos." });
    }

    const fakeToken = "token-mock-" + mock.id;

    return res.json({
      ok: true,
      user: {
        id: mock.id,
        nombre: mock.nombre,
        email: mock.email,
        rol: mock.rol,
      },
      token: fakeToken,
    });
  } catch (err) {
    console.error("Error en /api/auth/login:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error interno en el servidor." });
  }
});

export default router;
