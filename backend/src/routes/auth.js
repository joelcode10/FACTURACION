// backend/src/routes/auth.js
import { Router } from "express";
import { getPool, sql } from "../util/db.js";

const router = Router();

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, message: "Ingresa usuario y contraseña." });
    }

    const pool = await getPool();

    const result = await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .query(`
        SELECT TOP 1
          Id,
          Email,
          Nombre,
          PasswordHash,
          RolCodigo,
          Estado
        FROM dbo.Users
        WHERE Email = @Email
      `);

    if (!result.recordset.length) {
      // Usuario no existe
      return res
        .status(401)
        .json({ ok: false, message: "Usuario o contraseña incorrectos." });
    }

    const user = result.recordset[0];

    // Validar estado
    if (user.Estado && user.Estado !== "ACTIVO") {
      return res.status(403).json({
        ok: false,
        message: `Usuario en estado ${user.Estado}.`,
      });
    }

    // Comparar contraseña (por ahora texto plano)
    if (!user.PasswordHash || user.PasswordHash !== password) {
      return res
        .status(401)
        .json({ ok: false, message: "Usuario o contraseña incorrectos." });
    }

    // Actualizar último login
    await pool
      .request()
      .input("Id", sql.UniqueIdentifier, user.Id)
      .query(`
        UPDATE dbo.Users
        SET UltimoLogin = SYSDATETIME(),
            UpdatedAt   = SYSDATETIME()
        WHERE Id = @Id
      `);

    // En producción sería un JWT real
    const fakeToken = "fake-token-" + user.Id;

    return res.json({
      ok: true,
      user: {
        id: user.Id,
        nombre: user.Nombre,
        email: user.Email,
        rol: user.RolCodigo || "ADMIN",
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