import { useState, useEffect } from "react";
// Asegúrate de agregar estas funciones nuevas a tu api.js
import { fetchMasterPrestaciones, searchEvaluadores, createTarifa, deleteTarifa } from "../lib/api.js";
function ConfigCostosAuditoria() {
  const [costos, setCostos] = useState([]);
  const [loading, setLoading] = useState(false);

  // Cargar datos al montar la pestaña
  useEffect(() => {
    fetch("/api/config/costos-auditoria")
      .then((r) => r.json())
      .then((data) => setCostos(data))
      .catch((err) => console.error("Error cargando costos:", err));
  }, []);

  // Manejar cambios en los inputs
  const handleChange = (tipo, valor) => {
    setCostos((prev) =>
      prev.map((c) => (c.TipoExamen === tipo ? { ...c, Costo: valor } : c))
    );
  };

  // Guardar en BD
  const handleGuardar = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/config/costos-auditoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: costos }),
      });
      if (res.ok) alert("✅ Costos actualizados correctamente");
      else alert("Error al guardar");
    } catch (e) {
      console.error(e);
      alert("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    // CAMBIO AQUÍ: Cambiamos maxWidth: "600px" por "100%"
    <div className="section-card" style={{ maxWidth: "100%" }}>
      <h3 className="section-title">Precios Base por Tipo de Examen</h3>
      <p style={{ marginBottom: "15px", fontSize: "13px", color: "#666" }}>
        Estos costos se aplicarán automáticamente al buscar en el módulo de Auditorías.
      </p>

      <div className="table-wrapper">
        <table className="simple-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Tipo de Examen</th>
              <th style={{ textAlign: "right", width: "200px" }}>Costo (S/)</th>
            </tr>
          </thead>
          <tbody>
            {costos.length === 0 ? (
              <tr><td colSpan={2} className="text-center">Cargando...</td></tr>
            ) : (
              costos.map((item) => (
                <tr key={item.TipoExamen}>
                  <td style={{ fontWeight: "500" }}>{item.TipoExamen}</td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      style={{ textAlign: "right", width: "100%" }}
                      value={item.Costo}
                      onChange={(e) => handleChange(item.TipoExamen, e.target.value)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "20px", textAlign: "right" }}>
        <button 
          className="btn-primary" 
          onClick={handleGuardar} 
          disabled={loading}
        >
          {loading ? "Guardando..." : "Guardar Cambios"}
        </button>
      </div>
    </div>
  );
}
export default function Mantenimiento() {
  const [data, setData] = useState([]); // Lista gigante
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // --- MODAL STATES ---
  const [modalOpen, setModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(null); // La prestación que estamos editando
  
  // Formulario dentro del modal
  const [targetType, setTargetType] = useState("EVALUADOR"); // EVALUADOR | COMPANIA | TODOS
  const [tipoPago, setTipoPago] = useState("MONTO"); // MONTO | PORCENTAJE
  const [valor, setValor] = useState("");
  
  // Autocomplete Estado
  const [evaluadorSearch, setEvaluadorSearch] = useState("");
  const [evaluadorSugerencias, setEvaluadorSugerencias] = useState([]);
  const [evaluadorSelected, setEvaluadorSelected] = useState(null); // {Id, Nombre}
  const [activeTab, setActiveTab] = useState("AUDITORIA");
  useEffect(() => {
    loadMasterData();
  }, []);

  async function loadMasterData() {
    setLoading(true);
    try {
      const res = await fetchMasterPrestaciones(); // <--- Nueva función API
      if (res.ok) setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // --- LOGICA AUTOCOMPLETE ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (evaluadorSearch.length > 2 && !evaluadorSelected) {
        const results = await searchEvaluadores(evaluadorSearch);
        setEvaluadorSugerencias(results);
      } else {
        setEvaluadorSugerencias([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [evaluadorSearch, evaluadorSelected]);

  function selectSugerencia(sug) {
    setEvaluadorSelected(sug);
    setEvaluadorSearch(sug.Nombre);
    setEvaluadorSugerencias([]);
  }

  function clearEvaluadorSelection() {
    setEvaluadorSelected(null);
    setEvaluadorSearch("");
  }

  // --- MODAL HANDLERS ---
  function openEditModal(item) {
    setCurrentItem(item);
    // Reset form
    setTargetType("EVALUADOR");
    setTipoPago("MONTO");
    setValor("");
    clearEvaluadorSelection();
    setModalOpen(true);
  }
  function recalculateItemDisplay(item) {
    const configs = item.configs || [];
    if (configs.length === 0) {
      return { ...item, asignadoA: "Sin asignar", tipoPago: "-", valor: 0 };
    }
    if (configs.length === 1) {
      return { 
        ...item, 
        asignadoA: configs[0].quien, 
        tipoPago: configs[0].tipoPago, 
        valor: configs[0].valor 
      };
    }
    // Si hay más de 1 regla
    return { ...item, asignadoA: "Múltiples Reglas", tipoPago: "Varios", valor: 0 };
  }
  // --- NUEVO GUARDAR (INSTANTÁNEO) ---
  async function handleSaveConfig() {
    if (!valor) return alert("Ingrese un valor");
    if (targetType === "EVALUADOR" && !evaluadorSelected) return alert("Seleccione un evaluador de la lista");

    const quienNombre = targetType === "EVALUADOR" ? evaluadorSelected.Nombre : "Tarifa Base";

    const payload = {
      descripcion: currentItem.descripcion,
      evaluadorNombre: targetType === "EVALUADOR" ? evaluadorSelected.Nombre : null,
      companiaNombre: null, 
      tipoPago,
      valor: Number(valor)
    };

    // 1. Guardar en BD (Rápido)
    const res = await createTarifa(payload);
    
    if (res.ok) {
      const newId = res.id; // El ID que nos devolvió el backend modificado

      // 2. ACTUALIZAR ESTADO LOCALMENTE (¡Sin recargar!)
      setData(prevData => {
        return prevData.map(item => {
          if (item.descripcion === currentItem.descripcion) {
            // Creamos la nueva regla en memoria
            const newConfig = {
              id: newId,
              quien: quienNombre,
              tipoPago,
              valor: Number(valor)
            };
            
            // Agregamos a sus configs
            const updatedConfigs = [...item.configs, newConfig];
            const updatedItem = { ...item, configs: updatedConfigs };
            
            // Actualizamos lo que se ve en la tabla principal y en el modal actual
            const finalItem = recalculateItemDisplay(updatedItem);
            setCurrentItem(finalItem); // Actualiza el modal abierto
            return finalItem;          // Actualiza la tabla de fondo
          }
          return item;
        });
      });

      // Limpiar formulario para seguir agregando si se desea
      setValor("");
      // setModalOpen(false); // Opcional: Si quieres que se cierre al guardar, descomenta esto.
      
    } else {
      alert("Error al guardar");
    }
  }

  // --- NUEVO BORRAR (INSTANTÁNEO) ---
  async function handleDeleteConfig(id) {
    if(!confirm("¿Borrar esta regla?")) return;

    // 1. Borrar en BD
    await deleteTarifa(id);

    // 2. ACTUALIZAR ESTADO LOCALMENTE
    setData(prevData => {
      return prevData.map(item => {
        if (item.descripcion === currentItem.descripcion) {
          // Filtramos la regla borrada
          const updatedConfigs = item.configs.filter(c => c.id !== id);
          const updatedItem = { ...item, configs: updatedConfigs };
          
          // Recalculamos visuales
          const finalItem = recalculateItemDisplay(updatedItem);
          setCurrentItem(finalItem); // Actualiza el modal abierto
          return finalItem;          // Actualiza la tabla de fondo
        }
        return item;
      });
    });
  }
  // --- FILTRADO TABLA PRINCIPAL ---
  const filteredData = data.filter(d => 
    d.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="module-page">
      
      {/* 1. BARRA DE PESTAÑAS (NUEVO) */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          <button
            onClick={() => setActiveTab("AUDITORIA")}
            style={{
              padding: '10px 20px',
              borderBottom: activeTab === "AUDITORIA" ? '3px solid #2563EB' : '3px solid transparent',
              color: activeTab === "AUDITORIA" ? '#2563EB' : '#6B7280',
              fontWeight: '600',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '15px'
            }}
          >
            ⚙️ Costos Auditoría
          </button>
          <button
            onClick={() => setActiveTab("GENERAL")}
            style={{
              padding: '10px 20px',
              borderBottom: activeTab === "GENERAL" ? '3px solid #2563EB' : '3px solid transparent',
              color: activeTab === "GENERAL" ? '#2563EB' : '#6B7280',
              fontWeight: '600',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '15px'
            }}
          >
            📋 Maestro de Prestaciones
          </button>
        </div>
      </div>

      {/* 2. CONTENIDO: COSTOS AUDITORÍA */}
      {activeTab === "AUDITORIA" && (
        <div style={{ marginTop: '20px' }}>
           <ConfigCostosAuditoria />
        </div>
      )}

      {/* 3. CONTENIDO: MAESTRO DE PRESTACIONES (TU CÓDIGO ORIGINAL) */}
      {activeTab === "GENERAL" && (
        <>
          <div className="section-card section-card-wide">
            <h3 className="section-title">Maestro de Prestaciones</h3>
            <p className="section-subtitle">Configura los pagos para cada procedimiento.</p>

            {/* BUSCADOR */}
            <div style={{ marginBottom: '25px', marginTop: '10px' }}>
              <div style={{ position: 'relative', maxWidth: '350px' }}>
                <input 
                  className="form-input" 
                  placeholder="Buscar prestación..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ 
                    paddingLeft: '15px', 
                    width: '100%',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                  }}
                />
              </div>
            </div>

            {/* TABLA RESUMEN */}
            <div className="table-wrapper" style={{ maxHeight: '60vh', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Descripción de Prestación</th>
                    <th>Pagar A</th>
                    <th>Tipo Pago</th>
                    <th>Valor</th>
                    <th width="80">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center p-4">Cargando maestro...</td></tr>
                  ) : filteredData.slice(0, 100).map((item, idx) => ( 
                    <tr key={idx}>
                      <td>{item.descripcion}</td>
                      <td>{item.asignadoA}</td>
                      <td>{item.tipoPago === 'PORCENTAJE' ? '%' : item.tipoPago === 'MONTO' ? 'S/.' : '-'}</td>
                      <td>{item.valor > 0 ? item.valor : '-'}</td>
                      <td>
                        <button className="btn-primary btn-sm" onClick={() => openEditModal(item)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <small className="text-gray-400">Mostrando primeros 100 de {filteredData.length}</small>
            </div>
          </div>

          {/* --- MODAL FLOTANTE (TU CÓDIGO ORIGINAL) --- */}
          {modalOpen && currentItem && (
            <div className="modal-overlay" onClick={() => setModalOpen(false)}>
              <div 
                className="modal-content" 
                onClick={e => e.stopPropagation()} 
                style={{ maxWidth: '700px', padding: '30px', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}
              >
                {/* 1. ENCABEZADO */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '25px', borderBottom: '1px solid #f0f0f0', paddingBottom: '15px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '20px', color: '#111827', fontWeight: '700' }}>Editar Prestación</h3>
                    <p style={{ margin: '5px 0 0', color: '#6B7280', fontSize: '14px' }}>
                      {currentItem.descripcion}
                    </p>
                  </div>
                  <button 
                    onClick={() => setModalOpen(false)} 
                    style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}
                  >
                    &times;
                  </button>
                </div>
                
                {/* 2. REGLAS EXISTENTES (TABLA) */}
                <div style={{ marginBottom: '30px' }}>
                  <h5 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em', marginBottom: '10px', fontWeight: '600' }}>
                    Reglas Configuradas
                  </h5>
                  
                  {currentItem.configs.length > 0 ? (
                    <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead style={{ background: '#F9FAFB', color: '#374151' }}>
                          <tr>
                            <th style={{ padding: '10px 15px', textAlign: 'left', fontWeight: '600' }}>Asociado a</th>
                            <th style={{ padding: '10px 15px', textAlign: 'left', fontWeight: '600' }}>Tipo</th>
                            <th style={{ padding: '10px 15px', textAlign: 'left', fontWeight: '600' }}>Valor</th>
                            <th style={{ padding: '10px 15px', textAlign: 'right' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentItem.configs.map((c, idx) => (
                             <tr key={c.id} style={{ borderTop: idx > 0 ? '1px solid #E5E7EB' : 'none' }}>
                               <td style={{ padding: '10px 15px', color: '#111827' }}>{c.quien}</td>
                               <td style={{ padding: '10px 15px', color: '#4B5563' }}>{c.tipoPago}</td>
                               <td style={{ padding: '10px 15px', fontWeight: '600', color: c.tipoPago === 'PORCENTAJE' ? '#2563EB' : '#059669' }}>
                                 {c.tipoPago === 'PORCENTAJE' ? `${c.valor}%` : `S/. ${Number(c.valor).toFixed(2)}`}
                               </td>
                               <td style={{ padding: '10px 15px', textAlign: 'right' }}>
                                 <button 
                                   onClick={() => handleDeleteConfig(c.id)}
                                   style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
                                 >
                                   Eliminar
                                 </button>
                               </td>
                             </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: '15px', background: '#FFFBEB', color: '#B45309', borderRadius: '6px', fontSize: '14px', border: '1px solid #FCD34D' }}>
                      ⚠️ No hay reglas específicas. El valor actual es <b>0</b>.
                    </div>
                  )}
                </div>
                
                {/* 3. FORMULARIO NUEVA REGLA */}
                <div style={{ background: '#F9FAFB', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                  <h5 style={{ marginTop: 0, marginBottom: '15px', fontSize: '15px', fontWeight: '700', color: '#1F2937' }}>
                    + Agregar Nueva Regla
                  </h5>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
                     
                     {/* COLUMNA IZQUIERDA: ASIGNACIÓN */}
                     <div>
                       <label className="form-label" style={{ marginBottom: '8px' }}>Asociar esta tarifa a:</label>
                       <select 
                          className="form-select" 
                          value={targetType} 
                          onChange={e => setTargetType(e.target.value)}
                          style={{ marginBottom: '15px', width: '100%' }}
                       >
                         <option value="EVALUADOR">Un Evaluador Específico</option>
                         <option value="TODOS">Tarifa Base (Para todos)</option>
                       </select>

                       {targetType === "EVALUADOR" && (
                         <div style={{ position: 'relative' }}>
                           <label className="form-label" style={{ marginBottom: '8px' }}>Buscar Evaluador:</label>
                           <input 
                             className="form-input"
                             placeholder="Escribe mín. 3 letras..."
                             value={evaluadorSearch}
                             onChange={e => {
                               setEvaluadorSearch(e.target.value);
                               setEvaluadorSelected(null);
                             }}
                             style={{ 
                               width: '100%', 
                               borderColor: evaluadorSelected ? '#10B981' : '#D1D5DB',
                               backgroundColor: evaluadorSelected ? '#ECFDF5' : '#FFF'
                             }}
                           />
                           
                           {/* LISTA FLOTANTE SUGERENCIAS */}
                           {evaluadorSugerencias.length > 0 && (
                             <div style={{
                               position: 'absolute',
                               top: '100%', left: 0, right: 0,
                               backgroundColor: 'white',
                               border: '1px solid #E5E7EB',
                               borderRadius: '0 0 8px 8px',
                               boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                               zIndex: 9999,
                               maxHeight: '180px',
                               overflowY: 'auto',
                               marginTop: '2px'
                             }}>
                               {evaluadorSugerencias.map((sug, i) => (
                                 <div 
                                   key={sug.Id || i}
                                   onClick={() => selectSugerencia(sug)}
                                   style={{ 
                                     padding: '10px 12px', 
                                     cursor: 'pointer', 
                                     borderBottom: '1px solid #F3F4F6', 
                                     fontSize: '14px',
                                     color: '#374151',
                                     transition: 'background 0.2s'
                                   }}
                                   onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
                                   onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                 >
                                   {sug.Nombre}
                                 </div>
                               ))}
                             </div>
                           )}
                           {!evaluadorSelected && evaluadorSearch.length > 2 && evaluadorSugerencias.length === 0 && (
                              <div style={{position:'absolute', top:'100%', left:0, fontSize:'12px', color:'#EF4444', marginTop:'4px'}}>
                                Sin resultados...
                              </div>
                           )}
                         </div>
                       )}
                     </div>

                     {/* COLUMNA DERECHA: VALOR */}
                     <div>
                        <label className="form-label" style={{ marginBottom: '8px' }}>Tipo de Pago:</label>
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                            <input type="radio" checked={tipoPago === "MONTO"} onChange={() => setTipoPago("MONTO")} style={{ accentColor: '#2563EB' }} />
                            Monto (S/.)
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                            <input type="radio" checked={tipoPago === "PORCENTAJE"} onChange={() => setTipoPago("PORCENTAJE")} style={{ accentColor: '#2563EB' }} />
                            Porcentaje (%)
                          </label>
                        </div>
                        
                        <label className="form-label" style={{ marginBottom: '8px' }}>
                            {tipoPago === "MONTO" ? "Importe en Soles:" : "Porcentaje a pagar:"}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '12px', color: '#6B7280', fontWeight: 'bold' }}>
                              {tipoPago === "MONTO" ? "S/." : "%"}
                          </span>
                          <input 
                              type="number" 
                              className="form-input" 
                              style={{ paddingLeft: '40px', fontWeight: 'bold', fontSize: '16px', color: '#111827' }}
                              value={valor} 
                              onChange={e => setValor(e.target.value)}
                              placeholder="0.00"
                          />
                        </div>
                     </div>
                  </div>
                </div>

                {/* 4. FOOTER BOTONES */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setModalOpen(false)}
                    style={{ padding: '10px 20px' }}
                  >
                    Cancelar
                  </button>
                  <button 
                    className="btn-primary" 
                    onClick={handleSaveConfig}
                    style={{ padding: '10px 24px', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }}
                  >
                    Guardar Regla
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
