import express from "express";
import cors from "cors";
import clientesRouter from "./routes/clientes.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/clientes", clientesRouter);

const PORT = 3001;
app.listen(PORT, () => console.log(`✅ API corriendo en http://localhost:${PORT}`));
