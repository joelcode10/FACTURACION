import { Router } from 'express';
import { fetchBaseFromSP } from '../util/sp.js';

const router = Router();

/**
 * GET /api/cierre
 * Query params:
 * - dateFrom (YYYY-MM-DD)
 * - dateTo (YYYY-MM-DD)
 * - sede (string, opcional)
 * - cliente (string, opcional)
 * - condicionPago (CREDITO|CONTADO, opcional)
 * - estadoVal (VAL|NOVAL|ALL) -> Valorizado / No valorizado / Todos
 *
 * La respuesta ya está lista para pintar la tabla de Cierre (simple).
 * Campos esperados desde SP: cliente, unidadProduccion, tipoEvaluacion, sede, bruto, igv, total,
 *   facturado (bool/SiNo), comprobanteTipo, comprobanteSerie, comprobanteNumero, fechaInicio/atención, etc.
 */
router.get('/', async (req, res) => {
  try {
    const { dateFrom, dateTo, sede, cliente, condicionPago, estadoVal = 'ALL' } = req.query;

    // 1) Trae todo del SP
    const base = await fetchBaseFromSP({
      fechaIni: dateFrom ? new Date(dateFrom) : null,
      fechaFin: dateTo ? new Date(dateTo + 'T23:59:59') : null
    });

    // 2) Filtrados (en memoria si el SP no lo hace)
    let data = base;

    // Ejemplos de campos que esperamos del SP:
    // FECHA_INICIO, SEDE, CLIENTE, UNIDAD_PRODUCCION, TIPO_EVALUACION,
    // CONDICION_PAGO, FACTURADO (true/false o 'SI'/'NO'), COMP_TIPO, COMP_SERIE, COMP_NUMERO,
    // BRUTO, IGV, TOTAL
    const norm = (v) => (v ?? '').toString().trim().toUpperCase();

    if (dateFrom) {
      const from = new Date(dateFrom);
      data = data.filter(r => new Date(r.FECHA_INICIO) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      data = data.filter(r => new Date(r.FECHA_INICIO) <= to);
    }
    if (sede) data = data.filter(r => norm(r.SEDE) === norm(sede));
    if (cliente) data = data.filter(r => norm(r.CLIENTE) === norm(cliente));
    if (condicionPago) data = data.filter(r => norm(r.CONDICION_PAGO) === norm(condicionPago));

    if (estadoVal !== 'ALL') {
      const wantVal = estadoVal === 'VAL'; // true si buscamos valorizados
      data = data.filter(r => {
        const v = r.FACTURADO; // puede venir true/false o 'SI'/'NO'
        const isVal = (typeof v === 'boolean') ? v : norm(v) === 'SI';
        return isVal === wantVal;
      });
    }

    // 3) Devolver tal cual (frontend resume/agrupa)
    res.json({ ok: true, rows: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
