// frontend/src/pages/LiquidacionesClientes.jsx
import React, { useEffect, useState, useMemo } from "react";
import {
  fetchLiquidaciones,
  fetchLiquidacionDetalle,
  anularLiquidacion, // Asegúrate de tener esta función en api.js
} from "../lib/api.js";
// Clave única para guardar los filtros del histórico
const STORAGE_KEY_HISTORICO = "historico_filtros_v1";

// Función auxiliar para leer del almacenamiento de forma segura
function getSavedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_HISTORICO);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}
export default function LiquidacionesClientes() {
  // Filtros de búsqueda
  // 1. Leemos lo guardado una sola vez al inicio
  const saved = getSavedState();
  const [from, setFrom] = useState(saved?.from || "");
  const [to, setTo] = useState(saved?.to || "");
  const [condicionPago, setCondicionPago] = useState(saved?.condicionPago || "TODAS");
  const [searchCodigo, setSearchCodigo] = useState(saved?.searchCodigo || "");

  // Datos
  const [items, setItems] = useState([]); // lista de cabeceras crudas desde backend
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal detalle
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailHeader, setDetailHeader] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  // Nuevo filtro: Tipo de Histórico
  const [historyType, setHistoryType] = useState(saved?.historyType || "CLIENTES"); // Si usas el filtro de tipo

  // Para anular con confirmación simple
  const [anulandoId, setAnulandoId] = useState(null);

  const fmtMoney = (n) =>
    Number(n || 0).toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fmtDate = (d) => {
    if (!d) return "-";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toISOString().slice(0, 10);
  };

  const getEstadoLabel = (estadoRaw) => {
    const estado = (estadoRaw || "").toUpperCase();
    return estado === "ANULADA" ? "Anulada" : "Vigente";
  };

  const getEstadoStyle = (estadoRaw) => {
    const estado = (estadoRaw || "").toUpperCase();
    const isAnulada = estado === "ANULADA";
    return {
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      backgroundColor: isAnulada ? "#ffebee" : "#e8f5e9",
      color: isAnulada ? "#c62828" : "#2e7d32",
      border: `1px solid ${isAnulada ? "#ffcdd2" : "#c8e6c9"}`,
    };
  };
  // --- FUNCIÓN EXPORTAR (Nueva) ---
  const handleExportar = (liq) => {
    // Aquí rediriges a tu ruta de backend que genera el Excel
    // Ajusta la URL según tus rutas reales
    const url = `/api/liquidaciones/exportar-excel/${liq.IdLiquidacion}`;
    window.open(url, "_blank");
  };
  async function handleBuscar(e) {
    e?.preventDefault?.();
    setError("");
    setLoading(true);
    try {
      // Usamos fetch directamente o crea una función 'fetchHistory' en api.js
      const params = new URLSearchParams({ from, to, type: historyType });
      const res = await fetch(`/api/clientes/history?${params}`); // Ajusta la ruta base si es necesario
      const data = await res.json();
      
      if (!data.ok) {
        setItems([]);
        setError(data.message || "Error al cargar.");
      } else {
        setItems(data.rows || []);
      }
    } catch (err) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  // Cargar últimas liquidaciones al entrar
  // --- GUARDADO AUTOMÁTICO EN LOCALSTORAGE ---
  useEffect(() => {
    const filtersToSave = {
      from,
      to,
      condicionPago,
      historyType,
      searchCodigo
    };
    localStorage.setItem(STORAGE_KEY_HISTORICO, JSON.stringify(filtersToSave));
  }, [from, to, condicionPago, historyType, searchCodigo]);

  // Filtro local por código
  const filteredItems = useMemo(() => {
    const term = searchCodigo.trim().toUpperCase();
    if (!term) return items;
    return items.filter((liq) =>
      (liq.Codigo || "").toUpperCase().includes(term)
    );
  }, [items, searchCodigo]);

  const totalRegistros = useMemo(
    () => filteredItems.length,
    [filteredItems]
  );

  // Abrir detalle de una liquidación
  async function openDetalle(liq) {
    if (!liq?.IdLiquidacion) return;
    setDetailOpen(true);
    setDetailHeader(null);
    setDetailRows([]);
    setDetailError("");
    setDetailLoading(true);
    try {
      const resp = await fetchLiquidacionDetalle(liq.IdLiquidacion);
      if (!resp?.ok) {
        setDetailError(resp?.message || "No se pudo cargar el detalle.");
      } else {
        setDetailHeader(resp.header || null);
        setDetailRows(resp.rows || []);
      }
    } catch (err) {
      console.error(err);
      setDetailError(err.message || "Error al cargar el detalle.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetalle() {
    setDetailOpen(false);
    setDetailHeader(null);
    setDetailRows([]);
    setDetailError("");
  }

  // Anular liquidación completa
  async function handleAnular(liq) {
    if (!liq?.IdLiquidacion) return;
    const estado = (liq.Estado || "").toUpperCase();
    if (estado === "ANULADA") return;

    const confirmMsg = `¿Seguro que deseas ANULAR la liquidación ${liq.Codigo || ""}?\nEsta acción marcará la liquidación como ANULADA, pero no la eliminará del histórico.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setAnulandoId(liq.IdLiquidacion);
      const resp = await anularLiquidacion(liq.IdLiquidacion);
      if (!resp?.ok) {
        alert(resp?.message || "No se pudo anular la liquidación.");
      } else {
        // Refrescamos el listado
        await handleBuscar();
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al anular la liquidación.");
    } finally {
      setAnulandoId(null);
    }
  }

  return (
    <div className="module-page">
      {/* Filtros principales */}
      <div className="section-card section-card-wide">
        <h3 className="section-title">Histórico de liquidaciones - Clientes</h3>
        <p className="section-subtitle">
          Consulta las liquidaciones generadas, con su rango de fechas, condición de pago, código y estado.
        </p>

        <form className="form-grid" onSubmit={handleBuscar}>
          <div className="form-field">
            <label className="form-label">Desde</label>
            <input
              className="form-input"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Hasta</label>
            <input
              className="form-input"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Condición de pago</label>
            <select
              className="form-select"
              value={condicionPago}
              onChange={(e) => setCondicionPago(e.target.value)}
            >
              <option value="TODAS">Todas</option>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>

          {/* Filtro por código LQ-xxxxx */}
          <div className="form-field">
            <label className="form-label">Código</label>
            <input
              className="form-input"
              type="text"
              value={searchCodigo}
              onChange={(e) => setSearchCodigo(e.target.value)}
              placeholder="LQ-00123"
            />
          </div>

          <div className="mt-3" style={{ gridColumn: "1 / -1" }}>
            <button type="submit"className={'btn-primary ${loading ? "btn-loading" : ""}'}disabled={loading}>
          {loading ? "Buscando..." : "Buscar"}
        </button>
          </div>
        </form>

        {error && (
          <div className="text-error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
            Registros encontrados: <strong>{totalRegistros}</strong>
          </div>
        )}
      </div>

      {/* Tabla de histórico */}
      <div className="section-card">
        <div className="section-header-row">
          <div>
            <h3 className="section-title">Listado de liquidaciones</h3>
            <p className="section-subtitle">
              Cada fila corresponde a una liquidación registrada (cabecera).
            </p>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Fecha Liq.</th> {/* Fecha en que se creó el documento */}
                
                {/* Estas columnas ahora sí se llenarán */}
                <th>Desde</th>
                <th>Hasta</th>
                <th>Condición</th>
                
                <th style={{ textAlign: "right" }}>Subtotal</th>
                <th style={{ textAlign: "right" }}>IGV</th>
                <th style={{ textAlign: "right" }}>Total</th>
                
                <th style={{ textAlign: "center" }}>Grup.</th>
                <th style={{ textAlign: "center" }}>Pac.</th>
                <th style={{ textAlign: "center" }}>Estado</th>
                
                <th>Anulado Por</th>
                
                {/* DOS COLUMNAS DE ACCIÓN SEPARADAS */}
                <th style={{ textAlign: "center", width: "50px" }}>Exp.</th>
                <th style={{ textAlign: "center", width: "50px" }}>Anul.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className="table-empty">Cargando...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={14} className="table-empty">No hay datos en este periodo.</td></tr>
              ) : (
                filteredItems.map((liq) => {
                  const estado = (liq.Estado || "").toUpperCase();
                  const isAnulada = estado === "ANULADA";

                  return (
                    <tr key={liq.IdLiquidacion} style={{ opacity: isAnulada ? 0.6 : 1 }}>
                      <td style={{ fontWeight: 'bold' }}>{liq.Codigo}</td>
                      
                      {/* Fecha de Creación (Real) */}
                      <td>{fmtDate(liq.FechaLiquidacion)}</td>
                      
                      {/* Periodo de Atención (Lo que corregimos en el backend) */}
                      <td>{fmtDate(liq.Desde)}</td>
                      <td>{fmtDate(liq.Hasta)}</td>
                      <td>{liq.CondicionPago || "-"}</td>
                      
                      <td style={{ textAlign: "right" }}>{fmtMoney(liq.Subtotal)}</td>
                      <td style={{ textAlign: "right" }}>{fmtMoney(liq.IGV)}</td>
                      <td style={{ textAlign: "right" }}>{fmtMoney(liq.Total)}</td>
                      
                      <td style={{ textAlign: "center" }}>{liq.Grupos}</td>
                      <td style={{ textAlign: "center" }}>{liq.Pacientes}</td>
                      
                      <td style={{ textAlign: "center" }}>
                        <span style={getEstadoStyle(liq.Estado)}>{getEstadoLabel(liq.Estado)}</span>
                      </td>

                      {/* Log de Anulación */}
                      <td style={{ fontSize: '11px', color: '#EF4444', lineHeight:'1.2' }}>
                        {isAnulada ? (
                          <>
                            <strong>{liq.UsuarioAnula}</strong><br/>
                            <span>{fmtDate(liq.FechaAnulacion)}</span>
                          </>
                        ) : "-"}
                      </td>

                      {/* COLUMNA 1: EXPORTAR */}
                      <td style={{ textAlign: "center" }}>
                        <button
                            className="btn-icon" 
                            style={{ background:'none', border:'1px solid #ddd', borderRadius:'4px', padding:'4px 8px', cursor:'pointer' }}
                            title="Descargar Excel"
                            onClick={() => handleExportar(liq)}
                          >
                            📥
                          </button>
                      </td>

                      {/* COLUMNA 2: ANULAR */}
                      <td style={{ textAlign: "center" }}>
                        {!isAnulada && (
                            <button
                              className="btn-icon"
                              style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:'4px', padding:'4px 8px', color:'#EF4444', cursor:'pointer' }}
                              title="Anular Liquidación"
                              onClick={() => handleAnular(liq)}
                              disabled={anulandoId === liq.IdLiquidacion}
                            >
                              ✕
                            </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de detalle de liquidación */}
      {detailOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={closeDetalle}
        >
          <div
            className="section-card"
            style={{
              width: "min(1100px, 98vw)",
              maxHeight: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-header-row" style={{ marginBottom: 8 }}>
              <div>
                <h3 className="section-title" style={{ marginBottom: 2 }}>
                  Detalle de liquidación
                </h3>
                {detailHeader && (
                  <p className="section-subtitle" style={{ marginTop: 0 }}>
                    Código:{" "}
                    <strong>{detailHeader.Codigo || "-"}</strong> · Desde{" "}
                    <strong>{fmtDate(detailHeader.Desde)}</strong> hasta{" "}
                    <strong>{fmtDate(detailHeader.Hasta)}</strong> · Condición:{" "}
                    <strong>{detailHeader.CondicionPago}</strong> · Total:{" "}
                    <strong>{fmtMoney(detailHeader.Total)}</strong>
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-primary btn-sm" onClick={closeDetalle}>
                  Cerrar
                </button>
              </div>
            </div>

            {detailError && (
              <div className="text-error" style={{ marginBottom: 8 }}>
                {detailError}
              </div>
            )}

            <div
              className="table-wrapper"
              style={{ flex: 1, minHeight: 0, maxHeight: "100%" }}
            >
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Unidad producción</th>
                    <th>Tipo evaluación</th>
                    <th>Sede</th>
                    <th>Documento</th>
                    <th>Paciente</th>
                    <th>Descripción prestación</th>
                    <th style={{ textAlign: "right" }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLoading ? (
                    <tr>
                      <td colSpan={8} className="table-empty">
                        Cargando detalle...
                      </td>
                    </tr>
                  ) : detailRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="table-empty">
                        Sin detalle registrado para esta liquidación.
                      </td>
                    </tr>
                  ) : (
                    detailRows.map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.Cliente || "-"}</td>
                        <td>{r.UnidadProduccion || "-"}</td>
                        <td>{r.TipoEvaluacion || "-"}</td>
                        <td>{r.Sede || "-"}</td>
                        <td>{r.Documento || "-"}</td>
                        <td>{r.Paciente || "-"}</td>
                        <td>{r.DescripcionPrestacion || "-"}</td>
                        <td style={{ textAlign: "right" }}>
                          {fmtMoney(r.Importe)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}