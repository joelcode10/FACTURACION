// backend/src/routes/mock-source.js
import { Router } from "express";
const router = Router();

router.get("/", (_req, res) => {
  res.json({ source: "mock" });
});

export default router;
