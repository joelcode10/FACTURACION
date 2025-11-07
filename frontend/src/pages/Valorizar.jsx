// src/pages/Valorizar.jsx
import React, { useMemo, useState } from "react";
import { fetchClientesProcess } from "../lib/api";

// Utilidad simple para formato moneda
function formatMoney(v) {
  if (!v || isNaN(v)) return "0.00";
  return v.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Valorizar() {
  // ---- Estado de proceso (traer liquidaciones) ----
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [condicionPago, setCondicionPago] = useState("TODAS");

  const [loading, setLoading] = useState(false);
  const [errorProcess, setErrorProcess] = useState("");

  const [groups, setGroups] = useState([]); // grupos obtenidos del backend
  const [filters, setFilters] = useState({
    clientes: [],
    tipos: [],
  });

  // ---- Filtros de resumen (sobre los grupos ya cargados) ----
  const [filtroCliente, setFiltroCliente] = useState("TODOS");
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [filtroEstadoVal, setFiltroEstadoVal] = useState("TODOS"); // TODOS | SIN | CON

  // ---- Selección de filas ----
  const [selectedIds, setSelectedIds] = useState([]);

  // ---- Estado de valorización (solo en memoria) ----
  // valorizationById[id] = { tipo: 'FACTURA' | 'NC', serie, numero }
  const [valorizationById, setValorizationById] = useState({});

  // ---- Modal de valorización ----
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTipo, setModalTipo] = useState("FACTURA");
  const [modalSerie, setModalSerie] = useState("");
  const [modalNumero, setModalNumero] = useState("");

  // ----------------- Llamar al backend (mismo endpoint de Clientes) -----------------
  const handleProcesar = async (e) => {
    e.preventDefault();
    setErrorProcess("");

    if (!desde || !hasta) {
      setErrorProcess("Selecciona un rango de fechas.");
      return;
    }

    try {
      setLoading(true);
      setSelectedIds([]);
      // mismo endpoint que usa la pantalla de Liquidación de Clientes
      const data = await fetchClientesProcess({
        desde,
        hasta,
        condicionPago, // el backend puede ignorarlo si aún no lo usa
      });

      setGroups(data.groups || []);
      setFilters(data.filters || { clientes: [], tipos: [] });

      // No borramos las valorizaciones anteriores, pero podrías hacerlo aquí si prefieres:
      // setValorizationById({});
    } catch (err) {
      console.error(err);
      setErrorProcess("Ocurrió un error al procesar las liquidaciones.");
    } finally {
      setLoading(false);
    }
  };

  // ----------------- Derivados: grupos filtrados y totales -----------------
  const gruposFiltrados = useMemo(() => {
    return (groups || []).filter((g) => {
      if (filtroCliente !== "TODOS" && g.cliente !== filtroCliente) return false;
      if (filtroTipo !== "TODOS" && g.tipoEvaluacion !== filtroTipo) return false;

      const val = valorizationById[g.id];
      if (filtroEstadoVal === "SIN" && val) return false;
      if (filtroEstadoVal === "CON" && !val) return false;

      return true;
    });
  }, [groups, filtroCliente, filtroTipo, filtroEstadoVal, valorizationById]);

  const totalVisible = useMemo(() => {
    return gruposFiltrados.reduce((acc, g) => acc + (g.importe || 0), 0);
  }, [gruposFiltrados]);

  const totalSeleccionado = useMemo(() => {
    return gruposFiltrados
      .filter((g) => selectedIds.includes(g.id))
      .reduce((acc, g) => acc + (g.importe || 0), 0);
  }, [gruposFiltrados, selectedIds]);

  // ----------------- Selección -----------------
  const toggleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    const visiblesIds = gruposFiltrados.map((g) => g.id);
    const allSelected = visiblesIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      // desmarcar visibles
      setSelectedIds((prev) => prev.filter((id) => !visiblesIds.includes(id)));
    } else {
      // marcar todos los visibles
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visiblesIds])));
    }
  };

  // ----------------- Valorizar -----------------
  const handleAbrirModalValorizar = () => {
    if (selectedIds.length === 0) {
      alert("Selecciona al menos una liquidación para valorizar.");
      return;
    }
    // Validamos que sea el mismo cliente en todos los seleccionados
    const seleccionados = gruposFiltrados.filter((g) =>
      selectedIds.includes(g.id)
    );
    const clientes = Array.from(new Set(seleccionados.map((g) => g.cliente)));

    if (clientes.length > 1) {
      alert("Solo puedes valorizar liquidaciones de un mismo cliente a la vez.");
      return;
    }

    // pre-llenar si ya estaba valorizado el primero
    const firstId = seleccionados[0]?.id;
    const existing = firstId ? valorizationById[firstId] : null;
    setModalTipo(existing?.tipo || "FACTURA");
    setModalSerie(existing?.serie || "");
    setModalNumero(existing?.numero || "");

    setModalOpen(true);
  };

  const handleConfirmarValorizar = (e) => {
    e.preventDefault();
    if (!modalSerie.trim() || !modalNumero.trim()) {
      alert("Ingresa serie y número de comprobante.");
      return;
    }

    const newVal = {
      tipo: modalTipo,
      serie: modalSerie.trim(),
      numero: modalNumero.trim(),
    };

    setValorizationById((prev) => {
      const copy = { ...prev };
      selectedIds.forEach((id) => {
        copy[id] = newVal;
      });
      return copy;
    });

    setModalOpen(false);
  };

  // ----------------- Anular -----------------
  const handleAnular = () => {
    if (selectedIds.length === 0) {
      alert("Selecciona al menos una liquidación para anular su valorización.");
      return;
    }

    const seleccionados = gruposFiltrados.filter((g) =>
      selectedIds.includes(g.id)
    );
    const conValor = seleccionados.filter((g) => valorizationById[g.id]);

    if (conValor.length === 0) {
      alert("Las liquidaciones seleccionadas no tienen valorización registrada.");
      return;
    }

    if (
      !window.confirm(
        `¿Seguro que deseas anular la valorización de ${conValor.length} liquidación(es)?`
      )
    ) {
      return;
    }

    setValorizationById((prev) => {
      const copy = { ...prev };
      conValor.forEach((g) => {
        delete copy[g.id];
      });
      return copy;
    });
  };

  // ----------------- Exportar -----------------
  const handleExportar = () => {
    if (selectedIds.length === 0) {
      alert("Selecciona al menos una liquidación para exportar.");
      return;
    }
    const seleccionados = gruposFiltrados.filter((g) =>
      selectedIds.includes(g.id)
    );
    const noValorizadas = seleccionados.filter((g) => !valorizationById[g.id]);

    if (noValorizadas.length > 0) {
      alert(
        "Todas las liquidaciones a exportar deben estar valorizadas (con comprobante)."
      );
      return;
    }

    // Aquí, más adelante, llamaremos a un endpoint de exportación.
    // Por ahora solo mostramos un mensaje para validar flujo.
    const ids = seleccionados.map((g) => g.id).join(", ");
    alert(
      `Exportación simulada.\nLiquidaciones (ids): ${ids}\nMás adelante esto generará el archivo real.`
    );
  };

  return (
    <div className="module-page">
      

      {/* Bloque 1: Procesar (traer grupos) */}
      <section className="section-card">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">Procesar liquidaciones</h2>
            <p className="section-subtitle">
              Ingresa un rango de fechas y, opcionalmente, una condición de
              pago. El sistema traerá las liquidaciones agrupadas por cliente,
              unidad de producción y tipo de evaluación.
            </p>
          </div>
        </div>

        <form onSubmit={handleProcesar}>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label" htmlFor="val-desde">
                Desde
              </label>
              <input
                id="val-desde"
                type="date"
                className="form-input"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="val-hasta">
                Hasta
              </label>
              <input
                id="val-hasta"
                type="date"
                className="form-input"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="val-cond">
                Condición de pago
              </label>
              <select
                id="val-cond"
                className="form-select"
                value={condicionPago}
                onChange={(e) => setCondicionPago(e.target.value)}
              >
                <option value="TODAS">(Todas)</option>
                <option value="CREDITO">Crédito</option>
                <option value="CONTADO">Contado</option>
              </select>
            </div>
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

          {errorProcess && (
            <p className="text-error" style={{ marginTop: 8 }}>
              {errorProcess}
            </p>
          )}
        </form>
      </section>

      {/* Bloque 2: Resumen y valorización */}
      <section className="section-card">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">Liquidaciones para valorizar</h2>
            <p className="section-subtitle">
              Filtra por cliente, tipo de evaluación y estado de valorización.
              Selecciona una o varias filas para valorizar, anular o exportar.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="filters-row">
          <div className="form-field" style={{ minWidth: 180 }}>
            <label className="form-label" htmlFor="f-cli">
              Cliente
            </label>
            <select
              id="f-cli"
              className="form-select"
              value={filtroCliente}
              onChange={(e) => {
                setFiltroCliente(e.target.value);
                setSelectedIds([]);
              }}
            >
              <option value="TODOS">(Todos)</option>
              {filters.clientes?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field" style={{ minWidth: 180 }}>
            <label className="form-label" htmlFor="f-tipo">
              Tipo de evaluación
            </label>
            <select
              id="f-tipo"
              className="form-select"
              value={filtroTipo}
              onChange={(e) => {
                setFiltroTipo(e.target.value);
                setSelectedIds([]);
              }}
            >
              <option value="TODOS">(Todos)</option>
              {filters.tipos?.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field" style={{ minWidth: 180 }}>
            <label className="form-label" htmlFor="f-est">
              Estado de valorización
            </label>
            <select
              id="f-est"
              className="form-select"
              value={filtroEstadoVal}
              onChange={(e) => {
                setFiltroEstadoVal(e.target.value);
                setSelectedIds([]);
              }}
            >
              <option value="TODOS">(Todos)</option>
              <option value="SIN">Sin valorizar</option>
              <option value="CON">Valorizadas</option>
            </select>
          </div>
        </div>

        {/* Tabla */}
        <div className="table-wrapper">
          <table className="simple-table">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={
                      gruposFiltrados.length > 0 &&
                      gruposFiltrados.every((g) => selectedIds.includes(g.id))
                    }
                    onChange={toggleSelectAllVisible}
                  />
                </th>
                <th>Fecha inicio</th>
                <th>Cliente</th>
                <th>Unidad de producción</th>
                <th>Tipo de evaluación</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th>Estado</th>
                <th>Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {gruposFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Aún no hay liquidaciones para mostrar. Procesa un rango de
                    fechas y aplica filtros si es necesario.
                  </td>
                </tr>
              ) : (
                gruposFiltrados.map((g) => {
                  const v = valorizationById[g.id];
                  const estado = v ? "Valorizada" : "Sin valorizar";
                  const comp = v
                    ? `${v.tipo === "FACTURA" ? "Factura" : "Nota de crédito"} ${
                        v.serie
                      }-${v.numero}`
                    : "-";
                  return (
                    <tr key={g.id}>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(g.id)}
                          onChange={() => toggleSelectOne(g.id)}
                        />
                      </td>
                      <td>{g.fechaInicioMin || ""}</td>
                      <td>{g.cliente}</td>
                      <td>{g.unidadProduccion}</td>
                      <td>{g.tipoEvaluacion}</td>
                      <td style={{ textAlign: "right" }}>
                        {formatMoney(g.importe || 0)}
                      </td>
                      <td>{estado}</td>
                      <td>{comp}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer de resumen y acciones */}
        <div className="summary-footer">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleAbrirModalValorizar}
            >
              Valorizar
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ background: "#f97316", boxShadow: "none" }}
              onClick={handleAnular}
            >
              Anular valorización
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ background: "#111827" }}
              onClick={handleExportar}
            >
              Exportar
            </button>
          </div>

          <div className="summary-totals">
            <span className="summary-label">
              Total visible: S/ {formatMoney(totalVisible)} · Seleccionado:
            </span>
            <span className="summary-value">
              S/ {formatMoney(totalSeleccionado)}
            </span>
          </div>
        </div>
      </section>

      {/* Modal simple para valorizar */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            className="section-card"
            style={{
              width: 420,
              maxWidth: "95%",
              boxShadow: "0 20px 45px rgba(15,23,42,0.35)",
            }}
          >
            <h3
              style={{
                marginTop: 0,
                marginBottom: 8,
                fontSize: "1.15rem",
              }}
            >
              Valorizar liquidaciones seleccionadas
            </h3>
            <p
              style={{
                marginTop: 0,
                marginBottom: 12,
                fontSize: "0.9rem",
                color: "#4b5563",
              }}
            >
              Asigna el tipo de comprobante y su número. Esta información se
              utilizará después en el reporte de cierre.
            </p>

            <form onSubmit={handleConfirmarValorizar} className="form-grid">
              <div className="form-field" style={{ gridColumn: "1 / span 2" }}>
                <label className="form-label">Tipo de comprobante</label>
                <select
                  className="form-select"
                  value={modalTipo}
                  onChange={(e) => setModalTipo(e.target.value)}
                >
                  <option value="FACTURA">Factura</option>
                  <option value="NC">Nota de crédito</option>
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Serie</label>
                <input
                  className="form-input"
                  value={modalSerie}
                  onChange={(e) => setModalSerie(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Número</label>
                <input
                  className="form-input"
                  value={modalNumero}
                  onChange={(e) => setModalNumero(e.target.value)}
                />
              </div>

              <div
                style={{
                  gridColumn: "1 / span 2",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    background: "#e5e7eb",
                    color: "#111827",
                    boxShadow: "none",
                  }}
                  onClick={() => setModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Guardar valorización
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
