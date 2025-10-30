import { Router } from 'express';

const router = Router();

/**
 * POST /api/logs
 * { user, action, module, detail }
 * En este arranque solo imprimimos en consola.
 * Si deseas, aquí insertas en una tabla LOG_ACTIVIDADES.
 */
router.post('/', (req, res) => {
  const { user, action, module, detail } = req.body || {};
  console.log('LOG =>', { user, action, module, detail, at: new Date().toISOString() });
  res.json({ ok: true });
});

export default router;
