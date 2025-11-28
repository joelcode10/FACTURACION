import React, { useMemo, useState, useEffect } from "react";
import {
  fetchClientesProcess,
  saveExclusions,
  exportLiquidaciones,
  liquidarClientes,
  fetchDetalleConPendientes,
  anularPendiente
} from "../lib/api.js";
// mensajes de liquidación

const STORAGE_KEY = "liquidacion_clientes_state_v1";
export default function Clientes() {
  const [mensajeLiq, setMensajeLiq] = useState("");
  // filtros de consulta al backend
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [condicionPago, setCondicionPago] = useState("TODAS");
  const [filtroFirma, setFiltroFirma] = useState("TODAS"); // TODAS | CON_FIRMA | SIN_FIRMA
  const [liquidando, setLiquidando] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  
  // datos del backend
  const [groups, setGroups] = useState([]);
  const [detailsByGroupId, setDetailsByGroupId] = useState({});
  const [filters, setFilters] = useState({
    clientes: [],
    tipos: [],
    sedes: [],
  });

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
  // 🔹 1) Cargar estado guardado al montar el módulo
useEffect(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    if (saved.from) setFrom(saved.from);
    if (saved.to) setTo(saved.to);
    if (saved.condicionPago) setCondicionPago(saved.condicionPago);
    if (Array.isArray(saved.groups)) setGroups(saved.groups);
    if (saved.detailsByGroupId) setDetailsByGroupId(saved.detailsByGroupId);
    if (saved.filters) setFilters(saved.filters);
  } catch (e) {
    console.error("Error restaurando estado de liquidación:", e);
  }
}, []);

