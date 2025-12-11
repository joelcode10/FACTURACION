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
  // Estados de prestación seleccionados (multi-check)
  const [estadosSeleccionados, setEstadosSeleccionados] = useState([]); 
  const [dropdownEstadosOpen, setDropdownEstadosOpen] = useState(false);
  const [liquidando, setLiquidando] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [exportando, setExportando] = useState(false);
const [savingExclusions, setSavingExclusions] = useState(false);
const [anulandoPendienteKey, setAnulandoPendienteKey] = useState(null);
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
  
  useEffect(() => {
  // Cuando se actualizan los filtros que vienen del backend (clientes, tipos, sedes, estados),
  // reseteamos los filtros visuales a "sin filtro".
  setFCliente("TODOS");
  setFTipo("TODOS");
  setFSede("TODOS");

  // Esto deja el filtro de estado de prestación en "mostrar todos"
  setEstadosSeleccionados([]);
}, [filters]);
  // Cargar TODO el estado guardado al montar el módulo
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
    console.error("Error restaurando estado:", e);
  }
}, []);
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
    console.error("Error guardando estado:", e);
  }
}, [from, to, condicionPago, groups, detailsByGroupId, filters]);
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

 const viewGroups = useMemo(() => {
  const result = [];

  for (const g of groups) {
    // 1) Filtro por cliente
    if (fCliente !== "TODOS" && g.cliente !== fCliente) continue;
    // 2) Filtro por tipo de evaluación
    if (fTipo !== "TODOS" && g.tipoEvaluacion !== fTipo) continue;

    const allRows = detailsByGroupId[g.id] || [];

    // 3) Filtro por sede (usa las filas)
    if (fSede !== "TODOS") {
      const okSede = allRows.some((r) => r.sedeNombre === fSede);
      if (!okSede) continue;
    }

    // 4) Filtro por Estado de la prestación
    let usedRows = allRows;
    if (estadosSeleccionados.length > 0) {
      usedRows = allRows.filter((r) =>
        estadosSeleccionados.includes(r.estadoPrestacion || "")
      );
      // si con el filtro ya no queda ninguna fila, el grupo no se muestra
      if (usedRows.length === 0) continue;
    }

    // 5) Calcular importeVisible según las filas filtradas
    let importeVisible = g.importe; // por defecto, sin filtro

    if (estadosSeleccionados.length > 0) {
      let importeTotal = 0;
      let importeDisponible = 0;
      let importeLiquidado = 0;

      for (const r of usedRows) {
        const monto = Number(r.precioCb || 0);
        importeTotal += monto;

        const esPendiente = !!r.isPendiente;
        const esLiquidado = !!r.estaLiquidado;

        // misma lógica que en el backend:
        if (!esPendiente && !esLiquidado) {
          importeDisponible += monto;
        }
        if (esLiquidado) {
          importeLiquidado += monto;
        }
      }

      // Respetamos la lógica de estadoLiquidado del backend
      if (g.estadoLiquidado === "LIQUIDADO") {
        importeVisible = importeTotal;
      } else if (g.estadoLiquidado === "PARCIAL") {
        importeVisible = importeLiquidado;
      } else {
        // "NO"
        importeVisible = importeDisponible;
      }
    }

    result.push({
      ...g,
      importeVisible,
    });
  }

  return result;
}, [groups, detailsByGroupId, fCliente, fTipo, fSede, estadosSeleccionados]);

  // totales (sobre los seleccionados visibles)
  const subtotal = useMemo(() => {
  let s = 0;
  for (const g of viewGroups) {
    if (selectedIds.has(g.id)) {
      s += Number(
        g.importeVisible ?? g.importe ?? 0
      );
    }
  }
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
    // ⚠️ Separar pendientes "del periodo actual" vs "periodos anteriores"
const rowsPendientesActual = rowsPendientes.filter(
  (r) => Number(r.EsPendienteActual) === 1
);
const rowsPendientesPrevios = rowsPendientes.filter(
  (r) => Number(r.EsPendienteActual) !== 1
);

// Claves para saber quién es pendiente ACTUAL y quién viene de periodo anterior
const pendientesKeysActual = new Set(
  rowsPendientesActual.map((r) => {
    const nro = (r.Nro || r.nro || "").toString().trim();
    const doc = (r.Documento || r.documento || "").toString().trim();
    return `${nro}||${doc}`;
  })
);

const pendientesKeysPrevios = new Set(
  rowsPendientesPrevios.map((r) => {
    const nro = (r.Nro || r.nro || "").toString().trim();
    const doc = (r.Documento || r.documento || "").toString().trim();
    return `${nro}||${doc}`;
  })
);
    // NUEVO: solo pendientes del período actual
  const pendientesKeys = new Set(
  rowsPendientes
    .filter((r) => Number(r.EsPendienteActual) === 1)
    .map((r) => {
      const nro = (r.Nro || r.nro || "").trim();
      const doc = (r.Documento || r.documento || "").trim();
      return `${nro}||${doc}`;
    })
);

    // 3) Combinamos:
    //    a) filas normales del SP
    //    b) filas pendientes que no vengan ya en el SP (caso raro)
    const combined = [];
 
   rowsNormales.forEach((r) => {
  const nro = (r.Nro || r.nro || "").toString().trim();
  const doc = (
    r.Documento ||
    r["Documento"] ||
    r["N° Documento"] ||
    ""
  ).toString().trim();

  const key = `${nro}||${doc}`;

  const esPendienteActual = pendientesKeysActual.has(key);
  const vieneDePendientePrevio = pendientesKeysPrevios.has(key);

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
    estadoPrestacion: r["Estado de la Prestación"] || r.estadoPrestacion || "",

    // ⚠️ solo los pendientes del PERIODO ACTUAL se bloquean
    isPendiente: esPendienteActual,
    // ⚠️ viene de LiquidacionClientesPendientes de un periodo anterior
    fromPendientePrevio: vieneDePendientePrevio,
  });
});
    rowsPendientes.forEach((r) => {
  const nro = (r.Nro || "").toString().trim();
  const doc = (r.Documento || "").toString().trim();
  const key = `${nro}||${doc}`;

  const yaExiste = combined.some(
    (x) => `${x.nro || ""}||${x.documento || ""}` === key
  );
  if (yaExiste) return;

  const esPendienteActual = Number(r.EsPendienteActual) === 1;
  const vieneDePendientePrevio = !esPendienteActual;

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

    // ⚠️ igual que arriba:
    isPendiente: esPendienteActual,       // solo bloqueamos si es del periodo actual
    estadoPrestacion: r.EstadoPrestacion || "Pendiente",
    fromPendientePrevio: vieneDePendientePrevio, // pero sabemos que viene de antes
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

  // ✅ Marcar como "No liquidar" solo si es pendiente del periodo actual
  //    y NO es un pendiente arrastrado de un periodo anterior.
  if (r.isPendiente && !r.origenPendiente && !r.fromPendientePrevio) {
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

  const patientsInGroup = useMemo(() => {
  if (!detailGroupId) return [];

  const baseRows = detailsByGroupId[detailGroupId] || [];

  // 🔹 Aplicar el MISMO filtro de estados que en la grilla
  const rows =
    estadosSeleccionados.length > 0
      ? baseRows.filter((r) =>
          estadosSeleccionados.includes(r.estadoPrestacion || "")
        )
      : baseRows;

  const acc = new Map();

  for (const r of rows) {
    const k = `${r.paciente || ""}||${r.documento || ""}||${r.nro || ""}`;

    const prev =
      acc.get(k) || {
        paciente: r.paciente,
        documento: r.documento,
        nro: r.nro,
        importe: 0,
        // Pendiente EN el periodo actual
        isPendiente: false,
        // Viene arrastrado de otro periodo
        origenPendiente: false,
        // Fecha de inicio mínima
        fechaInicio: r.fechaInicio || null,
      };

    // 💰 Sumar solo las filas que pasaron el filtro
    prev.importe += Number(r.precioCb || r.importe || 0);

    if (r.isPendiente) {
      prev.isPendiente = true;
    }

    if (r.origenPendiente || r.fromPendientePrevio) {
      prev.origenPendiente = true;
    }

    if (
      r.fechaInicio &&
      (!prev.fechaInicio ||
        new Date(r.fechaInicio) < new Date(prev.fechaInicio))
    ) {
      prev.fechaInicio = r.fechaInicio;
    }

    acc.set(k, prev);
  }

  return Array.from(acc.values());
}, [detailGroupId, detailsByGroupId, estadosSeleccionados]);
// Grupo actual y si es editable (solo cuando estadoLiquidado === "NO")
  const grupoActual = useMemo(
    () => groups.find((g) => g.id === detailGroupId) || null,
    [groups, detailGroupId]
  );

  const isGroupEditable =
    !grupoActual || grupoActual.estadoLiquidado === "NO";
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
  try {
    // 🔒 No permitir cambios si el grupo ya está liquidado o parcial
    if (grupoActual && grupoActual.estadoLiquidado !== "NO") {
      alert(
        "No puedes modificar pendientes de un grupo que ya está liquidado o parcial. " +
        "Primero anula la liquidación y vuelve a procesar."
      );
      return;
    }
    setSavingExclusions(true);

    const rows = detailsByGroupId[detailGroupId] || [];
    const grp = groups.find((g) => g.id === detailGroupId) || {};
    const items = [];

    for (const p of patientsInGroup) {
      const k = `${p.nro || ""}||${p.documento || ""}`;
      const marcado = !!exclState.get(k);

      const matchingRow =
        rows.find(
          (r) =>
            (r.nro || "") === (p.nro || "") &&
            (r.documento || "") === (p.documento || "")
        ) || {};

      const nroFinal = p.nro || matchingRow.nro || "";

      items.push({
        nro: nroFinal,
        documento: p.documento || matchingRow.documento || "",
        exclude: marcado,
        paciente: p.paciente || matchingRow.paciente || "",
        cliente: grp.cliente || matchingRow.cliente || "",
        unidadProduccion:
          grp.unidadProduccion || matchingRow.unidadProduccion || "",
        tipoEvaluacion:
          grp.tipoEvaluacion || matchingRow.tipoEvaluacion || "",
        sedeNombre: matchingRow.sedeNombre || grp.sedeNombre || "",
        importe: p.importe ?? matchingRow.precioCb ?? 0,
        createdBy: "admin",
        fechaInicio:
        p.fechaInicio ||
        matchingRow.fechaInicio ||
        matchingRow.FechaInicio ||
        null,
      });
    }

    await saveExclusions({
      from,
      to,
      condicionPago,
      items,
    });

    closeDetalle();
    await handleProcess();
  } catch (err) {
    console.error(err);
    alert("Error al guardar pendientes.");
  } finally {
    setSavingExclusions(false);
  }
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

    // Volver a procesar para que el backend marque esos grupos como LIQUIDADO
    await handleProcess();
  } catch (err) {
    console.error("Error al liquidar:", err);
    alert(err.message || "Error al registrar la liquidación.");
  } finally {
    setLiquidando(false);
  }
}
  async function exportarSeleccionados() {
  if (!selectedIds.size) return;
  const selectedIdsArr = Array.from(selectedIds);

  try {
    setExportando(true);
    const blob = await exportLiquidaciones({
      from,
      to,
      condicionPago,
      selectedIds: selectedIdsArr,
      estadosPrestacion: estadosSeleccionados,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "liquidaciones.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Error al exportar.");
  } finally {
    setExportando(false);
  }
}


  const fmtMoney = (n) =>
    Number(n || 0).toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toISOString().slice(0, 10); // YYYY-MM-DD
};
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
          <button
            type="submit"
            className={`btn-primary ${loading ? "btn-loading" : ""}`}
            disabled={loading}
          >
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
            {/* Filtro de Estado de la prestación (multi-check) */}
            <div className="estado-filter">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDropdownEstadosOpen((prev) => !prev)}
              >
                Estado de la prestación ▾
              </button>

              {dropdownEstadosOpen && (
                <div className="estado-dropdown">
                  {(filters.estadosPrestacion || []).map((est) => {
                    const checked = estadosSeleccionados.includes(est);

                    return (
                      <label key={est} className="estado-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const { checked } = e.target;
                            setEstadosSeleccionados((prev) => {
                              if (checked) {
                                // agregar
                                if (prev.includes(est)) return prev;
                                return [...prev, est];
                              } else {
                                // quitar
                                const next = prev.filter((x) => x !== est);
                                return next;
                              }
                            });
                          }}
                        />
                        {est}
                      </label>
                    );
                  })}
                  {/* Opción rápida para limpiar filtro */}
                  <button
                    type="button"
                    className="estado-clear-btn"
                    onClick={() => setEstadosSeleccionados([])}
                  >
                    Mostrar todos
                  </button>
                </div>
              )}
            </div>
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
                  <tr key={g.id}>
                  <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(g.id)}
                        onChange={() => toggleSelect(g.id)}
                      />
                    </td>
                    <td>{g.cliente || "-"}</td>
                    <td>{g.unidadProduccion || "-"}</td>
                    <td>{g.tipoEvaluacion || "-"}</td>
                    <td style={{ textAlign: "right" }}>
                    {fmtMoney(g.importeVisible ?? g.importe)}
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
              className={`btn-primary btn-sm ${exportando ? "btn-loading" : ""}`}
              disabled={!selectedIds.size || loading || exportando}
              onClick={exportarSeleccionados}
            >
              {exportando ? "Exportando..." : "Exportar"}
            </button>
            <button
              className={`btn-primary btn-sm ${liquidando ? "btn-loading" : ""}`}
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
  className={`btn-primary btn-sm ${savingExclusions ? "btn-loading" : ""}`}
  onClick={saveExclusionsClick}
  disabled={savingExclusions}
