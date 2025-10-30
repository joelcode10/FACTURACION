import { Router } from 'express';
import xlsx from 'xlsx'; // npm i xlsx
import path from 'node:path';
import fs from 'node:fs';

const router = Router();

router.get('/base', (_req, res) => {
  try {
    const file = path.join(process.cwd(), 'data', 'base.xlsx');
    if (!fs.existsSync(file)) return res.json({ ok: true, rows: [] });
    const wb = xlsx.readFile(file);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
