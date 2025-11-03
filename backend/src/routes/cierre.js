// backend/src/routes/cierre.js
import { Router } from "express";
const router = Router();

router.get("/", (_req, res) => {
  res.json({ ok: true, items: [] });
});

export default router;
