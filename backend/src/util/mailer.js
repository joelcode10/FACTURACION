// backend/src/util/mailer.js
import nodemailer from "nodemailer";

let transporter = null;

/**
 * Crea (una sola vez) el transporter de Nodemailer a partir de las variables de entorno.
 * Devuelve null si falta algo y en ese caso usamos modo SIMULADO.
 */
function getTransporterFromEnv() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
  } = process.env;

  // Si falta host, user o pass -> simulamos
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: SMTP_SECURE === "true",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  return transporter;
}

/**
 * Envía un correo de invitación.
 * Si faltan vars de SMTP, solo simula el envío (no lanza error).
 */
export async function sendInviteEmail({ to, nombre, link }) {
  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "no-reply@sistema-local.test";

  const subject = "Invitación al Sistema de Facturación Ocupacional";
  const text = `Hola ${nombre},


Por favor, haz clic en el siguiente enlace para crear tu contraseña y activar tu cuenta:
${link}

Saludos,`;

  const tx = getTransporterFromEnv();

  if (!tx) {
    // MODO SIMULADO
    console.warn("⚠️ SMTP deshabilitado. Faltan variables en .env");
    console.log("📧 [SIMULADO] Correo de invitación");
    console.log("  Para:", to);
    console.log("  Asunto:", subject);
    console.log("  Texto:", text);
    return;
  }

  // Envío real
  await tx.sendMail({
    from,
    to,
    subject,
    text,
  });

  console.log("📧 Correo REAL de invitación enviado a:", to);
}
