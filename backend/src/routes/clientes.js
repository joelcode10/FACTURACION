// backend/src/routes/clientes.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GET /api/clientes/process  -> devuelve datos mock para probar
router.get("/process", async (req, res) => {
  try {
    const mockPath = path.join(__dirname, "../data/mock-clientes.json");
    const raw = fs.readFileSync(mockPath, "utf8");
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    console.error("Error leyendo mock-clientes.json:", err);
    res.status(500).json({ error: "No se pudo leer mock-clientes.json" });
  }
});

// POST /api/clientes/export  -> simula exportación
router.post("/export", async (req, res) => {
  try {
    const { selectedIds = [] } = req.body || {};
    console.log("Exportando grupos:", selectedIds);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error en export:", err);
    res.status(500).json({ error: "Error en exportación" });
  }
});

export default router;
