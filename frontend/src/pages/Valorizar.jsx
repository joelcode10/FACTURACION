import { useState } from "react";

export default function Valorizar() {
  // --- ESTADOS ---
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [condicionPago, setCondicionPago] = useState("TODOS");
  
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // Modals
  const [modalFacturarOpen, setModalFacturarOpen] = useState(false);
  const [facturaManual, setFacturaManual] = useState("");
  
  const [modalAnularOpen, setModalAnularOpen] = useState(false);
  const [notaCredito, setNotaCredito] = useState("");

  // --- BUSCAR ---
  async function handleSearch(e) {
    e?.preventDefault();
    if (!from || !to) return alert("Seleccione fechas");
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, condicion: condicionPago });
      const res = await fetch(`/api/valorizacion/process?${params}`);
      const data = await res.json();
      if (data.ok) {
        setRows(data.rows);
        setSelectedIds(new Set()); // Reset selección
      }
    } catch (error) {
      console.error(error);
      alert("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }

  // --- SELECCION ---
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map(r => r.IdLiquidacion)));
  };

  // --- LOGICA BOTONES FOOTER ---
  
  // 1. VALORIZAR (Solo si seleccionó items NO FACTURADOS)
  function clickValorizar() {
    if (selectedIds.size === 0) return alert("Seleccione registros para valorizar.");
    
    // Validar que NO estén facturados ya
    const seleccionados = rows.filter(r => selectedIds.has(r.IdLiquidacion));
    const yaFacturados = seleccionados.some(r => r.EstadoProceso === 'FACTURADO');
    
    if (yaFacturados) return alert("Algunos registros seleccionados YA están facturados. Desmárquelos.");
    
    setFacturaManual("");
    setModalFacturarOpen(true);
  }

  // 2. ANULAR (Solo si seleccionó items FACTURADOS)
  function clickAnular() {
    if (selectedIds.size === 0) return alert("Seleccione registros para anular.");

    // Validar que ESTÉN facturados
    const seleccionados = rows.filter(r => selectedIds.has(r.IdLiquidacion));
    const noFacturados = seleccionados.some(r => r.EstadoProceso !== 'FACTURADO');
    
    if (noFacturados) return alert("Solo se puede anular registros que ya estén FACTURADOS.");
    
    // Validar que todos pertenezcan a la misma valorización (opcional, pero recomendado para mantener orden)
    const uniqueValIds = new Set(seleccionados.map(r => r.IdValorizacion));
    if (uniqueValIds.size > 1) return alert("Por seguridad, anule una Valorización (Factura) a la vez.");

    setNotaCredito("");
    setModalAnularOpen(true);
  }

  // --- CONFIRMAR ACCIONES ---
  async function handleFacturarConfirm() {
    if (!facturaManual) return alert("Ingrese el N° de Comprobante");
    
    try {
      const res = await fetch("/api/valorizacion/facturar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          nroFacturaManual: facturaManual
        })
      });
      const data = await res.json();
      if (data.ok) {
        alert(`✅ Valorización creada: ${data.codigo}`);
        setModalFacturarOpen(false);
        handleSearch(); // Recargar
      } else {
        alert(data.message);
      }
    } catch (e) { console.error(e); alert("Error"); }
  }

  async function handleAnularConfirm() {
    if (!notaCredito) return alert("⚠️ Ingrese la Nota de Crédito obligatoria");
    
    // Obtenemos el ID de la valorización del primer seleccionado (ya validamos que son iguales)
    const seleccionados = rows.filter(r => selectedIds.has(r.IdLiquidacion));
    const idVal = seleccionados[0].IdValorizacion;

    try {
      const res = await fetch("/api/valorizacion/anular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idValorizacion: idVal,
          notaCredito: notaCredito
        })
      });
      const data = await res.json();
      if (data.ok) {
        alert("✅ Facturación Anulada.");
        setModalAnularOpen(false);
        handleSearch();
      } else {
        alert(data.message);
      }
    } catch (e) { console.error(e); alert("Error"); }
  }

  const fmtMoney = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 });

  return (
    <div className="module-page">
      <div className="section-card section-card-wide">
        <h3 className="section-title">MÓDULO DE VALORIZACIÓN</h3>
        
        {/* FILTROS */}
        <form className="form-grid" onSubmit={handleSearch}>
            <div className="form-field">
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="form-field">
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div className="form-field">
                <label className="form-label">Condición Pago</label>
                <select className="form-select" value={condicionPago} onChange={e => setCondicionPago(e.target.value)}>
                    <option value="TODOS">Todos</option>
                    <option value="CONTADO">Contado</option>
                    <option value="CREDITO">Crédito</option>
                </select>
            </div>
            <div style={{ marginTop: 'auto' }}>
                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? "Buscando..." : "Filtrar"}
                </button>
            </div>
        </form>
      </div>

      <div className="section-card">
        <h3 className="section-title">Liquidaciones Disponibles</h3>

        <div className="table-wrapper">
            <table className="simple-table">
                <thead>
                    <tr>
                        <th width="40"><input type="checkbox" onChange={toggleSelectAll} /></th>
                        <th>Cliente</th>
                        <th>Unidad Negocio</th>
                        <th>Tipo Evaluación</th>
                        <th style={{textAlign:'right'}}>Importe</th>
                        <th style={{textAlign:'center'}}>Estado Liq.</th>
                        <th style={{textAlign:'center'}}>Estado Fac.</th>
                        <th>Comprobante</th>
                        <th>Cod. Interno</th>
                        {/* Se eliminó la columna ACCIÓN */}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr><td colSpan={9} className="table-empty">Sin datos</td></tr>
                    ) : (
                        rows.map(r => (
                        <tr key={r.IdLiquidacion} style={{ backgroundColor: r.EstadoProceso === 'FACTURADO' ? '#F0FDF4' : 'white' }}>
                            <td>
                                <input 
                                    type="checkbox" 
                                    checked={selectedIds.has(r.IdLiquidacion)}
                                    onChange={() => toggleSelect(r.IdLiquidacion)}
                                />
                            </td>
                            <td>{r.ClienteNombre}</td>
                            <td>{r.UnidadNegocio}</td>
                            <td>{r.TipoEvaluacion || "-"}</td>
                            <td style={{textAlign:'right'}}>{fmtMoney(r.Importe)}</td>
                            
                            {/* Estado Liquidación (Siempre será LIQUIDADO porque filtramos así) */}
                            <td style={{textAlign:'center'}}>
                                <span style={{background:"#C8E6C9", color:"#256029", padding:"4px 8px", borderRadius:6, fontSize:12, fontWeight:600}}>
                                    LIQUIDADO
                                </span>
                            </td>
                            
                            {/* Estado Facturación */}
                            <td style={{textAlign:'center'}}>
                                {r.EstadoProceso === 'FACTURADO' 
                                    ? <span style={{color:'green', fontWeight:'bold', fontSize:'12px'}}>FACTURADO</span>
                                    : <span style={{color:'#666', fontSize:'12px'}}>NO FACTURADO</span>
                                }
                            </td>
                            
                            <td>{r.NroComprobante || "-"}</td>
                            <td>{r.CodigoFacturacion || "-"}</td>
                        </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>

        {/* FOOTER BOTONES */}
        <div className="summary-footer" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
             <button className="btn-primary" onClick={() => alert("Función Exportar pendiente...")}>
                Exportar
             </button>
             
             {/* Botón ANULAR (Rojo) */}
             <button 
                className="btn-primary" 
                style={{ backgroundColor: '#EF4444' }}
                disabled={selectedIds.size === 0}
                onClick={clickAnular}
             >
                Anular
             </button>

             {/* Botón VALORIZAR (Verde) */}
             <button 
                className="btn-primary" 
                style={{ backgroundColor: '#10B981' }}
                disabled={selectedIds.size === 0}
                onClick={clickValorizar}
             >
                Valorizar ({selectedIds.size})
             </button>
        </div>
      </div>

      {/* ======================================================= */}
      {/* MODAL FACTURAR (VALORIZACIÓN) - MÁS ANCHO Y ESPACIOSO   */}
      {/* ======================================================= */}
      {modalFacturarOpen && (
          <div className="modal-overlay" onClick={() => setModalFacturarOpen(false)}>
              <div 
                className="modal-content" 
                onClick={e => e.stopPropagation()} 
                // CAMBIO: Aumentamos de 400px a 550px y agregamos padding extra
                style={{ maxWidth: '550px', padding: '30px' }}
              >
                  <h3 style={{ fontSize: '20px', marginBottom: '10px' }}>Nueva Valorización</h3>
                  
                  <p style={{ color: '#555', marginBottom: '20px', fontSize: '15px' }}>
                    Estás a punto de asociar <b>{selectedIds.size}</b> liquidaciones al siguiente comprobante:
                  </p>
                  
                  <label className="form-label" style={{ fontWeight: '600' }}>
                    N° Factura / Comprobante
                  </label>
                  
                  <input 
                    className="form-input" 
                    autoFocus
                    placeholder="Ej: F001-456"
                    value={facturaManual} 
                    onChange={e => setFacturaManual(e.target.value)} 
                    // CAMBIO: Hacemos el texto más grande para que se lea mejor
                    style={{ fontSize: '18px', padding: '12px', marginTop: '8px' }}
                  />

                  <div style={{ display:'flex', gap:'15px', marginTop:'30px', justifyContent:'flex-end' }}>
                      <button 
                        className="btn-secondary" 
                        onClick={() => setModalFacturarOpen(false)}
                        style={{ padding: '10px 20px' }}
                      >
                        Cancelar
                      </button>
                      <button 
                        className="btn-primary" 
                        onClick={handleFacturarConfirm}
                        style={{ padding: '10px 25px', fontSize: '15px' }}
                      >
                        Guardar Valorización
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ======================================================= */}
      {/* MODAL ANULAR - TAMBIÉN ACTUALIZADO                      */}
      {/* ======================================================= */}
      {modalAnularOpen && (
          <div className="modal-overlay" onClick={() => setModalAnularOpen(false)}>
              <div 
                className="modal-content" 
                onClick={e => e.stopPropagation()} 
                style={{ maxWidth: '550px', padding: '30px' }}
              >
                  <h3 style={{ color: '#EF4444', fontSize: '20px', marginBottom: '10px' }}>
                    Anular Facturación
                  </h3>
                  
                  <p style={{ color: '#555', marginBottom: '20px', fontSize: '15px' }}>
                    Para proceder con la anulación, es <b>obligatorio</b> ingresar el número de la Nota de Crédito.
                  </p>
                  
                  <label className="form-label" style={{ fontWeight: '600' }}>
                    N° Nota de Crédito
                  </label>
                  
                  <input 
                    className="form-input" 
                    autoFocus
                    placeholder="Ej: NC001-00025"
                    value={notaCredito} 
                    onChange={e => setNotaCredito(e.target.value)} 
                    style={{ fontSize: '18px', padding: '12px', marginTop: '8px', borderColor: '#EF4444' }}
                  />

                  <div style={{ display:'flex', gap:'15px', marginTop:'30px', justifyContent:'flex-end' }}>
                      <button 
                        className="btn-secondary" 
                        onClick={() => setModalAnularOpen(false)}
                        style={{ padding: '10px 20px' }}
                      >
                        Cancelar
                      </button>
                      <button 
                        className="btn-primary" 
                        style={{ backgroundColor: '#EF4444', padding: '10px 25px', fontSize: '15px' }} 
                        onClick={handleAnularConfirm}
                      >
                        CONFIRMAR ANULACIÓN
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}