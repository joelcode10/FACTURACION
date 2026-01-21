// frontend/src/lib/api.js
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let message = text || `Error HTTP ${res.status}`;
    try { const j = JSON.parse(text); if (j.message) message = j.message; } catch {}
    throw new Error(message);
  }
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

/** 🔐 Login */
export async function loginApi(username, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: username, password }),
  });
}

/** 💰 Liquidación de clientes */
export async function fetchClientesProcess({ from, to, condicionPago }) {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  if (condicionPago && condicionPago !== "TODAS") {
    params.append("condicionPago", condicionPago);
  }
  return request(`/api/clientes/process?${params.toString()}`);
}


/** 📝 Logs */
export async function postLog(payload) {
  return request("/api/logs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 👤 Usuarios */
export async function fetchUsers() { return request("/api/users"); }

export async function inviteUser({ nombre, email, rol }) {
  return request("/api/users/invite", {
    method: "POST",
    body: JSON.stringify({ nombre, email, rol }),
  });
}

export async function completeInvite({ token, password }) {
  return request("/api/users/complete", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function cancelInvite(userId) {
  return request("/api/users/cancel-invite", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function deleteUser(userId) {
  return request(`/api/users/${userId}`, { method: "DELETE" });
}

/** Guardar "no liquidar" (pendientes) */
export async function saveExclusions(payload) {
  return request("/api/clientes/exclusions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function anularPendiente({ nro, documento }) {
  return await request("/api/clientes/pendientes/anular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nro, documento }),
  });
}

/** 📤 Exportar Excel de liquidaciones seleccionadas (Clientes) */
export async function exportLiquidaciones({ from, to, condicionPago, selectedIds, rows }) {
  const res = await fetch("/api/clientes/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Enviamos rows si existen
    body: JSON.stringify({ from, to, condicionPago, selectedIds, rows }),
  });
  if (!res.ok) throw new Error("Error exportando");
  return await res.blob();
}

export async function fetchDetalleConPendientes(params) {
  const qs = new URLSearchParams(params);
  const resp = await request(
    `/api/clientes/detalle-con-pendientes?${qs.toString()}`
  );
  return resp;
}

/** 🧾 Registrar liquidación */
export async function liquidarClientes({ from, to, condicionPago, selectedIds, rows, groupsMetadata }) {
  const res = await fetch("/api/clientes/liquidar", { 
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, condicionPago, selectedIds, rows, groupsMetadata }), // <-- Agregado
  });
  return await res.json();
}

/** 📚 Histórico: listar liquidaciones de clientes */
export async function fetchLiquidaciones({ from, to, condicionPago } = {}) {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  if (condicionPago && condicionPago !== "TODAS") {
    params.append("condicionPago", condicionPago);
  }
  const qs = params.toString();
  const path = qs ? `/api/clientes/liquidaciones?${qs}` : `/api/clientes/liquidaciones`;
  return request(path);
}

/** 📄 Histórico: detalle de una liquidación específica */
export async function fetchLiquidacionDetalle(idLiquidacion) {
  if (!idLiquidacion) {
    throw new Error("IdLiquidacion es requerido para obtener el detalle.");
  }
  return request(`/api/clientes/liquidaciones/${idLiquidacion}`);
}

export async function anularLiquidacion(id, usuario) {
  return request(`/api/clientes/liquidaciones/${id}/anular`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario }),
  });
}

// ==========================================
// API HONORARIOS MÉDICOS
// ==========================================

export async function fetchHhmmProcess({ from, to }) {
  const res = await fetch(`/api/honorarios/process?from=${from}&to=${to}`);
  return await res.json();
}

export async function liquidarHonorarios({ from, to, rows }) {
  const res = await fetch("/api/honorarios/liquidar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, rows }),
  });
  return await res.json();
}

export async function saveHonorariosExclusions({ from, to, items }) {
  const res = await fetch("/api/honorarios/exclusions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, items }),
  });
  return await res.json(); 
}

// ⚠️ MODIFICADO: Ahora recibe 'rows' en lugar de 'nros' para asegurar la consistencia del export
export async function exportHonorarios({ rows }) {
  const res = await fetch("/api/honorarios/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }), // Envia las filas exactas
  });
  if (!res.ok) throw new Error("Error export");
  return await res.blob();
}

// ==========================================
// API MANTENIMIENTO (Tarifario & Paquetes)
// ==========================================

export async function fetchMantenimientoOptions() {
  const res = await fetch("/api/mantenimiento/options");
  return await res.json();
}

export async function fetchTarifas() {
  const res = await fetch("/api/mantenimiento/tarifas");
  return await res.json();
}

export async function createTarifa(payload) {
  const res = await fetch("/api/mantenimiento/tarifas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

export async function deleteTarifa(id) {
  const res = await fetch(`/api/mantenimiento/tarifas/${id}`, { method: "DELETE" });
  return await res.json();
}

export async function fetchPaquetes() {
  const res = await fetch("/api/mantenimiento/paquetes");
  return await res.json();
}

export async function createPaquete(payload) {
  const res = await fetch("/api/mantenimiento/paquetes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

export async function deletePaquete(id) {
  const res = await fetch(`/api/mantenimiento/paquetes/${id}`, { method: "DELETE" });
  return await res.json();
}
export async function fetchMasterPrestaciones() {
  const res = await fetch("/api/mantenimiento/master-prestaciones");
  return await res.json();
}

export async function searchEvaluadores(query) {
  const res = await fetch(`/api/mantenimiento/buscar-evaluadores?q=${query}`);
  return await res.json();
}
// ==========================================
// MÓDULO AUDITORÍAS (NUEVO)
// ==========================================

export async function fetchAuditoriasProcess({ from, to }) {
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`/api/auditorias/process?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Error al procesar auditorías");
  return data;
}
export async function liquidarAuditorias({ from, to, rows }) {
  const res = await fetch("/api/auditorias/liquidar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, rows }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Error al liquidar auditorías");
  return data;
}

export async function exportAuditorias({ rows, from, to }) {
  const res = await fetch("/api/auditorias/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, from, to }),
  });
  if (!res.ok) throw new Error("Error al exportar excel");
  return await res.blob();
}