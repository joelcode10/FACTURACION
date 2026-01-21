// backend/src/index.js
import "dotenv/config";        // 👈 con esto basta, puedes quitar el import de dotenv directo

import express from "express";
import cors from "cors";

import clientesRouter from "./routes/clientes.js";
import cierreRouter from "./routes/cierre.js";
import mockSourceRouter from "./routes/mock-source.js";
import healthRouter from "./routes/health.js";
import logsRoutes from "./routes/logs.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import honorariosRouter from "./routes/honorarios.js";
import mantenimientoRouter from "./routes/mantenimiento.js";
import auditoriasRoutes from "./routes/auditorias.js"; 
import configuracionRoutes from "./routes/configuracionAu.js";
import valorizacionRoutes from "./routes/valorizacion.js"; // <--- AGREGA ESTO
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));


// Rutas API
app.use("/api/clientes", clientesRouter);
app.use("/api/cierre", cierreRouter);
app.use("/api/mock", mockSourceRouter);
app.use("/api/health", healthRouter);
app.use("/api/logs", logsRoutes);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/honorarios", honorariosRouter);
app.use("/api/mantenimiento", mantenimientoRouter);
app.use("/api/auditorias", auditoriasRoutes); 
app.use("/api/config", configuracionRoutes);
app.use("/api/valorizacion", valorizacionRoutes); // <--- AGREGA ESTO
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
  console.log("SQL_SERVER =", process.env.SQL_SERVER);
});