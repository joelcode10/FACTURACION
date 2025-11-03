// src/pages/Hhmm.jsx
import React, { useState, useMemo } from "react";
import { fetchHhmmProcess } from "../lib/api";

// Utilidad para usar la fecha de hoy
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function Hhmm() {
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [groups, setGroups] = useState([]);
  const [filters, setFilters] = useState({
    evaluadores: [],
    companias: [],
    sedes: [],
  });

  const [evaluadorFiltro, setEvaluadorFiltro] = useState("todos");
  const [companiaFiltro, setCompaniaFiltro] = useState("todos");
  const [sedeFiltro, setSedeFiltro] = useState("todos"); // por ahora NO funcional

  // Para mostrar la parte de resumen sólo luego de procesar
  const [hasProcessed, setHasProcessed] = useState(false);

  const handleProcesar = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchHhmmProcess({
        from: fromDate,
        to: toDate,
      });

      setGroups(data.groups || []);
      setFilters(
        data.filters || { evaluadores: [], companias: [], sedes: [] }
      );

      setEvaluadorFiltro("todos");
      setCompaniaFiltro("todos");
      setSedeFiltro("todos");

      setHasProcessed(true);
    } catch (e) {
      console.error(e);
      setError("Ocurrió un error al procesar honorarios médicos.");
      setGroups([]);
      setFilters({ evaluadores: [], companias: [], sedes: [] });
      setHasProcessed(true);
    } finally {
      setLoading(false);
    }
  };

  // Aplicar filtros sobre el resultado ya agrupado
  const groupsFiltrados = useMemo(() => {
    return (groups || []).filter((g) => {
      const okEval =
        evaluadorFiltro === "todos" || g.evaluador === evaluadorFiltro;
      const okComp =
        companiaFiltro === "todos" || g.companiaMedica === companiaFiltro;

      // Sede: por ahora la dejamos sin efecto aunque exista el combo
      const okSede =
        sedeFiltro === "todos" || g.sede === sedeFiltro || !g.sede;

      return okEval && okComp && okSede;
    });
  }, [groups, evaluadorFiltro, companiaFiltro, sedeFiltro]);

  const totalImporte = groupsFiltrados.reduce(
    (acc, g) => acc + (Number(g.importe) || 0),
    0
  );

  const handleExportar = () => {
    if (!groupsFiltrados.length) {
      alert("No hay honorarios para exportar.");
      return;
    }
    // Aquí luego se implementa la exportación real (Excel / PDF)
    alert(
      `Exportarías ${groupsFiltrados.length} grupo(s) de honorarios. (Pendiente implementación backend)`
    );
  };

  return (
    <div className="module-page">
      {/* OJO:
          El título grande “Honorarios Médicos” ya lo pinta el layout de módulos.
          Aquí sólo van las secciones de contenido.
      */}

      <div className="module-sections-vertical">
        {/* --------- PROCESAR (arriba) --------- */}
        <section className="section-card">
          <h2 className="section-title">Procesar honorarios</h2>
          <p className="section-subtitle">
            Ingresa un rango de fechas para calcular los honorarios médicos a partir
            de las atenciones registradas.
          </p>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="hhmm-desde" className="form-label">
                Desde
              </label>
              <input
                id="hhmm-desde"
                type="date"
                className="form-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="hhmm-hasta" className="form-label">
                Hasta
              </label>
              <input
                id="hhmm-hasta"
                type="date"
                className="form-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn-primary mt-3"
            onClick={handleProcesar}
            disabled={loading}
          >
            {loading ? "Procesando..." : "Procesar"}
          </button>

          {error && <p className="text-error mt-2">{error}</p>}
        </section>

        {/* --------- RESUMEN (abajo, sólo si ya procesó) --------- */}
        {hasProcessed && (
          <section className="section-card">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">Resumen de honorarios</h2>
                <p className="section-subtitle">
                  Filtra por evaluador y compañía médica. Desde aquí podrás
                  exportar los honorarios visibles.
                </p>
              </div>
            </div>

            {/* Filtros de resumen */}
            <div className="filters-row">
              <div className="form-field">
                <label className="form-label">Evaluador</label>
                <select
                  className="form-select"
                  value={evaluadorFiltro}
                  onChange={(e) => setEvaluadorFiltro(e.target.value)}
                >
                  <option value="todos">(Todos)</option>
                  {filters.evaluadores?.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Compañía médica</label>
                <select
                  className="form-select"
                  value={companiaFiltro}
                  onChange={(e) => setCompaniaFiltro(e.target.value)}
                >
                  <option value="todos">(Todas)</option>
                  {filters.companias?.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">
                  Sede <span className="form-help">(vista)</span>
                </label>
                <select
                  className="form-select"
                  value={sedeFiltro}
                  onChange={(e) => setSedeFiltro(e.target.value)}
                  disabled // por ahora no funcional
                >
                  <option value="todos">(Todas)</option>
                  {filters.sedes?.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabla resumen */}
            <div className="table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Fecha inicio</th>
                    <th>Evaluador</th>
                    <th>Compañía médica</th>
                    <th>Sede</th>
                    <th style={{ textAlign: "right" }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {groupsFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="table-empty">
                        {loading
                          ? "Procesando..."
                          : "No hay honorarios para los filtros seleccionados."}
                      </td>
                    </tr>
                  ) : (
                    groupsFiltrados.map((g) => (
                      <tr key={g.id}>
                        <td>{g.fechaInicioMin}</td>
                        <td>{g.evaluador}</td>
                        <td>{g.companiaMedica}</td>
                        <td>{g.sede || "-"}</td>
                        <td style={{ textAlign: "right" }}>
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

            {/* Pie: totales + exportar */}
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
                className="btn-secondary"
                onClick={handleExportar}
                disabled={!groupsFiltrados.length}
              >
                Exportar honorarios visibles
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
