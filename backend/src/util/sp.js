import { getPool, sql } from '../db.js';
import { config } from '../config.js';

/**
 * Ejecuta el SP base de CBMEDIC y retorna registros sin filtrar.
 * Sugerencia: el SP debería aceptar @FechaIni y @FechaFin (y opcionalmente Sede/Cliente/etc).
 * Si no los acepta, filtramos en Node.
 */
export async function fetchBaseFromSP({ fechaIni, fechaFin }) {
  const pool = await getPool();
  const request = pool.request();

  // Si tu SP acepta fechas, pásalas:
  if (fechaIni) request.input('FechaIni', sql.DateTime, fechaIni);
  if (fechaFin) request.input('FechaFin', sql.DateTime, fechaFin);

  const result = await request.execute(config.app.spName);
  // Por convención, mssql retorna en result.recordset
  return result.recordset || [];
}