// 🔹 2) Guardar cada vez que cambian filtros y datos
useEffect(() => {
  try {
    const data = {
      from,
      to,
      condicionPago,
      groups,
      detailsByGroupId,
      filters,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Error guardando estado de liquidación:", e);
  }
}, [from, to, condicionPago, groups, detailsByGroupId, filters]);
  useEffect(() => {
    // reset filtros UI cuando llegan nuevos filtros
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
        const gs = (resp.groups || []).map((g, i) => ({
          ...g,
          id: g.id || `g_${i + 1}`,
        }));
        setGroups(gs);
        setDetailsByGroupId(resp.detailsByGroupId || {});
        setFilters(resp.filters || { clientes: [], tipos: [], sedes: [] });
        setSelectedIds(new Set());
        setSelectAll(false);
      } else {
        setGroups([]);
        setDetailsByGroupId({});
        setFilters({ clientes: [], tipos: [], sedes: [] });
        setError(resp?.message || "No se pudo procesar.");
      }
    } catch (err) {
      setError(err.message || "Error al procesar.");
      setGroups([]);
      setDetailsByGroupId({});
      setFilters({ clientes: [], tipos: [], sedes: [] });
    } finally {
      setLoading(false);
    }
  }

  // grupos filtrados por UI (cliente, tipo, sede, firma)
  const viewGroups = useMemo(() => {
    return groups.filter((g) => {
      // cliente
      if (fCliente !== "TODOS" && g.cliente !== fCliente) return false;
      // tipo evaluación
      if (fTipo !== "TODOS" && g.tipoEvaluacion !== fTipo) return false;
      // sede (se mira en el detalle)
      const rows = detailsByGroupId[g.id] || [];
      if (fSede !== "TODOS") {
        const ok = rows.some((r) => r.sedeNombre === fSede);
        if (!ok) return false;
      }
      // filtro de firma
      if (filtroFirma !== "TODAS") {
        if (!rows.length) return false;

        const haySinFirma = rows.some(
          (r) =>
            !r.evaluador ||
            r.evaluador.toString().toUpperCase() === "SIN FIRMA"
        );
        const todoConFirma = rows.every(
          (r) =>
            r.evaluador &&
            r.evaluador.toString().toUpperCase() !== "SIN FIRMA"
        );

        if (filtroFirma === "SIN_FIRMA" && !haySinFirma) return false;
        if (filtroFirma === "CON_FIRMA" && !todoConFirma) return false;
      }

      return true;
    });
  }, [groups, detailsByGroupId, fCliente, fTipo, fSede, filtroFirma]);

  // totales (sobre los seleccionados visibles)
  const subtotal = useMemo(() => {
    let s = 0;
    for (const g of viewGroups)
      if (selectedIds.has(g.id)) s += Number(g.importe || 0);
    return s;
  }, [viewGroups, selectedIds]);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const ns = new Set(prev);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  }

  function toggleSelectAll() {
    setSelectAll((prev) => {
      const next = !prev;
      setSelectedIds(next ? new Set(viewGroups.map((g) => g.id)) : new Set());
      return next;
    });
  }

  async function openDetalle(id) {
  const grp = groups.find((g) => g.id === id);
  if (!grp) return;

  setDetailGroupId(id);
  setDetailOpen(true);

  try {
    // 1) Llamamos al nuevo endpoint que trae:
    //    - rowsNormales (del SP)
    //    - rowsPendientes (tabla LiquidacionClientesPendientes)
    const resp = await fetchDetalleConPendientes({
      from,
      to,
      cliente: grp.cliente,
      unidad: grp.unidadProduccion,
      tipo: grp.tipoEvaluacion,
      sede: grp.sedeNombre || "",
    });

    if (!resp?.ok) {
      console.error(resp?.message || "Error al cargar detalle con pendientes.");
      // si quieres, aquí podrías mostrar un mensaje en pantalla
      return;
    }

    const rowsNormales = resp.rowsNormales || [];
    const rowsPendientes = resp.rowsPendientes || [];

    // 2) Armamos un set con las claves de los pendientes: Nro + Documento
    const pendientesKeys = new Set(
      rowsPendientes.map((r) => {
        const nro = (r.Nro || r.nro || "").trim();
        const doc = (r.Documento || r.documento || "").trim();
        return `${nro}||${doc}`;
      })
    );

    // 3) Combinamos:
    //    a) filas normales del SP
    //    b) filas pendientes que no vengan ya en el SP (caso raro)
    const combined = [];
 
    // a) Normales (SP export) → los mapeamos al formato interno
    rowsNormales.forEach((r) => {
      const nro = (r.Nro || r.nro || "").trim();
      const doc = (
        r.Documento ||
        r["Documento"] ||
        r["N° Documento"] ||
        ""
      ).trim();

      const key = `${nro}||${doc}`;

      combined.push({
        nro,
        fechaInicio: r["Fecha Inicio"] || r.FechaInicio || null,
        cliente: grp.cliente,
        rucCliente: r["RUC DEL CLIENTE"] || r.RucCliente || null,
        unidadProduccion: grp.unidadProduccion,
        tipoEvaluacion: grp.tipoEvaluacion,
        condicionPago:
          r["Condición de Pago"] || r["Condicion de Pago"] || "",
        tipoDocumento: r["Tipo de Documento"] || "",
        documento: doc,
        paciente: r["Paciente"] || r.Paciente,
        evaluador: r["Evaluador"] || r.Evaluador,
        precioCb: Number(
          r["Importe"] || r["Precio CB"] || r.Importe || 0
        ),
        sedeNombre: r["Sede"] || grp.sedeNombre,
        isPendiente: pendientesKeys.has(key), // 👈 ya estaba marcado "No liquidar"
      });
    });

    // b) Pendientes que no salgan en el SP (por si acaso)
    rowsPendientes.forEach((r) => {
      const nro = (r.Nro || "").trim();
      const doc = (r.Documento || "").trim();
      const key = `${nro}||${doc}`;

      const yaExiste = combined.some(
        (x) => `${x.nro}||${x.documento}` === key
      );
      if (yaExiste) return;

      combined.push({
        nro,
        fechaInicio: r.FechaInicio || null,
        cliente: r.Cliente || grp.cliente,
        rucCliente: r.RucCliente || null,
        unidadProduccion: r.UnidadProduccion || grp.unidadProduccion,
        tipoEvaluacion: r.TipoEvaluacion || grp.tipoEvaluacion,
        condicionPago: r.CondicionPago || "",
        tipoDocumento: "",
        documento: doc,
        paciente: r.Paciente,
        evaluador: r.Evaluador || "",
        precioCb: Number(r.Importe || 0),
        sedeNombre: r.Sede || grp.sedeNombre,
        isPendiente: true,
      });
    });

    // 4) Guardamos el detalle completo (normales + pendientes) para este grupo
    setDetailsByGroupId((prev) => ({
      ...prev,
      [id]: combined,
    }));

    // 5) Inicializamos el estado de exclusiones:
    //    - Si ya es pendiente → lo dejamos marcado en true
    const map = new Map();
    combined.forEach((r) => {
      const key = `${r.nro || ""}||${r.documento || ""}`;
      if (r.isPendiente) {
        map.set(key, true);
      }
    });
    setExclState(map);
  } catch (err) {
    console.error("Error al abrir detalle con pendientes:", err);
    // si quieres, muestra mensaje de error en pantalla
  }
}

  function closeDetalle() {
    setDetailOpen(false);
    setDetailGroupId(null);
    setExclState(new Map());
  }

  // detalle por paciente (agregando importe por paciente)
