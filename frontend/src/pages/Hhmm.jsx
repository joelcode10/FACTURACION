// frontend/src/pages/Hhmm.jsx
import React, { useState } from "react";
import { fetchHhmmProcess } from "../lib/api.js";

export default function Hhmm() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");

  const onProcess = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await fetchHhmmProcess({ from, to });
      setGroups(data.groups || []);
    } catch (e) {
      setError(e.message || "Error al procesar HHMM");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="module-page">
      <div className="module-sections-vertical">
        <div className="section-card">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">Procesar Honorarios Médicos</h3>
              <p className="section-subtitle">
                Selecciona un rango de fechas y ejecuta el proceso.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Desde</label>
              <input
                type="date"
                className="form-input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Hasta</label>
              <input
                type="date"
                className="form-input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3">
            <button className="btn-primary" onClick={onProcess} disabled={loading}>
              {loading ? "Procesando..." : "Procesar"}
            </button>
          </div>

          {error && <div className="text-error mt-3">{error}</div>}
        </div>

        <div className="section-card">
          <h3 className="section-title">Resumen (HHMM)</h3>
          {!groups.length ? (
            <div className="table-empty">Sin datos</div>
          ) : (
            <div className="table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Clave</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => (
                    <tr key={i}>
                      <td>{g.clave || g.id || "-"}</td>
                      <td>{Number(g.importe || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
