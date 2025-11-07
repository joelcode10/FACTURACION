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
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
      if (json.debug) message += ` (${json.debug})`;
    } catch {
      // texto plano, lo dejamos como está
    }
    throw new Error(message);
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/** 🔐 Login */
export async function loginApi(username, password) {
  // El backend acepta "email" o "username"
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

/** 🩺 Honorarios médicos */
export async function fetchHhmmProcess({ from, to }) {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  return request(`/api/hhmm/process?${params.toString()}`);
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

/** 👤 Usuarios: listado */
export async function fetchUsers() {
  return request("/api/users");
}

/** 👤 Usuarios: invitar */
export async function inviteUser({ nombre, email, rol }) {
  return request("/api/users/invite", {
    method: "POST",
    body: JSON.stringify({ nombre, email, rol }),
  });
}

/** 👤 Usuarios: completar invitación */
export async function completeInvite({ token, password }) {
  return request("/api/users/complete", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

/** 👤 Usuarios: cancelar invitación */
export async function cancelInvite(userId) {
  return request("/api/users/cancel-invite", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

/** 👤 Usuarios: eliminar usuario */
export async function deleteUser(userId) {
  return request(`/api/users/${userId}`, {
    method: "DELETE",
  });
}
