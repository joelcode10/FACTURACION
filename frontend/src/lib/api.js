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
  // El backend espera { email, password }
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

/** 🩺 Honorarios médicos (HHMM) */
export async function fetchHhmmProcess({ from, to }) {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  try {
    return await request(`/api/hhmm/process?${params.toString()}`);
  } catch {
    return {
      ok: true,
      groups: [],
      detailsByGroupId: {},
      filters: { medicos: [], tipos: [] },
      note: "HHMM aún no implementado en backend, usando datos vacíos.",
    };
  }
}

/** 🧾 Auditorías */
export async function fetchAuditoriasProcess({ from, to }) {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  return request(`/api/auditorias/process?${params.toString()}`);
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
  // payload = { from, to, condicionPago, items: [...] }
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
/** 📤 Exportar Excel de liquidaciones seleccionadas */
export async function exportLiquidaciones({ from, to, condicionPago, selectedIds, estadosPrestacion,}) {
  const url = `${API_BASE}/api/clientes/export`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, condicionPago, selectedIds, estadosPrestacion,}),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Error HTTP ${res.status}`);
  }
  return await res.blob();
}
export async function fetchDetalleConPendientes(params) {
  const qs = new URLSearchParams(params);
  const resp = await request(
    `/api/clientes/detalle-con-pendientes?${qs.toString()}`
  );
  return resp;
}
/** 🧾 Registrar liquidación (cabecera + detalle en histórico) */
export async function liquidarClientes({ from, to, condicionPago, selectedIds, usuario }) {
  return request("/api/clientes/liquidar", {
    method: "POST",
    body: JSON.stringify({
      from,
      to,
      condicionPago,
      selectedIds,
      usuario: usuario || null, // por ahora opcional
    }),
  });
}
/** 📚 Histórico: listar liquidaciones de clientes */
export async function fetchLiquidaciones({ from, to, condicionPago } = {}) {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  if (condicionPago && condicionPago !== "TODAS") {
    params.append("condicionPago", condicionPago);
  }
  // Si no hay params, igual llamamos al endpoint sin querystring
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