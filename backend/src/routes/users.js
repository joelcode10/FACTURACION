import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt"; // <--- IMPORTANTE: Asegúrate de instalarlo (npm install bcrypt)
import { getPool, sql } from "../util/db.js";
import { sendInviteEmail } from "../util/mailer.js";

const router = Router();

// ==========================================
// 1. GET /: Listar usuarios
// ==========================================
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
    return res.status(500).json({ ok: false, message: "Error al listar usuarios." });
  }
});

// ==========================================
// 2. POST /invite: Invitar usuario nuevo
// ==========================================
router.post("/invite", async (req, res) => {
  try {
    const { nombre, email, rol } = req.body;

    if (!nombre || !email || !rol) {
      return res.status(400).json({ ok: false, message: "Faltan datos." });
    }

    const pool = await getPool();

    // Validar duplicados
    const existing = await pool.request()
      .input("Email", sql.NVarChar, email)
      .query("SELECT TOP 1 Id, Estado FROM dbo.Users WHERE Email = @Email");

    if (existing.recordset.length) {
      return res.status(409).json({ ok: false, message: "El correo ya está registrado." });
    }

    const inviteToken = crypto.randomUUID();
    const now = new Date();

    await pool.request()
      .input("Email", sql.NVarChar, email)
      .input("Nombre", sql.NVarChar, nombre)
      .input("RolCodigo", sql.NVarChar, rol)
      .input("InviteToken", sql.NVarChar, inviteToken)
      .input("Now", sql.DateTime2, now)
      .query(`
        INSERT INTO dbo.Users (
          Id, Email, Nombre, RolCodigo, Estado, InviteToken, InvitadoEn, InviteExpiresAt, CreadoEn, CreatedAt, UpdatedAt
        )
        VALUES (
          NEWID(), @Email, @Nombre, @RolCodigo, 'INVITADO', @InviteToken, @Now, DATEADD(DAY, 7, @Now), @Now, @Now, @Now
        )
      `);

    const baseUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const inviteLink = `${baseUrl}/invitar/${inviteToken}`; // Asegúrate que esta ruta exista en tu React Router

    try {
        await sendInviteEmail({ to: email, nombre, link: inviteLink });
    } catch (e) {
        console.error("Error enviando email:", e);
    }

    return res.json({ ok: true, message: "Invitación enviada." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Error al invitar." });
  }
});

// ==========================================
// 3. POST /complete: Completar Registro (ESTA ES LA QUE FALTABA)
// ==========================================
router.post("/complete", async (req, res) => {
    try {
      const { token, password } = req.body;
  
      if (!token || !password) {
        return res.status(400).json({ message: "Faltan datos (token o password)." });
      }
  
      const pool = await getPool();
  
      // 1. Buscar usuario por token
      const userRes = await pool.request()
        .input("Token", sql.NVarChar, token)
        .query("SELECT Id, InviteExpiresAt FROM dbo.Users WHERE InviteToken = @Token");
  
      if (userRes.recordset.length === 0) {
        return res.status(404).json({ message: "Invitación no válida o expirada." });
      }
  
      const user = userRes.recordset[0];
  
      // 2. Validar expiración (opcional, si usas la columna InviteExpiresAt)
      if (new Date() > new Date(user.InviteExpiresAt)) {
          return res.status(400).json({ message: "La invitación ha caducado." });
      }
  
      // 3. Encriptar contraseña
      const passwordHash = await bcrypt.hash(password, 10);
  
      // 4. Actualizar usuario: Poner Password, Estado ACTIVO, Borrar Token
      await pool.request()
        .input("Id", sql.UniqueIdentifier, user.Id)
        .input("Pass", sql.NVarChar, passwordHash)
        .query(`
          UPDATE dbo.Users
          SET 
            PasswordHash = @Pass,
            Estado = 'ACTIVO',
            InviteToken = NULL, -- Invalidamos el token para que no se use de nuevo
            UpdatedAt = GETDATE()
          WHERE Id = @Id
        `);
  
      res.json({ ok: true, message: "Cuenta activada correctamente." });
  
    } catch (e) {
      console.error("Error en /complete:", e);
      res.status(500).json({ message: "Error al activar cuenta." });
    }
  });

// ==========================================
// 4. POST /cancel: Cancelar invitación
// ==========================================
router.post("/cancel", async (req, res) => {
    try {
      const { id } = req.body; 
      if (!id) return res.status(400).json({ message: "Falta ID" });
  
      const pool = await getPool();
      await pool.request()
        .input("Id", sql.UniqueIdentifier, id)
        .query(`
          UPDATE dbo.Users
          SET Estado = 'INVITACION_CANCELADA', InviteToken = NULL, UpdatedAt = GETDATE()
          WHERE Id = @Id
        `);
  
      res.json({ ok: true, message: "Invitación cancelada" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Error al cancelar." });
    }
});

// ==========================================
// 5. DELETE /:id : Eliminar usuario
// ==========================================
router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ message: "Falta ID" });
  
      const pool = await getPool();
      await pool.request()
        .input("Id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM dbo.Users WHERE Id = @Id`);
  
      res.json({ ok: true, message: "Usuario eliminado." });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Error al eliminar." });
    }
});

export default router;