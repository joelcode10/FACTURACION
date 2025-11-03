// src/lib/api.js
import axios from "axios";

// Instancia base para todas las llamadas al backend
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api",
  timeout: 30000,
});

// -------------------------------------------------------------
// CLIENTES
// -------------------------------------------------------------
export async function fetchClientesProcess({ from, to, condicionPago }) {
  const res = await api.get("/clientes/process", {
    params: { from, to, condicionPago },
  });
  return res.data;
}

// -------------------------------------------------------------
// HHMM (Honorarios Médicos)
// -------------------------------------------------------------
export async function fetchHhmmProcess({ from, to }) {
  const res = await api.get("/hhmm/process", {
    params: { from, to },
  });
  return res.data;
}

// -------------------------------------------------------------
// REPORTE DE CIERRE
// -------------------------------------------------------------
export async function fetchCierre(params) {
  // params puede incluir: from, to, cliente, sede, condicion, valorizacion, etc.
  const res = await api.get("/cierre", { params });
  return res.data;
}

// -------------------------------------------------------------
// LOGS / TRAZABILIDAD
// -------------------------------------------------------------
export async function postLog(entry) {
  // entry: { usuario, modulo, accion, detalle }
  const res = await api.post("/logs", entry);
  return res.data;
}

// Export por defecto por si quieres usar api directamente
export default api;
