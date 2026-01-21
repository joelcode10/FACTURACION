import React, { useMemo, useState, useEffect } from "react";
import {
  fetchHhmmProcess,
  liquidarHonorarios,
  saveHonorariosExclusions,
  exportHonorarios,
} from "../lib/api.js";

const STORAGE_KEY = "honorarios_medicos_state_v1";

export default function Honorarios() {
  // Filtros principales
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  
  // Estado de procesos
  const [loading, setLoading] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [savingExclusions, setSavingExclusions] = useState(false);
  const [error, setError] = useState("");
  const [mensajeLiq, setMensajeLiq] = useState("");

  // Datos
  const [groups, setGroups] = useState([]);
  const [detailsByGroupId, setDetailsByGroupId] = useState({});
  const [filters, setFilters] = useState({ evaluadores: [], companias: [], sedes: [] });
  // Lista de estados disponibles encontrados en la data cargada
  const [availableEstados, setAvailableEstados] = useState([]);

  // Filtros visuales (Tabla)
  const [fEvaluador, setFEvaluador] = useState("TODOS");
  const [fCompania, setFCompania] = useState("TODOS");
  const [fSede, setFSede] = useState("TODOS");
  
  // Filtro de Estados de Prestación (Multi-select)
  const [estadosSeleccionados, setEstadosSeleccionados] = useState([]);
  const [dropdownEstadosOpen, setDropdownEstadosOpen] = useState(false);

  // Selección
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Modal Detalle
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroupId, setDetailGroupId] = useState(null);
  const [exclState, setExclState] = useState(new Map()); 

  // Persistencia de fechas
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.from) setFrom(saved.from);
        if (saved.to) setTo(saved.to);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to }));
  }, [from, to]);

  // Reset filtros al procesar nuevo
  useEffect(() => {
    setFEvaluador("TODOS");
    setFCompania("TODOS");
    setFSede("TODOS");
    setEstadosSeleccionados([]); 
  }, [groups]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const closeDropdown = (e) => {
        if (!e.target.closest('.estado-filter')) {
            setDropdownEstadosOpen(false);
        }
    };
    document.addEventListener('click', closeDropdown);
    return () => document.removeEventListener('click', closeDropdown);
  }, []);

  // ========================================================================
  // 1. PROCESAR (BUSCAR)
  // ========================================================================
  const onProcess = async () => {
    setError("");
    if (!from || !to) return setError("Indica fechas.");
    setLoading(true);
    
    try {
      const data = await fetchHhmmProcess({ from, to });
      if (data?.ok) {
        setGroups(data.groups || []);
        setDetailsByGroupId(data.detailsByGroupId || {});
        setFilters(data.filters || { evaluadores: [], companias: [], sedes: [] });
        
        // Extraer estados únicos
        const allRows = Object.values(data.detailsByGroupId || {}).flat();
        const uniqueEstados = [...new Set(allRows.map(r => r.estadoPrestacion || "SIN ESTADO"))].sort();
        setAvailableEstados(uniqueEstados);

        setSelectedIds(new Set());
        setSelectAll(false);
      } else {
        throw new Error(data?.message || "Error al procesar.");
      }
    } catch (e) {
      setError(e.message || "Error de conexión.");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // 2. FILTRADO Y VISTA
  // ========================================================================
  const viewGroups = useMemo(() => {
    const result = [];

    for (const g of groups) {
      // 1. Filtros básicos
      if (fEvaluador !== "TODOS" && g.evaluador !== fEvaluador) continue;
      if (fCompania !== "TODOS" && g.compania !== fCompania) continue;
      if (fSede !== "TODOS" && g.sedeNombre !== fSede) continue;

      // 2. Filtro por Estado de Prestación
      const groupRows = detailsByGroupId[g.id] || [];
      let rowsFiltradas = groupRows;

      if (estadosSeleccionados.length > 0) {
        rowsFiltradas = groupRows.filter(r => 
          estadosSeleccionados.includes(r.estadoPrestacion || "SIN ESTADO")
        );
        if (rowsFiltradas.length === 0) continue; 
      }

      // 3. Recalcular Importe Visible
      const importeRecalculado = rowsFiltradas.reduce((sum, r) => sum + Number(r.importe || 0), 0);

      // Determinar Estado Visual
      const esLiquidado = !!g.codigo || g.tieneLiquidados;

      result.push({
        ...g,
        importeVisible: importeRecalculado, 
        rowsVisibles: rowsFiltradas,        
        estadoVisual: esLiquidado ? "LIQUIDADO" : "NO LIQUIDADO"
      });
    }
    return result;
  }, [groups, detailsByGroupId, fEvaluador, fCompania, fSede, estadosSeleccionados]);

  // Calcular subtotal de la selección actual
  const subtotalVisible = useMemo(() => {
    let s = 0;
    viewGroups.forEach(g => {
      if (selectedIds.has(g.id)) s += Number(g.importeVisible || 0);
    });
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
    setSelectAll(!selectAll);
    setSelectedIds(!selectAll ? new Set(viewGroups.map(g => g.id)) : new Set());
  }

  // ========================================================================
  // 3. FUNCIONES DE MODAL
  // ========================================================================
  function closeDetalle() {
    setDetailOpen(false);
    setDetailGroupId(null);
  }

  const currentGroupVisual = viewGroups.find(g => g.id === detailGroupId);
  const currentRows = currentGroupVisual ? currentGroupVisual.rowsVisibles : [];

  const modalTotal = useMemo(() => {
    return currentRows.reduce((acc, r) => {
      const k = `${r.nro}||${r.documento}`;
      const excl = !!exclState.get(k);
      return acc + (excl ? 0 : Number(r.importe || 0));
    }, 0);
  }, [currentRows, exclState]);

  async function handleSaveExclusions() {
    const originalGroup = groups.find(g => g.id === detailGroupId);
    
    setSavingExclusions(true);
    try {
      const itemsToSend = [];
      currentRows.forEach(r => {
        const k = `${r.nro || ""}||${r.documento || ""}`;
        const marcado = !!exclState.get(k);
        itemsToSend.push({
          nro: r.nro,
          documento: r.documento,
          exclude: marcado,
          paciente: r.paciente,
          evaluador: originalGroup.evaluador,
          compania: originalGroup.compania,
          sedeNombre: originalGroup.sedeNombre,
          importe: r.importe,
          fechaInicio: r.fechaInicio,
          createdBy: "admin"
        });
      });

      const res = await saveHonorariosExclusions({ from, to, items: itemsToSend });
      if (!res.ok) throw new Error("Error guardando.");

      setDetailsByGroupId(prev => {
        const next = { ...prev };
        if (next[detailGroupId]) {
          next[detailGroupId] = next[detailGroupId].map(r => {
            const k = `${r.nro}||${r.documento}`;
            if (exclState.has(k)) return { ...r, isPendiente: exclState.get(k) };
            return r;
          });
        }
        return next;
      });
      
      setGroups(prev => [...prev]);
      closeDetalle();
    } catch (e) {
      console.error(e);
      alert("Error al guardar.");
    } finally {
      setSavingExclusions(false);
    }
  }

  // ========================================================================
  // 4. LIQUIDAR
  // ========================================================================
  async function handleLiquidar() {
    setMensajeLiq("");
    if (!selectedIds.size) return alert("Selecciona grupos.");
    
    const idsArr = Array.from(selectedIds);
    const toLiquidateGroups = viewGroups.filter(g => idsArr.includes(g.id) && g.estadoVisual !== "LIQUIDADO");

    if (!toLiquidateGroups.length) return alert("Grupos ya liquidados.");
    if (!window.confirm(`¿Liquidar ${toLiquidateGroups.length} grupo(s)?`)) return;

    const rowsToSend = [];

    toLiquidateGroups.forEach(g => {
      const rows = g.rowsVisibles || []; 
      rows.forEach(r => {
        const k = `${r.nro || ""}||${r.documento || ""}`;
        const esExcluido = !!exclState.get(k) || (r.isPendiente && !exclState.has(k));
        if (!esExcluido && !r.estaLiquidado) {
          rowsToSend.push({
            ...r,
            evaluador: g.evaluador,
            compania: g.compania,
            sedeNombre: g.sedeNombre
          });
        }
      });
    });

    if (!rowsToSend.length) return alert("No hay pacientes disponibles para liquidar con los filtros actuales.");

    try {
      setLiquidando(true);
      const resp = await liquidarHonorarios({ from, to, rows: rowsToSend });
      
      if (!resp.ok) throw new Error(resp.message || "Error al liquidar.");

      setMensajeLiq(`✅ Liquidación Éxitosa. Código: ${resp.codigo}`);

      setGroups(prev => prev.map(g => {
        if (toLiquidateGroups.find(t => t.id === g.id)) {
          return {
            ...g,
            codigo: resp.codigo,
            tieneLiquidados: true,
          };
        }
        return g;
      }));

      setDetailsByGroupId(prev => {
        const next = { ...prev };
        toLiquidateGroups.forEach(g => {
          if (next[g.id]) {
            next[g.id] = next[g.id].map(r => {
               const fueEnviada = rowsToSend.some(enviada => enviada.nro === r.nro && enviada.documento === r.documento);
               if (fueEnviada) return { ...r, estaLiquidado: true };
               return r;
            });
          }
        });
        return next;
      });

      setSelectedIds(new Set());
      setSelectAll(false);

    } catch (e) {
      console.error(e);
      alert(e.message);
    } finally {
      setLiquidando(false);
    }
  }

  // ========================================================================
  // 5. EXPORTAR
  // ========================================================================
  async function handleExport() {
    if (!selectedIds.size) return alert("Selecciona grupos.");
    
    const rowsToExport = [];
    const idsArr = Array.from(selectedIds);
    
    for (const gid of idsArr) {
      const gView = viewGroups.find(g => g.id === gid);
      if (!gView) continue;

      const rows = gView.rowsVisibles || []; 
      rows.forEach(r => {
        const k = `${r.nro || ""}||${r.documento || ""}`;
        const esExcluido = !!exclState.get(k) || (r.isPendiente && !exclState.has(k));
        
        if (!esExcluido) {
          rowsToExport.push({
            ...r,
            evaluador: gView.evaluador,
            compania: gView.compania,
            sedeNombre: gView.sedeNombre
          });
        }
      });
    }

    if (!rowsToExport.length) return alert("Nada para exportar.");

    try {
      setExportando(true);
      const blob = await exportHonorarios({ rows: rowsToExport });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Honorarios_${from}_${to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
      alert("Error al exportar.");
    } finally {
      setExportando(false);
    }
  }

  const fmtMoney = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="module-page">
      <div className="module-sections-vertical">
        
        {/* PANEL BUSQUEDA */}
        <div className="section-card section-card-wide">
          <h3 className="section-title">HONORARIOS MÉDICOS</h3>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Desde</label>
              <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Hasta</label>
              <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div className="mt-3" style={{display:'flex', alignItems:'flex-end'}}>
              <button className="btn-primary" onClick={onProcess} disabled={loading}>
                {loading ? "Procesando..." : "Buscar"}
              </button>
            </div>
          </div>
          {error && <div className="text-error mt-3">{error}</div>}
          {mensajeLiq && <div className="text-success mt-3">{mensajeLiq}</div>}
        </div>

        {/* TABLA RESUMEN */}
        <div className="section-card">
          <div className="section-header-row">
            <h3 className="section-title">Resumen de Honorarios</h3>
            <div className="filter-row">
              <select className="form-select" value={fEvaluador} onChange={e => setFEvaluador(e.target.value)}>
                <option value="TODOS">Todos los Evaluadores</option>
                {filters.evaluadores.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <select className="form-select" value={fCompania} onChange={e => setFCompania(e.target.value)}>
                <option value="TODOS">Todas las Compañías</option>
                {filters.companias.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <select className="form-select" value={fSede} onChange={e => setFSede(e.target.value)}>
                <option value="TODOS">Todas las Sedes</option>
                {filters.sedes.map(x => <option key={x} value={x}>{x}</option>)}
              </select>

              {/* FILTRO ESTADO PRESTACIÓN (DISEÑO UNIFICADO) */}
              <div className="estado-filter" style={{position:'relative', minWidth: '180px'}}>
                {/* Usamos un DIV con clase form-select para imitar perfectamente a los selects de al lado.
                   El estilo inline asegura fondo blanco y alineación.
                */}
                <div 
                  className="form-select" 
                  style={{
                    cursor:'pointer', 
                    display:'flex', 
                    justifyContent:'space-between', 
                    alignItems:'center',
                    backgroundColor: '#fff',
                    color: '#333'
                  }}
                  onClick={() => setDropdownEstadosOpen(!dropdownEstadosOpen)}
                >
                  <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                    {estadosSeleccionados.length > 0 
                      ? `${estadosSeleccionados.length} estados` 
                      : "Estado Prestación"}
                  </span>
                  <span style={{fontSize:'10px', opacity:0.6}}>▼</span>
                </div>

                {dropdownEstadosOpen && (
                   <div className="estado-dropdown" style={{
                     position:'absolute', top:'100%', left:0, right:0,
                     background:'white', border:'1px solid #ccc', 
                     padding:10, zIndex:100, boxShadow:'0 4px 15px rgba(0,0,0,0.1)',
                     maxHeight:'300px', overflowY:'auto', borderRadius:'0 0 4px 4px'
                   }}>
                     {availableEstados.length === 0 && <div style={{padding:5, color:'#999'}}>Sin estados disponibles</div>}
                     {availableEstados.map(est => (
                       <label key={est} style={{display:'flex', alignItems:'center', gap:8, marginBottom:6, cursor:'pointer'}}>
                         <input 
                           type="checkbox" 
                           checked={estadosSeleccionados.includes(est)}
                           onChange={(e) => {
                             if(e.target.checked) setEstadosSeleccionados(prev => [...prev, est]);
                             else setEstadosSeleccionados(prev => prev.filter(x => x !== est));
                           }}
                         /> 
                         <span style={{fontSize:'13px'}}>{est}</span>
                       </label>
                     ))}
                     {/* BOTÓN "MOSTRAR TODOS" ELIMINADO */}
                   </div>
                )}
              </div>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="simple-table">
              <thead>
                <tr>
                  <th width="40"><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} /></th>
                  <th>Evaluador</th>
                  <th>Compañía Médica</th>
                  <th>Sede</th>
                  <th style={{textAlign:'right'}}>Importe</th>
                  <th>Estado</th>
                  <th>Código</th>
                </tr>
              </thead>
              <tbody>
                {!viewGroups.length ? (
                  <tr><td colSpan={7} className="table-empty">Sin datos</td></tr>
                ) : viewGroups.map(g => (
                  <tr key={g.id}>
                    <td><input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleSelect(g.id)} /></td>
                    <td>{g.evaluador}</td>
                    <td>{g.compania}</td>
                    <td>{g.sedeNombre}</td>
                    <td style={{textAlign:'right'}}>{fmtMoney(g.importeVisible)}</td>
                    <td>
                      {g.estadoVisual === "LIQUIDADO" ? (
                        <span style={{padding:'4px 8px', borderRadius:6, fontSize:12, fontWeight:600, background:'#C8E6C9', color:'#256029'}}>
                          LIQUIDADO
                        </span>
                      ) : (
                         <span style={{padding:'4px 8px', borderRadius:6, fontSize:12, fontWeight:600, background:'#FFCDD2', color:'#B71C1C'}}>
                          NO LIQUIDADO
                        </span>
                      )}
                    </td>
                    <td style={{fontWeight:'bold', textAlign:'center'}}>{g.codigo || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="summary-footer">
            <div className="summary-totals">
              <span className="summary-label">Sel: {selectedIds.size}</span>
              <span className="summary-label">Subtotal: {fmtMoney(subtotalVisible)}</span>
              <span className="summary-label">IGV: {fmtMoney(subtotalVisible * 0.18)}</span>
              <span className="summary-label">Total: {fmtMoney(subtotalVisible * 1.18)}</span>
            </div>
            <div style={{display:'flex', gap:10}}>
              <button className="btn-primary btn-sm" onClick={handleExport} disabled={exportando || !selectedIds.size}>
                {exportando ? "Exportando..." : "Exportar Excel"}
              </button>
              <button className="btn-primary btn-sm" onClick={handleLiquidar} disabled={liquidando || !selectedIds.size}>
                {liquidando ? "Liquidando..." : "Liquidar"}
              </button>
            </div>
          </div>
        </div>

        {/* MODAL OCULTO (Lógica preservada) */}
        {detailOpen && (
          <div className="modal-overlay" onClick={closeDetalle}></div>
        )}

      </div>
    </div>
  );
}