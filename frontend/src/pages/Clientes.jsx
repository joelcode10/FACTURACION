// src/pages/Clientes.jsx
import { useEffect, useState } from "react";
import { fetchClientesProcess, exportClientes } from "../api/clientes.js";

export default function ClientesPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [groups, setGroups] = useState([]);
  const [details, setDetails] = useState({});
  const [selected, setSelected] = useState({}); // groupId: true/false

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchClientesProcess();
        if (!mounted) return;
        setGroups(data.groups || []);
        setDetails(data.detailsByGroupId || {});
        setErr("");
      } catch (e) {
        console.error(e);
        setErr("No se pudo cargar la información.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const toggleOne = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = (checked) => {
    const map = {};
    for (const g of groups) map[g.id] = checked;
    setSelected(map);
  };

  const doExport = async () => {
    const ids = Object.entries(selected).filter(([_, v]) => v).map(([k]) => k);
    if (!ids.length) {
      alert("Selecciona al menos un grupo.");
      return;
    }
    try {
      await exportClientes(ids);
      alert("Exportación OK (mock).");
    } catch {
      alert("Error al exportar.");
    }
  };

  if (loading) return <div className="container"><p>Cargando…</p></div>;
  if (err) return <div className="container"><p style={{color:"crimson"}}>{err}</p></div>;

  const subtotal = groups
    .filter(g => selected[g.id])
    .reduce((acc, g) => acc + (Number(g.importe) || 0), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  return (
    <div className="container">
      <h2>Liquidación de Clientes</h2>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <button className="btn btn-outline" onClick={() => history.back()}>← Volver</button>
          <div style={{ flex: 1 }} />
          <label className="row">
            <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} />
            <span>Seleccionar todo</span>
          </label>
          <button className="btn btn-primary" onClick={doExport}>Exportar</button>
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>SEL</th>
                <th>Fecha mínima</th>
                <th>Cliente</th>
                <th>Unidad de producción</th>
                <th>Tipo de evaluación</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!selected[g.id]}
                      onChange={() => toggleOne(g.id)}
                    />
                  </td>
                  <td>{g.fechaInicioMin}</td>
                  <td><span className="badge">{g.cliente}</span></td>
                  <td>{g.unidadProduccion || "-"}</td>
                  <td>{g.tipoEvaluacion}</td>
                  <td>S/ {Number(g.importe).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Panel de totales */}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <div className="card" style={{ minWidth: 220 }}>
            <div><b>Seleccionados:</b> {Object.values(selected).filter(Boolean).length || "Todos"}</div>
            <div><b>Sub Total:</b> S/ {subtotal.toFixed(2)}</div>
            <div><b>IGV (18%):</b> S/ {igv.toFixed(2)}</div>
            <div><b>Total:</b> S/ {total.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Bloque simple de detalle (demo) */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Detalle (demo)</h3>
        <p>Haz clic en un grupo en el futuro para ver pacientes. Por ahora, datos mock:</p>
        <pre style={{ whiteSpace: "pre-wrap", background:"#f8fafc", padding: 12, borderRadius: 8 }}>
{JSON.stringify(details, null, 2)}
        </pre>
      </div>
    </div>
  );
}
