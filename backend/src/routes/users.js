// backend/src/routes/users.js
import { Router } from "express";
import crypto from "crypto";
import { getPool, sql } from "../util/db.js";
import { sendInviteEmail } from "../util/mailer.js";

const router = Router();

/** GET /api/users */
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
        u.UpdatedAt,
        r.Name AS RolNombre
      FROM dbo.Users u
      LEFT JOIN dbo.Roles r
        ON r.Name = u.RolCodigo
      ORDER BY u.CreatedAt DESC
    `);

    const users = result.recordset.map((u) => ({
      id: u.Id,
      email: u.Email,
      nombre: u.Nombre,
      rol: u.RolCodigo || u.RolNombre || "SIN_ROL",
      estado: u.Estado || "SIN_ESTADO",
      invitePending: u.Estado === "INVITADO" && !!u.InviteToken,
      creadoEn: u.CreadoEn || u.CreatedAt,
      ultimoLogin: u.UltimoLogin,
    }));

    return res.json({ ok: true, users });
  } catch (err) {
    console.error("Error en GET /api/users:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al listar usuarios." });
  }
});

/** POST /api/users/invite */
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

    const existing = await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .query(`
        SELECT TOP 1 Id, Estado
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
          InviteToken,
          InvitadoEn,
          InviteExpiresAt,
          CreadoEn,
          CreatedAt,
          UpdatedAt
        )
        VALUES (
          NEWID(),
          @Email,
          @Nombre,
          @RolCodigo,
          'INVITADO',
          @InviteToken,
          @Now,
          DATEADD(DAY, 7, @Now),
          @Now,
          @Now,
          @Now
        )
      `);

    const baseUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const inviteLink = `${baseUrl}/invitar/${inviteToken}`;

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
    console.error("Error en POST /api/users/invite:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al invitar usuario." });
  }
});

export default router;