const patientsInGroup = useMemo(() => {
  if (!detailGroupId) return [];
  const rows = detailsByGroupId[detailGroupId] || [];
  const acc = new Map();

  for (const r of rows) {
    const k = `${r.paciente || ""}||${r.documento || ""}||${r.nro || ""}`;
    const prev =
      acc.get(k) || {
        paciente: r.paciente,
        documento: r.documento,
        nro: r.nro,
        importe: 0,
        isPendiente: false, // 👈 nuevo
      };

    prev.importe += Number(r.precioCb || 0);

    // Si alguna prestación del paciente está marcada como pendiente, marcamos al paciente como pendiente
    if (r.isPendiente) {
      prev.isPendiente = true;
    }

    acc.set(k, prev);
  }

  return Array.from(acc.values());
}, [detailGroupId, detailsByGroupId]);

  function setExclude(nro, doc, value) {
    const k = `${nro || ""}||${doc || ""}`;
    setExclState((prev) => {
      const m = new Map(prev);
      m.set(k, !!value);
      return m;
    });
  }
  async function handleAnularPendiente(p) {
  try {
    // 1) Buscamos datos en las filas originales del grupo
    const rows = detailsByGroupId[detailGroupId] || [];

    let nro = p.nro;
    let documento = p.documento;

    // Si falta alguno, lo buscamos en las filas originales
    if (!nro || !documento) {
      const match = rows.find((r) => {
        const docRow = (r.documento || r.Documento || "").trim();
        const docP   = (p.documento || "").trim();
        const pacRow = (r.paciente || "").trim();
        const pacP   = (p.paciente || "").trim();

        return docRow && docRow === docP && pacRow === pacP;
      });

      if (match) {
        nro = (match.nro || match.Nro || "").trim();
        documento = (match.documento || match.Documento || "").trim();
      }
    }

    // 2) Si aún falta algo, no podemos anular
    if (!nro || !documento) {
      alert("No se puede anular: falta Nro o Documento.");
      return;
    }

    // 3) Llamamos al backend
    await anularPendiente({ nro, documento });

    // 4) Actualizamos el estado local: ese paciente deja de estar marcado
    setExclState((prev) => {
      const m = new Map(prev);
      const key = `${nro}||${documento}`;
      m.set(key, false);
      return m;
    });

    alert("Pendiente anulado correctamente.");

    // 5) Opcional: refrescar el resumen para que desaparezca de la liquidación
    await handleProcess();
  } catch (err) {
    console.error("Error al anular pendiente:", err);
    alert("Error al anular pendiente.");
  }
}
  async function saveExclusionsClick() {
  // Filas originales del grupo (detalle completo que vino del backend)
  const rows = detailsByGroupId[detailGroupId] || [];

  // Resumen del grupo actual (cliente, unidad, tipo, sede, etc.)
  const grp = groups.find((g) => g.id === detailGroupId) || {};

  const items = [];

  // Recorremos TODOS los pacientes del grupo (marcados y no marcados)
  for (const p of patientsInGroup) {
    const k = `${p.nro || ""}||${p.documento || ""}`;
    const marcado = !!exclState.get(k); // true = NO liquidar (PENDIENTE), false = ANULAR

    // Filas originales del grupo para completar datos
    const matchingRow =
      rows.find(
        (r) =>
          (r.nro || "") === (p.nro || "") &&
          (r.documento || "") === (p.documento || "")
      ) || {};

    // Aseguramos que siempre haya un Nro
    const nroFinal = p.nro || matchingRow.nro || "";

    items.push({
      nro: nroFinal,
      documento: p.documento || matchingRow.documento || "",
      exclude: marcado, // 👈 clave: true = PENDIENTE, false = ANULADO
      paciente: p.paciente || matchingRow.paciente || "",
      cliente: grp.cliente || matchingRow.cliente || "",
      unidadProduccion:
        grp.unidadProduccion || matchingRow.unidadProduccion || "",
      tipoEvaluacion:
        grp.tipoEvaluacion || matchingRow.tipoEvaluacion || "",
      sedeNombre: matchingRow.sedeNombre || grp.sedeNombre || "",
      importe: p.importe ?? matchingRow.precioCb ?? 0,
      createdBy: "admin", // luego lo cambias por el usuario logueado
    });
  }

  // Llamamos a la API con rango, condición y lista de pendientes
  await saveExclusions({
    from,
    to,
    condicionPago,
    items,
  });

  closeDetalle();
  // refrescar para que ya no aparezcan los PENDIENTES en este período
  await handleProcess();
}

  async function exportarSeleccionados() {
    if (!selectedIds.size) return;
    const selectedIdsArr = Array.from(selectedIds);
    const blob = await exportLiquidaciones({
      from,
      to,
      condicionPago,
      selectedIds: selectedIdsArr,
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
  async function liquidarSeleccionados() {
  setMensajeLiq("");

  if (!from || !to) {
    alert("Primero indica el rango de fechas (desde / hasta).");
    return;
  }

  if (!selectedIds.size) {
    alert("Selecciona al menos un grupo para liquidar.");
    return;
  }

  // Filtrar solo grupos NO liquidados
  const groupsMap = new Map(groups.map((g) => [g.id, g]));
  const idsArr = Array.from(selectedIds);
  const idsNoLiquidados = idsArr.filter((id) => {
    const g = groupsMap.get(id);
    return g && g.estadoLiquidado !== "LIQUIDADO";
  });

  if (!idsNoLiquidados.length) {
    alert("Todos los grupos seleccionados ya están liquidados.");
    return;
  }

  if (
    !window.confirm(
      `¿Confirma liquidar ${idsNoLiquidados.length} grupo(s) en el rango ${from} a ${to}?`
    )
  ) {
    return;
  }

  try {
    setLiquidando(true);

    const resp = await liquidarClientes({
      from,
      to,
      condicionPago,
      selectedIds: idsNoLiquidados,
    });

    if (!resp?.ok) {
      alert(resp?.message || "Error al registrar la liquidación.");
      return;
    }

    // Mensaje amigable con el código de liquidación
    setMensajeLiq(
      `✅ Liquidación registrada correctamente. Código: ${resp.idLiquidacion}`
    );

    // Limpiar selección
    setSelectedIds(new Set());
    setSelectAll(false);

    // 🔄 Volver a procesar para que el backend marque esos grupos como LIQUIDADO
    await handleProcess();
  } catch (err) {
    console.error("Error al liquidar:", err);
    alert(err.message || "Error al registrar la liquidación.");
  } finally {
    setLiquidando(false);
  }
}
  const fmtMoney = (n) =>
    Number(n || 0).toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="module-page">
      {/* Procesar (ancho completo) */}
      <div className="section-card section-card-wide">
        <h3 className="section-title">BUSQUEDA POR FECHA</h3>
        <p className="section-subtitle">
          
        </p>

        <form className="form-grid" onSubmit={handleProcess}>
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

          <div className="mt-3" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </form>

        {error && (
          <div className="text-error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>

      {/* Resumen con filtros UI */}
      <div className="section-card">
        <div>
            <h3 className="section-title">Resumen de liquidación</h3>
        </div>
        <div className="section-header-row">
          <div className="filter-row">
            <select
              className="form-select"
              value={fCliente}
              onChange={(e) => setFCliente(e.target.value)}
            >
              <option value="TODOS">Todos los clientes</option>
              {filters.clientes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="form-select"
              value={fTipo}
              onChange={(e) => setFTipo(e.target.value)}
            >
              <option value="TODOS">Todos los tipos</option>
              {filters.tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className="form-select"
              value={fSede}
              onChange={(e) => setFSede(e.target.value)}
            >
              <option value="TODOS">Todas las sedes</option>
              {filters.sedes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {/* Filtro de firma */}
            <select
              className="form-select"
              value={filtroFirma}
              onChange={(e) => setFiltroFirma(e.target.value)}
            >
              <option value="TODAS">Todas las firmas</option>
              <option value="CON_FIRMA">Solo con firma</option>
              <option value="SIN_FIRMA">Solo sin firma</option>
            </select>
          </div> 
        </div><br />

        <div className="table-wrapper">
          <table className="simple-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Fecha inicio</th>
                <th>Cliente</th>
                <th>Unidad de producción</th>
                <th>Tipo evaluación</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th>Estado</th>
                <th>Código</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {viewGroups.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan={7}>
                    Sin resultados con los filtros actuales.
                  </td>
                </tr>
              ) : (
                viewGroups.map((g) => (
                  <tr
                    key={g.id}
                    style={
                      g.esSoloPendiente
                        ? { backgroundColor: "#FFF3CD" } // un amarillo suave para pendientes
                        : {}
                    }
                  >
                  <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(g.id)}
                        onChange={() => toggleSelect(g.id)}
                      />
                    </td>
                    <td className="nowrap">{g.fechaInicioMin || "-"}</td>
                    <td>{g.cliente || "-"}</td>
                    <td>{g.unidadProduccion || "-"}</td>
                    <td>{g.tipoEvaluacion || "-"}</td>
                    <td style={{ textAlign: "right" }}>
                      {fmtMoney(g.importe)}
                    </td>
                   <td>
                      {g.estadoLiquidado === "LIQUIDADO" && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#C8E6C9",   // verde claro
                            color: "#256029",        // verde fuerte
                          }}
                        >
                          Liquidado
                        </span>
                      )}

                      {g.estadoLiquidado === "PARCIAL" && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#FFF3CD",   // amarillo claro
                            color: "#856404",        // amarillo oscuro
                          }}
                        >
                          Parcial
                        </span>
                      )}

                      {g.estadoLiquidado === "NO" && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#FFCDD2",   // rojo claro
                            color: "#B71C1C",        // rojo fuerte
                          }}
                        >
                          No liquidado
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{g.codigo ? g.codigo : "-"}</td>
                    <td>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => openDetalle(g.id)}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pie: totales + exportar + liquidar */}
        <div className="summary-footer">
          <div className="summary-totals">
            <span className="summary-label">Seleccionados:</span>
            <span className="summary-value">{selectedIds.size}</span>
            <span className="summary-label">Subtotal:</span>
            <span className="summary-value">{fmtMoney(subtotal)}</span>
            <span className="summary-label">IGV:</span>
            <span className="summary-value">{fmtMoney(subtotal * 0.18)}</span>
            <span className="summary-label">Total:</span>
            <span className="summary-value">{fmtMoney(subtotal * 1.18)}</span>
          </div>
          
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-primary btn-sm"
              disabled={!selectedIds.size || subtotal === 0 || loading}
              onClick={exportarSeleccionados}
            >
              Exportar
            </button>
            <button
              className="btn-primary btn-sm"
              onClick={liquidarSeleccionados}
              disabled={liquidando || !selectedIds.size}
            >
              {liquidando ? "Liquidando..." : "Liquidar"}
            </button>
          </div>
        </div>
      </div>

      {/* Modal detalle: Paciente, Documento, Importe + No liquidar + Guardar */}
      {detailOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
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
            style={{ width: "min(860px, 95vw)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="section-header-row"
              style={{ marginBottom: 8 }}
            >
              <h3 className="section-title" style={{ marginBottom: 0 }}>
                Detalle de pacientes
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn-primary btn-sm"
                  onClick={saveExclusionsClick}
                >
                  Guardar
                </button>
                <button
                  className="btn-primary btn-sm"
                  onClick={closeDetalle}
                >
                  Cerrar
                </button>
              </div>
            </div>
            <p
              className="section-subtitle"
              style={{ marginTop: 0 }}
            >
              Marca “No liquidar” para excluir pacientes de esta
              liquidación y próximas.
            </p>

            <div className="table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Documento</th>
                    <th style={{ textAlign: "right" }}>Importe</th>
                    <th>No liquidar</th>
                    <th>Acción</th> {/* 👈 nueva columna */}
                  </tr>
                </thead>
                <tbody>
                      {patientsInGroup.length === 0 ? (
                        <tr>
                          <td className="table-empty" colSpan={5}>
                            Sin pacientes.
                          </td>
                        </tr>
                      ) : (
                        patientsInGroup.map((p, idx) => {
                          const k = `${p.nro || ""}||${p.documento || ""}`;
                          const checked = !!exclState.get(k);
                          const esPendiente = !!p.isPendiente;

                          return (
                            <tr key={`${k}||${idx}`}>
                              <td>{p.paciente || "-"}</td>
                              <td>{p.documento || "-"}</td>
                              <td style={{ textAlign: "right" }}>{fmtMoney(p.importe)}</td>

                              {/* Check de "No liquidar":
                                  - habilitado solo si NO es pendiente
                                  - si ya es pendiente, queda marcado y bloqueado */}
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={esPendiente} // 👈 ya está pendiente, no se edita aquí
                                  onChange={(e) =>
                                    setExclude(p.nro, p.documento, e.target.checked)
                                  }
                                />
                              </td>

                              {/* Acción: solo aparece si YA es pendiente */}
                              <td>
                                {esPendiente ? (
                                  <button
                                    type="button"
                                    className="btn-primary btn-sm"
                                    onClick={() => handleAnularPendiente(p)}
                                  >
                                    Anular pendiente
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 12, color: "#777" }}>-</span>
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
        </div>
      )}
    </div>
  );
}