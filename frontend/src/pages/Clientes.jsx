import React, { useMemo, useState, useEffect } from "react";
import { fetchClientesProcess, saveExclusions, exportLiquidaciones } from "../lib/api.js";

export default function Clientes() {
  // filtros de consulta al backend
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [condicionPago, setCondicionPago] = useState("TODAS");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // datos del backend
  const [groups, setGroups] = useState([]);
  const [detailsByGroupId, setDetailsByGroupId] = useState({});
  const [filters, setFilters] = useState({ clientes: [], tipos: [], sedes: [] });

  // filtros de la tabla resumen
  const [fCliente, setFCliente] = useState("TODOS");
  const [fTipo, setFTipo] = useState("TODOS");
  const [fSede, setFSede] = useState("TODOS");

  // selección de grupos
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // modal detalle
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroupId, setDetailGroupId] = useState(null);
  const [exclState, setExclState] = useState(new Map()); // key: `${nro}||${doc}` -> bool

  useEffect(() => { // reset filtros UI cuando llegan nuevos filtros
    setFCliente("TODOS");
    setFTipo("TODOS");
    setFSede("TODOS");
  }, [filters]);

  async function handleProcess(e) {
    e?.preventDefault?.();
    setError("");
    if (!from || !to) return setError("Debes indicar fecha desde y hasta.");

    try {
      setLoading(true);
      const resp = await fetchClientesProcess({ from, to, condicionPago });
      if (resp?.ok) {
        const gs = (resp.groups || []).map((g, i) => ({ ...g, id: g.id || `g_${i + 1}` }));
        setGroups(gs);
        setDetailsByGroupId(resp.detailsByGroupId || {});
        setFilters(resp.filters || { clientes: [], tipos: [], sedes: [] });
        setSelectedIds(new Set());
        setSelectAll(false);
      } else {
        setGroups([]); setDetailsByGroupId({}); setFilters({ clientes: [], tipos: [], sedes: [] });
        setError(resp?.message || "No se pudo procesar.");
      }
    } catch (err) {
      setError(err.message || "Error al procesar.");
      setGroups([]); setDetailsByGroupId({}); setFilters({ clientes: [], tipos: [], sedes: [] });
    } finally {
      setLoading(false);
    }
  }

  // grupos filtrados por UI
  const viewGroups = useMemo(() => {
    return groups.filter(g => {
      if (fCliente !== "TODOS" && g.cliente !== fCliente) return false;
      if (fTipo !== "TODOS" && g.tipoEvaluacion !== fTipo) return false;
      // fSede se aplica mirando el detalle del grupo (si alguna fila coincide con sede)
      if (fSede !== "TODOS") {
        const rows = detailsByGroupId[g.id] || [];
        const ok = rows.some(r => r.sedeNombre === fSede);
        if (!ok) return false;
      }
      return true;
    });
  }, [groups, detailsByGroupId, fCliente, fTipo, fSede]);

  // totales (sobre los seleccionados visibles)
  const subtotal = useMemo(() => {
    let s = 0;
    for (const g of viewGroups) if (selectedIds.has(g.id)) s += Number(g.importe || 0);
    return s;
  }, [viewGroups, selectedIds]);

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const ns = new Set(prev);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  }
  function toggleSelectAll() {
    setSelectAll(prev => {
      const next = !prev;
      setSelectedIds(next ? new Set(viewGroups.map(g => g.id)) : new Set());
      return next;
    });
  }

  function openDetalle(id) {
    setDetailGroupId(id);
    // construir estado de exclusiones basado en los rows (vienen marcados con .excluded)
    const rows = detailsByGroupId[id] || [];
    const map = new Map();
    for (const r of rows) {
      const k = `${r.nro || ""}||${r.documento || ""}`;
      map.set(k, !!r.excluded);
    }
    setExclState(map);
    setDetailOpen(true);
  }
  function closeDetalle() { setDetailOpen(false); setDetailGroupId(null); setExclState(new Map()); }

  // detalle por paciente (agregando importe por paciente)
  const patientsInGroup = useMemo(() => {
    if (!detailGroupId) return [];
    const rows = detailsByGroupId[detailGroupId] || [];
    const acc = new Map();
    for (const r of rows) {
      const k = `${r.paciente || ""}||${r.documento || ""}||${r.nro || ""}`;
      const prev = acc.get(k) || { paciente: r.paciente, documento: r.documento, nro: r.nro, importe: 0 };
      prev.importe += Number(r.precioCb || 0);
      acc.set(k, prev);
    }
    return Array.from(acc.values());
  }, [detailGroupId, detailsByGroupId]);

  function setExclude(nro, doc, value) {
    const k = `${nro || ""}||${doc || ""}`;
    setExclState(prev => {
      const m = new Map(prev);
      m.set(k, !!value);
      return m;
    });
  }

  async function saveExclusionsClick() {
    const items = [];
    for (const [k, v] of exclState.entries()) {
      const [nro, documento] = k.split("||");
      items.push({ nro, documento, exclude: !!v });
    }
    await saveExclusions(items);
    closeDetalle();
    // refresca resumen (aplica exclusiones a totales)
    await handleProcess();
  }

  async function exportarSeleccionados() {
    if (!selectedIds.size) return;
    const selectedIdsArr = Array.from(selectedIds);
    const blob = await exportLiquidaciones({
      from, to, condicionPago,
      selectedIds: selectedIdsArr
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "liquidaciones.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const fmtMoney = n => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="module-page">
      {/* Procesar (ancho completo) */}
      <div className="section-card section-card-wide">
        <h3 className="section-title">Procesar liquidación</h3>
        <p className="section-subtitle">Filtra por rango de fechas y condición de pago.</p>

        <form className="form-grid" onSubmit={handleProcess}>
          <div className="form-field">
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Condición de pago</label>
            <select className="form-select" value={condicionPago} onChange={(e) => setCondicionPago(e.target.value)}>
              <option value="TODAS">Todas</option>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>

          <div className="mt-3" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Procesando..." : "Procesar"}
            </button>
          </div>
        </form>

        {error && <div className="text-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* Resumen con filtros UI */}
      <div className="section-card">
        <div className="section-header-row">
          <div>
            <h3 className="section-title">Resumen de liquidación</h3>
            <p className="section-subtitle">Fecha inicio · Cliente · Unidad de producción · Tipo evaluación · Importe</p>
          </div>
          <div className="filter-row">
            <select className="form-select" value={fCliente} onChange={(e)=>setFCliente(e.target.value)}>
              <option value="TODOS">Todos los clientes</option>
              {filters.clientes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="form-select" value={fTipo} onChange={(e)=>setFTipo(e.target.value)}>
              <option value="TODOS">Todos los tipos</option>
              {filters.tipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="form-select" value={fSede} onChange={(e)=>setFSede(e.target.value)}>
              <option value="TODOS">Todas las sedes</option>
              {filters.sedes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="simple-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} /></th>
                <th>Fecha inicio</th>
                <th>Cliente</th>
                <th>Unidad de producción</th>
                <th>Tipo evaluación</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {viewGroups.length === 0 ? (
                <tr><td className="table-empty" colSpan={7}>Sin resultados con los filtros actuales.</td></tr>
              ) : viewGroups.map(g => (
                <tr key={g.id}>
                  <td><input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleSelect(g.id)} /></td>
                  <td className="nowrap">{g.fechaInicioMin || "-"}</td>
                  <td>{g.cliente || "-"}</td>
                  <td>{g.unidadProduccion || "-"}</td>
                  <td>{g.tipoEvaluacion || "-"}</td>
                  <td style={{ textAlign: "right" }}>{fmtMoney(g.importe)}</td>
                  <td><button className="btn-primary btn-sm" onClick={() => openDetalle(g.id)}>Ver detalle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pie: totales + exportar (abajo de la tabla) */}
        <div className="summary-footer">
          <div className="summary-totals">
            <span className="summary-label">Seleccionados:</span>
            <span className="summary-value">{selectedIds.size}</span>
            <span className="summary-label">Subtotal:</span>
            <span className="summary-value">{fmtMoney(subtotal)}</span>
            <span className="summary-label">IGV (18%):</span>
            <span className="summary-value">{fmtMoney(subtotal * 0.18)}</span>
            <span className="summary-label">Total:</span>
            <span className="summary-value">{fmtMoney(subtotal * 1.18)}</span>
          </div>
          <div>
            <button className="btn-primary btn-sm" disabled={!selectedIds.size} onClick={exportarSeleccionados}>
              Exportar seleccionados
            </button>
          </div>
        </div>
      </div>

      {/* Modal detalle: Paciente, Documento, Importe + No liquidar + Guardar */}
      {detailOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
          onClick={closeDetalle}
        >
          <div className="section-card" style={{ width: "min(860px, 95vw)" }} onClick={(e) => e.stopPropagation()}>
            <div className="section-header-row" style={{ marginBottom: 8 }}>
              <h3 className="section-title" style={{ marginBottom: 0 }}>Detalle de pacientes</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-primary btn-sm" onClick={saveExclusionsClick}>Guardar</button>
                <button className="btn-primary btn-sm" onClick={closeDetalle}>Cerrar</button>
              </div>
            </div>
            <p className="section-subtitle" style={{ marginTop: 0 }}>
              Marca “No liquidar” para excluir pacientes de esta liquidación y próximas.
            </p>

            <div className="table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Documento</th>
                    <th style={{ textAlign: "right" }}>Importe</th>
                    <th>No liquidar</th>
                  </tr>
                </thead>
                <tbody>
                  {patientsInGroup.length === 0 ? (
                    <tr><td className="table-empty" colSpan={4}>Sin pacientes.</td></tr>
                  ) : patientsInGroup.map((p, idx) => {
                    const k = `${p.nro || ""}||${p.documento || ""}`;
                    const checked = !!exclState.get(k);
                    return (
                      <tr key={`${k}||${idx}`}>
                        <td>{p.paciente || "-"}</td>
                        <td>{p.documento || "-"}</td>
                        <td style={{ textAlign: "right" }}>{fmtMoney(p.importe)}</td>
                        <td>
                          <input type="checkbox" checked={checked} onChange={(e)=>setExclude(p.nro, p.documento, e.target.checked)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
