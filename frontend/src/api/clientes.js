// frontend/src/api/clientes.js
export async function getLiquidacionesClientes(params) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`http://localhost:3000/api/clientes/process?${q}`);
  if (!res.ok) throw new Error("Error cargando liquidaciones");
  return res.json();
}
export async function fetchClientesProcess() {
  const res = await fetch("/api/clientes/process");
  if (!res.ok) throw new Error("Error al cargar datos de clientes");
  return res.json();
}
export async function exportClientes(selectedIds) {
  const res = await fetch("/api/clientes/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedIds }),
  });
  if (!res.ok) throw new Error("Error al exportar");
  return res.json();
}
export async function exportarLiquidaciones(payload) {
  const res = await fetch(`http://localhost:3000/api/clientes/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Error exportando");
  return res.json();
}