>
  {savingExclusions ? "Guardando..." : "Guardar"}
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
                    <th>Fecha inicio</th>
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
                      const esPendienteActual = p.isPendiente && !p.origenPendiente && !p.fromPendientePrevio;
                      const esPendiente = !!p.isPendiente;         // pendiente del periodo actual
                      const esArrastrado = !!p.origenPendiente;    // viene de periodo anterior

                      return (
                        <tr
                          key={`${k}||${idx}`}
                          style={
                            esArrastrado
                              ? { backgroundColor: "#FFF3CD" } // resaltado suave solo para arrastrados
                              : {}
                          }
                        >
                          {/* ✅ Fecha de inicio original por paciente */}
                          <td>{fmtDate(p.fechaInicio)}</td>
                          <td>{p.paciente || "-"}</td>
                          <td>{p.documento || "-"}</td>
                          <td style={{ textAlign: "right" }}>{fmtMoney(p.importe)}</td>

                          {/* Check "No liquidar":
                              - bloqueado solo si es pendiente del periodo actual
                              - para arrastrados viene habilitado para liquidar directamente */}
                          <td>

                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={esPendienteActual}
                              onChange={(e) =>
                                setExclude(p.nro, p.documento, e.target.checked)
                              }
                            />
                          </td>

                          {/* Botón Anular:
                              - solo aparece para pendientes del periodo actual
                              - para arrastrados mostramos "-" (no necesitan anularse) */}
                          <td>
                            {esPendiente ? (
                              <button
                                type="button"
                                className="btn-primary btn-sm"
                                onClick={() => handleAnularPendiente(p)}
                              >
                                Anular
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