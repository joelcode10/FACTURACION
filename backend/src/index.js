// backend/src/index.js
import express from "express";
import cors from "cors";

import clientesRouter from "./routes/clientes.js";
import cierreRouter from "./routes/cierre.js";
import mockSourceRouter from "./routes/mock-source.js";
import healthRouter from "./routes/health.js";
import logsRoutes from "./routes/logs.js";   // <-- agrega esto

const app = express();
app.use(cors());
app.use(express.json());

// Rutas API
app.use("/api/clientes", clientesRouter);
app.use("/api/cierre", cierreRouter);
app.use("/api/mock", mockSourceRouter);
app.use("/api/health", healthRouter);
app.use("/api/logs", logsRoutes); 

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
});
