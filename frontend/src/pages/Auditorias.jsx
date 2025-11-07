// src/pages/Auditorias.jsx
import React, { useState, useMemo } from "react";
import { fetchAuditoriasProcess } from "../lib/api";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Auditorias() {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasProcessed, setHasProcessed] = useState(false);

  const [rows, setRows] = useState([]); // groups devueltos por API
  const [auditores, setAuditores] = useState([]);
  const [sedes, setSedes] = useState([]);

  const [filtroAuditor, setFiltroAuditor] = useState("TODOS");
  const [filtroSede, setFiltroSede] = useState("TODAS");

  const handleProcess = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setHasProcessed(false);

    try {
      const data = await fetchAuditoriasProcess({ from, to });

      const groups = data.groups || [];
      const uniqueAuditores = Array.from(
        new Set(groups.map((g) => g.auditadoPor).filter(Boolean))
      );
      const uniqueSedes = Array.from(
        new Set((data.filters?.sedes || []).filter(Boolean))
      );

      setRows(groups);
      setAuditores(uniqueAuditores);
      setSedes(uniqueSedes);
      setHasProcessed(true);
    } catch (err) {
      console.error(err);
      setError("Ocurrió un error al procesar las auditorías.");
      setRows([]);
      setAuditores([]);
      setSedes([]);
      setHasProcessed(true);
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    let r = [...rows];

    if (filtroAuditor !== "TODOS") {
      r = r.filter((g) => g.auditadoPor === filtroAuditor);
    }

    // Por ahora la sede es opcional / no funcional,
    // pero dejamos el filtro preparado para futuro:
    if (filtroSede !== "TODAS" && filtroSede !== "") {
      r = r.filter((g) => g.sede === filtroSede);
    }

    return r;
  }, [rows, filtroAuditor, filtroSede]);

  const totalImporte = useMemo(
    () => filteredRows.reduce((acc, g) => acc + (Number(g.importe) || 0), 0),
    [filteredRows]
  );

  return (
    <div className="module-page">

      <div className="module-sections-vertical">
        {/* BLOQUE 1: PROCESAR */}
        <section className="section-card">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Procesar auditorías</h2>
              <p className="section-subtitle">
                Ingresa un rango de fechas. El sistema agrupará por auditor y
                calculará el importe según las reglas definidas.
              </p>
            </div>
          </div>

          <form onSubmit={handleProcess} className="form-grid">
            <div className="form-field">
              <label className="form-label" htmlFor="aud-from">
                Desde
              </label>
              <input
                id="aud-from"
                type="date"
                className="form-input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="aud-to">
                Hasta
              </label>
              <input
                id="aud-to"
                type="date"
                className="form-input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <div className="mt-3">
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
                {loading ? "Procesando..." : "Procesar"}
              </button>
            </div>
          </form>

          {error && <p className="text-error mt-3">{error}</p>}
        </section>

        {/* BLOQUE 2: RESUMEN – solo si ya procesé al menos una vez */}
        {hasProcessed && (
          <section className="section-card">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">Resumen de auditorías</h2>
                <p className="section-subtitle">
                  Filtra por auditor (y sede, en una siguiente etapa) y exporta
                  la información seleccionada.
                </p>
              </div>
            </div>

            {/* Filtros */}
            <div className="filters-row">
              <div className="form-field" style={{ minWidth: 220 }}>
                <label className="form-label" htmlFor="filtro-auditor">
                  Auditor
                </label>
                <select
                  id="filtro-auditor"
                  className="form-select"
                  value={filtroAuditor}
                  onChange={(e) => setFiltroAuditor(e.target.value)}
                >
                  <option value="TODOS">(Todos)</option>
                  {auditores.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field" style={{ minWidth: 220 }}>
                <label className="form-label" htmlFor="filtro-sede">
                  Sede (no funcional por ahora)
                </label>
                <select
                  id="filtro-sede"
                  className="form-select"
                  value={filtroSede}
                  onChange={(e) => setFiltroSede(e.target.value)}
                >
                  <option value="TODAS">(Todas)</option>
                  {sedes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabla */}
            <div className="table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Fecha auditoría</th>
                    <th>Auditor</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="table-empty">
                        No hay auditorías para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((g) => (
                      <tr key={g.id}>
                        <td>{g.fechaAuditorMin}</td>
                        <td>{g.auditadoPor}</td>
                        <td>
                          {Number(g.importe || 0).toLocaleString("es-PE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pie: totales + botón exportar (por ahora sólo diseño) */}
            <div className="summary-footer">
              <div className="summary-totals">
                <span className="summary-label">Total importe mostrado:</span>
                <span className="summary-value">
                  {totalImporte.toLocaleString("es-PE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <button
                type="button"
                className="btn-primary"
                disabled={filteredRows.length === 0}
                onClick={() => {
                  // Aquí luego conectamos la exportación real
                  alert(
                    "Exportar auditorías todavía no está implementado en esta versión."
                  );
                }}
              >
                Exportar auditorías visibles
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
