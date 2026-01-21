import { useMemo, useState, useEffect, useRef } from "react";
import {
  fetchAuditoriasProcess,
  liquidarAuditorias,
  exportAuditorias
} from "../lib/api.js";

const STORAGE_KEY = "auditorias_state_v1";

// 1. MAPA DE SEDES PERMITIDAS
const SEDES_MAP = {
  "3": "EMO - MEGA PLAZA",
  "8": "IN HOUSE OCUPACIONAL",
  "10": "EMO - GUARDIA",
  "11": "INTEGRAMEDICA (MEGA PLAZA)"
};

// 2. TIPOS DE EXAMEN PERMITIDOS (NUEVO FILTRO)
// Convertimos a Set para búsqueda rápida. Asegúrate que en BD estén escritos así (mayúsculas).
const TIPOS_PERMITIDOS = new Set([
  "PERIODICO",
  "POST OCUPACIONAL",
  "PRE OCUPACIONAL",
  "REINCORPORACION"
]);

export default function Auditorias() {
  // === ESTADOS PRINCIPALES ===
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const [mensajeLiq, setMensajeLiq] = useState("");

  // === DATOS ===
  const [groups, setGroups] = useState([]); 
  const [detailsByGroupId, setDetailsByGroupId] = useState({}); 
  
  // Listas para los combos de filtro
  const [filters, setFilters] = useState({
    auditores: [],
    sedes: [],
    tipos: [] 
  });

  // === FILTROS VISUALES ===
  const [fAuditor, setFAuditor] = useState("TODOS");
  const [fSede, setFSede] = useState("TODOS");
  const [fTipo, setFTipo] = useState("TODOS");
  
  // === SELECCIÓN ===
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // === MODAL DETALLE ===
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroupId, setDetailGroupId] = useState(null);

  // 1. Recuperar fechas guardadas
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

  // 2. Guardar fechas al cambiar
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to }));
  }, [from, to]);

  // ========================================================================
  // PROCESAR (BUSCAR) - Con Filtro de Sedes y Tipos
  // ========================================================================
  async function handleProcess(e) {
    e?.preventDefault();
    setError("");
    setMensajeLiq("");
    if (!from || !to) return setError("Indica fechas.");

    try {
      setLoading(true);
      const resp = await fetchAuditoriasProcess({ from, to });
      
      if (resp?.ok) {
        const rawRows = resp.rows || [];
        
        const groupMap = new Map();
        const auditoresSet = new Set();
        const sedesSet = new Set();
        const tiposSet = new Set(); 

        rawRows.forEach(r => {
            // 1. FILTRO SEDE
            const sedeId = String(r.ID_ESTABLECIMIENTO || r.idEstablecimiento || "0").trim();
            if (!SEDES_MAP[sedeId]) return; // Si no es sede permitida, chau

            // 2. FILTRO TIPO DE EXAMEN (NUEVO)
            const tipoRaw = r.TIPO_DE_EXAMEN || r.tipoExamen || "SIN TIPO";
            const tipoExamen = tipoRaw.trim().toUpperCase(); // Normalizamos a mayúsculas
            
            if (!TIPOS_PERMITIDOS.has(tipoExamen)) return; // Si no es tipo permitido, chau

            // Datos válidos
            const auditor = r.AUDITADO_POR || r.auditadoPor || "SIN AUDITOR";
            const sedeNombre = SEDES_MAP[sedeId];
            const costo = Number(r.COSTO || r.costo || 0);
            const estado = r.estado || (r.estaLiquidado ? "LIQUIDADO" : "NO LIQUIDADO");

            // Key agrupada: Auditor + Sede + Tipo
            const key = `${auditor}||${sedeId}||${tipoExamen}`;

            if (!groupMap.has(key)) {
                groupMap.set(key, {
                    id: key,
                    auditor,
                    sedeId,
                    sedeNombre,
                    tipoExamen, 
                    importe: 0,
                    estado: estado, 
                    codigo: r.codigo || r.CODIGO || null,
                    rows: []
                });
            }

            const grp = groupMap.get(key);
            grp.importe += costo;
            grp.rows.push({
                ...r,
                importe: costo,
                estado: estado,
                sedeNombre,
                tipoExamen
            });

            // Prioridad visual: Si hay algo pendiente, el grupo es pendiente
            if (estado === "NO LIQUIDADO") grp.estado = "NO LIQUIDADO";

            auditoresSet.add(auditor);
            sedesSet.add(sedeNombre);
            tiposSet.add(tipoExamen);
        });

        const groupsArray = Array.from(groupMap.values());
        const detailsObj = {};
        groupsArray.forEach(g => {
            detailsObj[g.id] = g.rows;
        });

        setGroups(groupsArray);
        setDetailsByGroupId(detailsObj);
        
        setFilters({
            auditores: Array.from(auditoresSet).sort(),
            sedes: Array.from(sedesSet).sort(),
            tipos: Array.from(tiposSet).sort()
        });

        setSelectedIds(new Set());
        setSelectAll(false);
    } else {
        setGroups([]);
        setDetailsByGroupId({});
        setError(resp?.message || "No se pudo procesar.");
      }
    } catch (err) {
      console.error(err);
      setError("Error al procesar auditorías.");
    } finally {
      setLoading(false);
    }
  }

  // ========================================================================
  // FILTROS VISUALES (useMemo)
  // ========================================================================
  const viewGroups = useMemo(() => {
    return groups.filter(g => {
      if (fAuditor !== "TODOS" && g.auditor !== fAuditor) return false;
      if (fSede !== "TODOS" && g.sedeNombre !== fSede) return false;
      if (fTipo !== "TODOS" && g.tipoExamen !== fTipo) return false;
      return true;
    });
  }, [groups, fAuditor, fSede, fTipo]);

  // === TOTALES ===
  const subtotal = useMemo(() => {
    let s = 0;
    viewGroups.forEach(g => {
      if (selectedIds.has(g.id)) {
        s += g.importe;
      }
    });
    return s;
  }, [viewGroups, selectedIds]);

  // ========================================================================
  // ACCIONES
  // ========================================================================
  async function handleLiquidar() {
    if (!selectedIds.size) return alert("Selecciona items para liquidar.");
    
    const toLiquidar = viewGroups.filter(g => selectedIds.has(g.id) && g.estado !== "LIQUIDADO");
    
    if (toLiquidar.length === 0) return alert("Los items seleccionados ya están liquidados.");

    if (!confirm(`¿Liquidar ${toLiquidar.length} registros?`)) return;

    try {
      setLiquidando(true);
      
      const allRowsToSend = [];
      toLiquidar.forEach(g => {
          allRowsToSend.push(...detailsByGroupId[g.id]);
      });

      const resp = await liquidarAuditorias({ from, to, rows: allRowsToSend });
      
      if (resp?.ok) {
        setMensajeLiq(`✅ Liquidación exitosa. Código generado: ${resp.codigo}`);
            
        setGroups(prev => prev.map(g => {
            if (selectedIds.has(g.id)) {
                return { ...g, estado: "LIQUIDADO", codigo: resp.codigo };
            }
            return g;
        }));
        setSelectedIds(new Set());
        setSelectAll(false);
      } else {
        alert(resp?.message || "Error al liquidar");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al liquidar.");
    } finally {
      setLiquidando(false);
    }
  }

  async function handleExport() {
    if (!selectedIds.size) return alert("Selecciona items para exportar.");
    try {
        setExportando(true);
        const rowsToExport = [];
        viewGroups.forEach(g => {
            if (selectedIds.has(g.id)) {
                rowsToExport.push(...detailsByGroupId[g.id]);
            }
        });

        const blob = await exportAuditorias({ rows: rowsToExport, from, to });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Auditorias_${from}_${to}.xlsx`;
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

  // === SELECCIÓN ===
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const ns = new Set(prev);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  }

  function toggleSelectAll() {
    setSelectAll(!selectAll);
    if (!selectAll) {
      setSelectedIds(new Set(viewGroups.map(g => g.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  const fmtMoney = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="module-page">
      {/* 1. SECCIÓN DE BÚSQUEDA */}
      <div className="section-card section-card-wide">
        <h3 className="section-title">AUDITORÍAS MÉDICAS</h3>
        <form className="form-grid" onSubmit={handleProcess}>
          <div className="form-field">
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="mt-3" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className={`btn-primary ${loading ? "btn-loading" : ""}`} disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </form>
        {error && <div className="text-error mt-2">{error}</div>}
        {mensajeLiq && <div className="text-success mt-2">{mensajeLiq}</div>}
      </div>

      {/* 2. TABLA RESUMEN */}
      <div className="section-card">
        <h3 className="section-title">Resumen por Auditor, Sede y Tipo</h3>
        
        {/* FILTROS DE TABLA */}
        <div className="section-header-row" style={{ marginBottom: 15 }}>
           {/* Usamos display: flex para ponerlos en fila y gap para separarlos */}
           <div className="filter-row" style={{ display: 'flex', gap: '15px', width: '100%', alignItems: 'center' }}>
             
             {/* Filtro Auditor */}
             <select 
                className="form-select" 
                value={fAuditor} 
                onChange={e => setFAuditor(e.target.value)}
                style={{ flex: 1 }} // <--- ESTO ES LA CLAVE (flex: 1 hace que compartan espacio)
             >
               <option value="TODOS">Todos los Auditores</option>
               {filters.auditores.map(a => <option key={a} value={a}>{a}</option>)}
             </select>

             {/* Filtro Sede */}
             <select 
                className="form-select" 
                value={fSede} 
                onChange={e => setFSede(e.target.value)}
                style={{ flex: 1 }} // <--- Comparte espacio
             >
               <option value="TODOS">Todas las Sedes</option>
               {filters.sedes.map(s => <option key={s} value={s}>{s}</option>)}
             </select>

             {/* Filtro Tipo Examen */}
             <select 
                className="form-select" 
                value={fTipo} 
                onChange={e => setFTipo(e.target.value)}
                style={{ flex: 1 }} // <--- Comparte espacio
             >
               <option value="TODOS">Todos los Tipos de Examen</option>
               {filters.tipos.map(t => <option key={t} value={t}>{t}</option>)}
             </select>

           </div>
        </div>

        {/* TABLA */}
        <div className="table-wrapper">
          <table className="simple-table">
            <thead>
              <tr>
                <th width="40"><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} /></th>
                <th>Auditado Por</th>
                <th>Sede</th>
                <th>Tipo de Examen</th>
                <th style={{textAlign: "right"}}>Importe</th>
                <th style={{textAlign: "center"}}>Estado</th>
                <th style={{textAlign: "center"}}>Código</th>
              </tr>
            </thead>
            <tbody>
              {viewGroups.length === 0 ? (
                <tr><td colSpan={7} className="table-empty">Sin resultados.</td></tr>
              ) : (
                viewGroups.map(g => (
                  <tr key={g.id}>
                    <td><input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleSelect(g.id)} /></td>
                    <td>{g.auditor}</td>
                    <td>{g.sedeNombre}</td>
                    <td>{g.tipoExamen}</td>
                    <td style={{textAlign: "right"}}>{fmtMoney(g.importe)}</td>
                    <td style={{textAlign: "center"}}>
                      {g.estado === "LIQUIDADO" 
                        ? <span style={{background:"#C8E6C9", color:"#256029", padding:"4px 8px", borderRadius:6, fontSize:12, fontWeight:600}}>LIQUIDADO</span>
                        : <span style={{background:"#FFCDD2", color:"#B71C1C", padding:"4px 8px", borderRadius:6, fontSize:12, fontWeight:600}}>NO LIQUIDADO</span>
                      }
                    </td>
                    <td style={{textAlign: "center", fontWeight:"bold"}}>{g.codigo || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER TOTALES */}
        <div className="summary-footer">
          <div className="summary-totals">
             <span className="summary-label">Seleccionados: {selectedIds.size}</span>
             <span className="summary-label">Subtotal: {fmtMoney(subtotal)}</span>
             <span className="summary-label">IGV: {fmtMoney(subtotal * 0.18)}</span>
             <span className="summary-label">Total: {fmtMoney(subtotal * 1.18)}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary btn-sm" disabled={!selectedIds.size || exportando} onClick={handleExport}>
               {exportando ? "Exportando..." : "Exportar"}
            </button>
            <button className="btn-primary btn-sm" disabled={!selectedIds.size || liquidando} onClick={handleLiquidar}>
               {liquidando ? "Liquidando..." : "Liquidar"}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DETALLE */}
      {detailOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={() => setDetailOpen(false)}>
           <div className="section-card" style={{ width: "min(800px, 95vw)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              <div className="section-header-row">
                 <h3 className="section-title">Detalle Auditoría</h3>
                 <button className="btn-primary btn-sm" onClick={() => setDetailOpen(false)}>Cerrar</button>
              </div>
              <div className="table-wrapper">
                 <table className="simple-table">
                    <thead>
                       <tr>
                         <th>Fecha Examen</th>
                         <th>Paciente</th>
                         <th>Empresa</th>
                         <th>Tipo Examen</th>
                         <th style={{textAlign:'right'}}>Costo</th>
                       </tr>
                    </thead>
                    <tbody>
                       {(detailsByGroupId[detailGroupId] || []).map((r, i) => (
                          <tr key={i}>
                             <td>{r.FECHA_DE_EXAMEN ? new Date(r.FECHA_DE_EXAMEN).toLocaleDateString() : "-"}</td>
                             <td>{r.NOMBRE_COMPLETO}</td>
                             <td>{r.EMPRESA_EVALUADA}</td>
                             <td>{r.TIPO_DE_EXAMEN}</td>
                             <td style={{textAlign:'right'}}>{fmtMoney(r.COSTO || r.costo)}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}