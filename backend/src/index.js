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

const app = express();
app.use(cors());
app.use(express.json());

// Rutas API
app.use("/api/clientes", clientesRouter);
app.use("/api/cierre", cierreRouter);
app.use("/api/mock", mockSourceRouter);
app.use("/api/health", healthRouter);
app.use("/api/logs", logsRoutes);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
  console.log("SQL_SERVER =", process.env.SQL_SERVER);
});