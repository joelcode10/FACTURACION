/* backend/test-mail.js
import dotenv from "dotenv";
dotenv.config(); // carga .env desde backend/.env por defecto

import { sendInviteEmail } from "./src/util/mailer.js";

async function main() {
  const to = "joel.dragonbound11@gmail.com"; // destinatario de prueba

  console.log("SMTP_HOST:", process.env.SMTP_HOST);
  console.log("SMTP_USER:", process.env.SMTP_USER);

  console.log("🚀 Iniciando test de correo...");
  await sendInviteEmail({
    to,
    nombre: "Usuario de Prueba",
    link: "http://localhost:5173/invitar/TEST-TOKEN",
  });
  console.log("✅ Test de correo terminado");
}

main().catch((err) => {
  console.error("❌ Error en test de correo:", err);
});*/
