// backend/src/routes/clientes.js
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOCK_PATH = path.join(__dirname, "../data/mock-clientes.json");

// GET /api/clientes/process  -> devuelve datos mock para probar
router.get("/process", async (req, res) => {
  try {
    const raw = await fs.readFile(MOCK_PATH, "utf8");
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    console.error("Error leyendo mock-clientes.json:", err);
    res.status(500).json({ error: "No se pudo leer mock-clientes.json" });
  }
});

// POST /api/clientes/export  -> simula exportación
router.post("/export", async (req, res) => {
  try {
    const { selectedIds = [] } = req.body || {};
    console.log("Exportando grupos (mock):", selectedIds);
    // aquí más adelante harás la export real a Excel / SP, etc.
    res.json({ ok: true });
  } catch (err) {
    console.error("Error en export:", err);
    res.status(500).json({ error: "Error en exportación" });
  }
});

export default router;
