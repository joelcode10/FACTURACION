// backend/src/routes/logs.js
import express from "express";

const router = express.Router();

// POST /api/logs
router.post("/", (req, res) => {
  const body = req.body || {};
  console.log("LOG:", JSON.stringify(body, null, 2));
  // Más adelante aquí podrás guardar en tu BD de auditoría
  res.json({ ok: true });
});

export default router;
