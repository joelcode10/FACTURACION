// backend/src/routes/users.js
import { Router } from "express";
import crypto from "crypto";
import { getPool, sql } from "../util/db.js";
import { sendInviteEmail } from "../util/mailer.js";

const router = Router();

/**
 * GET /api/users
 * Lista todos los usuarios
 */
router.get("/", async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        u.Id,
        u.Email,
        u.Nombre,
        u.RolCodigo,
        u.Estado,
        u.InviteToken,
        u.InvitadoEn,
        u.CreadoEn,
        u.UltimoLogin,
        u.CreatedAt,
        u.UpdatedAt
      FROM dbo.Users u
      ORDER BY u.CreatedAt DESC
    `);

    const users = result.recordset.map((u) => ({
      id: u.Id,
      email: u.Email,
      nombre: u.Nombre,
      rol: u.RolCodigo || "SIN_ROL",
      estado: u.Estado || "SIN_ESTADO",
      invitePending: u.Estado === "INVITADO" && !!u.InviteToken,
      creadoEn: u.CreadoEn || u.CreatedAt,
      ultimoLogin: u.UltimoLogin,
    }));

    return res.json({ ok: true, users });
  } catch (err) {
    console.error("❌ Error en GET /api/users:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al listar usuarios." });
  }
});

/**
 * POST /api/users/invite
 * Body: { nombre, email, rol }
 */
router.post("/invite", async (req, res) => {
  try {
    const { nombre, email, rol } = req.body;

    if (!nombre || !email || !rol) {
      return res.status(400).json({
        ok: false,
        message: "Nombre, correo y rol son obligatorios.",
      });
    }

    const pool = await getPool();

    // ¿Ya existe un usuario con ese correo?
    const existing = await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .query(`
        SELECT TOP 1 Id, Estado, Email
        FROM dbo.Users
        WHERE Email = @Email
      `);

    if (existing.recordset.length) {
      const e = existing.recordset[0];
      return res.status(409).json({
        ok: false,
        message: `Ya existe un usuario con ese correo (estado actual: ${e.Estado}).`,
      });
    }

    const inviteToken = crypto.randomUUID();
    const now = new Date();

    // INSERT con ESTADO = 'INVITADO'
    await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .input("Nombre", sql.NVarChar, nombre)
      .input("RolCodigo", sql.NVarChar, rol)
      .input("InviteToken", sql.NVarChar, inviteToken)
      .input("Now", sql.DateTime2, now)
      .query(`
        INSERT INTO dbo.Users (
          Id,
          Email,
          Nombre,
          RolCodigo,
          Estado,
          PasswordHash,
          InviteToken,
          InviteExpiresAt,
          InvitadoEn,
          CreadoEn,
          UltimoLogin,
          CreatedAt,
          UpdatedAt
        )
        VALUES (
          NEWID(),
          @Email,
          @Nombre,
          @RolCodigo,
          'INVITADO',    -- <<<<<<<<< AQUÍ se garantiza que NO es NULL
          NULL,
          @InviteToken,
          DATEADD(DAY, 7, @Now),
          @Now,
          @Now,
          NULL,
          @Now,
          @Now
        )
      `);

    // Link de invitación
    const baseUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const inviteLink = `${baseUrl}/invitar/${inviteToken}`;

    // Enviar correo
    await sendInviteEmail({
      to: email,
      nombre,
      link: inviteLink,
    });

    return res.json({
      ok: true,
      message: "Usuario invitado correctamente. Se ha enviado un correo.",
    });
  } catch (err) {
    console.error("❌ Error en POST /api/users/invite:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al invitar usuario." });
  }
});

/**
 * POST /api/users/cancel-invite
 * Body: { userId }
 * Solo aplica si el usuario sigue en estado INVITADO.
 */
router.post("/cancel-invite", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res
        .status(400)
        .json({ ok: false, message: "Se requiere el Id del usuario." });
    }

    const pool = await getPool();

    const check = await pool
      .request()
      .input("Id", sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1 Estado
        FROM dbo.Users
        WHERE Id = @Id
      `);

    if (!check.recordset.length) {
      return res
        .status(404)
        .json({ ok: false, message: "Usuario no encontrado." });
    }

    const estado = check.recordset[0].Estado;
    if (estado !== "INVITADO") {
      return res.status(400).json({
        ok: false,
        message: "La invitación ya no está pendiente, no se puede cancelar.",
      });
    }

    await pool
      .request()
      .input("Id", sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.Users
        SET
          Estado = 'INVITACION_CANCELADA',
          InviteToken = NULL,
          InviteExpiresAt = NULL,
          UpdatedAt = SYSDATETIME()
        WHERE Id = @Id
      `);

    return res.json({ ok: true, message: "Invitación cancelada." });
  } catch (err) {
    console.error("❌ Error en POST /api/users/cancel-invite:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al cancelar invitación." });
  }
});

/**
 * POST /api/users/complete
 * Body: { token, password }
 */
router.post("/complete", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        ok: false,
        message: "Token y contraseña son obligatorios.",
      });
    }

    const pool = await getPool();

    const result = await pool
      .request()
      .input("InviteToken", sql.NVarChar, token)
      .query(`
        SELECT TOP 1
          Id,
          Email,
          Nombre,
          Estado,
          InviteExpiresAt
        FROM dbo.Users
        WHERE InviteToken = @InviteToken
      `);

    if (!result.recordset.length) {
      return res
        .status(404)
        .json({ ok: false, message: "Invitación no válida o ya usada." });
    }

    const u = result.recordset[0];

    if (u.Estado !== "INVITADO") {
      return res.status(400).json({
        ok: false,
        message: "La invitación ya no está activa.",
      });
    }

    if (u.InviteExpiresAt && new Date(u.InviteExpiresAt) < new Date()) {
      return res
        .status(400)
        .json({ ok: false, message: "La invitación ha expirado." });
    }

    // TODO: en producción usar bcrypt
    const passwordHash = password;

    await pool
      .request()
      .input("Id", sql.UniqueIdentifier, u.Id)
      .input("PasswordHash", sql.NVarChar, passwordHash)
      .query(`
        UPDATE dbo.Users
        SET
          PasswordHash = @PasswordHash,
          Estado = 'ACTIVO',
          InviteToken = NULL,
          InviteExpiresAt = NULL,
          UpdatedAt = SYSDATETIME()
        WHERE Id = @Id
      `);

    return res.json({
      ok: true,
      message:
        "Contraseña creada y usuario activado. Ya puedes iniciar sesión.",
    });
  } catch (err) {
    console.error("❌ Error en POST /api/users/complete:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al completar la invitación." });
  }
});

/**
 * DELETE /api/users/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await getPool();
    await pool
      .request()
      .input("Id", sql.UniqueIdentifier, id)
      .query(`
        DELETE FROM dbo.Users
        WHERE Id = @Id
      `);

    return res.json({ ok: true, message: "Usuario eliminado." });
  } catch (err) {
    console.error("❌ Error en DELETE /api/users/:id:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al eliminar usuario." });
  }
});

export default router;
