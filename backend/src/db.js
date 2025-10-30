import sql from 'mssql';
import { config } from './config.js';

let pool;

export async function getPool() {
  if (pool) return pool;
  pool = await sql.connect(config.sql);
  return pool;
}

export { sql };
