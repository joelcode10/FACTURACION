// frontend/src/api/clientes.js

// Usamos el proxy de Vite: /api -> http://localhost:3001
const BASE = "/api/clientes";

// Obtiene el resumen + detalles + filtros desde el backend
export async function fetchClientesProcess() {
  const res = await fetch(`${BASE}/process`);
  if (!res.ok) throw new Error("Error al cargar datos de clientes");
  return res.json();
}

// Simula exportación de grupos seleccionados
export async function exportClientes(selectedIds) {
  const res = await fetch(`${BASE}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedIds })
  });
  if (!res.ok) throw new Error("Error al exportar");
  return res.json();
}
