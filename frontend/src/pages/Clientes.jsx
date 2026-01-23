import { useMemo, useState, useEffect,useRef } from "react";
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
  
  const [liquidando, setLiquidando] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [exportando, setExportando] = useState(false);
const [savingExclusions, setSavingExclusions] = useState(false);
const [estadosPrestacion, setEstadosPrestacion] = useState([]); // Array para los estados seleccionados
  const [dropdownOpen, setDropdownOpen] = useState(false);        // Booleano para abrir/cerrar el menú
  const [availableEstados, setAvailableEstados] = useState([]);   // Lista de opciones disponibles (ej: Liquidado, No Liq)

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
// --- Función auxiliar para reusar lógica de filtrado ---
  function cumpleFiltroEstado(row) {
    if (estadosPrestacion.length === 0) return true; // Si no hay filtro, pasa todo
    
    let st = (row.estadoPrestacion || "SIN ESTADO").trim().toUpperCase();
    if (st === "ATENDIDO/RESULT") st = "ATENDIDO/RESUL"; // Parche compatibilidad
    
    return estadosPrestacion.includes(st);
  }
  
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
// 1. Creamos una referencia para "marcar" el filtro en la pantalla
  const filterRef = useRef(null);

  // 2. Este useEffect detecta los clics en toda la pantalla
  useEffect(() => {
    function handleClickOutside(event) {
      // Si el filtro existe y el clic fue FUERA de él -> cerramos
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    // Activamos el "oído" del documento
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Limpiamos al salir
      document.removeEventListener("mousedown", handleClickOutside);
    };
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
  // === DETECTAR ESTADOS DISPONIBLES (Definitivo) ===
  useEffect(() => {
    // 1. Obtenemos todas las filas
    const allRows = Object.values(detailsByGroupId || {}).flat();

    if (allRows.length > 0) {
      // 2. Extraemos el 'estadoPrestacion' que ahora tu backend envía correctamente
      const uniqueEstados = [...new Set(allRows.map(r => 
        r.estadoPrestacion || "SIN ESTADO"
      ))].filter(x => x !== "SIN ESTADO").sort();

      setAvailableEstados(uniqueEstados);
    } else {
      setAvailableEstados([]);
    }
  }, [detailsByGroupId]);
const viewGroups = useMemo(() => {
    const result = [];

    for (const g of groups) {
      // 1. Filtros básicos
      if (fCliente !== "TODOS" && g.cliente !== fCliente) continue;
      if (fTipo !== "TODOS" && g.tipoEvaluacion !== fTipo) continue;

      const allRows = detailsByGroupId[g.id] || [];
      if (fSede !== "TODOS") {
        const okSede = allRows.some((r) => r.sedeNombre === fSede);
        if (!okSede) continue;
      }

      // 2. FILTRO POR ESTADO DE PRESTACIÓN
      let usedRows = allRows;

      if (estadosPrestacion.length > 0) {
        usedRows = allRows.filter((r) => {
          let st = (r.estadoPrestacion || "SIN ESTADO").trim().toUpperCase();
          if (st === "ATENDIDO/RESULT") st = "ATENDIDO/RESUL";
          return estadosPrestacion.includes(st);
        });
        if (usedRows.length === 0) continue;
      }

      // 3. RECALCULAR IMPORTES (Lógica Visual)
      let sumTotal = 0;
      let sumLiquidado = 0;
      let sumDisponible = 0;
      
      for (const r of usedRows) {
        const monto = Number(r.precioCb || 0);
        sumTotal += monto;
        
        if (r.estaLiquidado) {
            sumLiquidado += monto;
        } else if (!r.isPendiente) {
            // Si no es liquidado y NO es excluido (pendiente), es disponible
            sumDisponible += monto;
        }
        // Si r.isPendiente es true, no suma a disponible ni liquidado, se queda en el limbo (amarillo)
      }

      // 4. DECIDIR QUÉ MOSTRAR EN LA COLUMNA "IMPORTE"
      let importeVisible = 0;

      if (g.estadoLiquidado === "LIQUIDADO") {
          // Si está cerrado, mostramos el Total facturado
          importeVisible = sumLiquidado; // O sumTotal, según prefieras ver historial
      } else if (g.estadoLiquidado === "PARCIAL") {
          // CORRECCIÓN PUNTO 3: Si es parcial, mostramos LO QUE SE HA LIQUIDADO
          // (El usuario pidió: "deberia mostrar el importe liquidado")
          importeVisible = sumLiquidado; 
      } else {
          // Si NO está liquidado, mostramos lo DISPONIBLE para cobrar
          importeVisible = sumDisponible;
      }
      
      result.push({ ...g, importeVisible });
    }

    return result;
  }, [groups, detailsByGroupId, fCliente, fTipo, fSede, estadosPrestacion]);
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
      const resp = await fetchDetalleConPendientes({
        from, to,
        cliente: grp.cliente,
        unidad: grp.unidadProduccion,
        tipo: grp.tipoEvaluacion,
        sede: grp.sedeNombre || "",
      });

      if (!resp?.ok) return;

      const rowsNormales = resp.rowsNormales || [];
      const combined = [];
       const newExclState = new Map(exclState);

      rowsNormales.forEach((r) => {
        const nroVal = r.nro || r.Nro || "";
        const docVal = r.documento || r.Documento || "";
        
        const nro = nroVal.toString().trim();
        const doc = docVal.toString().trim();
        const key = `${nro}||${doc}`;

       if (r.isPendiente) {
            newExclState.set(key, true);
        }

        combined.push({
           nro,
            // CORRECCIÓN CRÍTICA: Mapeo de campos antiguos vs nuevos
            fechaInicio: r.fechaInicio || r["Fecha Inicio"], 
            cliente: grp.cliente,
            documento: doc,
            paciente: r.paciente || r["Paciente"] || "", // <-- Esto arregla que desaparezca el nombre
            
            // CORRECCIÓN DE IMPORTE:
            precioCb: Number(r.importe || r.Importe || r.precioCb || r.PrecioCB || 0),
            
            // Datos extra
            protocolo: r.protocolo || r.Protocolo || "",
            descripcionPrestacion: r.descripcionPrestacion || r["Descripción de la Prestación"] || "",
            condicionPago: r.condicionPago || r["Condición de Pago"] || "",
            estadoPrestacion: r.estadoPrestacion || "ATENDIDO",

            // Estados lógicos
            isPendiente: r.isPendiente || false,
            estaLiquidado: r.estaLiquidado || false,
            origenPendiente: r.origenPendiente || false,
            idPendiente: r.idPendiente || null
        });
      });

      setExclState(newExclState); // Actualizamos los checks visuales
      setDetailsByGroupId((prev) => ({ ...prev, [id]: combined }));

    } catch (err) {
      console.error("Error al abrir detalle:", err);
    }
  }

  function closeDetalle() {
    setDetailOpen(false);
    setDetailGroupId(null);
    // setExclState(new Map()); // <--- COMENTA O BORRA ESTA LÍNEA
  }

  const patientsInGroup = useMemo(() => {
    if (!detailGroupId) return [];

    const baseRows = detailsByGroupId[detailGroupId] || [];

    // 1. APLICAMOS EL MISMO FILTRO QUE EN LA TABLA PRINCIPAL
    // Solo procesamos las filas que cumplen con el estado seleccionado
    const rows = baseRows.filter(r => cumpleFiltroEstado(r));

    const acc = new Map();

    for (const r of rows) {
      const k = `${r.paciente || ""}||${r.documento || ""}||${r.nro || ""}`;

      const prev = acc.get(k) || {
        paciente: r.paciente,
        documento: r.documento,
        nro: r.nro,
        importe: 0,
        isPendiente: false,
        origenPendiente: false,
        fechaInicio: r.fechaInicio || null,
      };

      prev.importe += Number(r.precioCb || r.importe || 0);

      if (r.isPendiente) prev.isPendiente = true;
      if (r.origenPendiente || r.fromPendientePrevio) prev.origenPendiente = true;

      if (r.fechaInicio && (!prev.fechaInicio || new Date(r.fechaInicio) < new Date(prev.fechaInicio))) {
        prev.fechaInicio = r.fechaInicio;
      }

      acc.set(k, prev);
    }

    return Array.from(acc.values());
  }, [detailGroupId, detailsByGroupId, estadosPrestacion]); // <--- Dependencia clave

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
    // 1. Validación de seguridad: No tocar si ya está liquidado
    if (grupoActual && grupoActual.estadoLiquidado !== "NO") {
       alert("No se puede modificar un grupo ya liquidado.");
       return;
    }

    let nro = p.nro;
    let documento = p.documento;
    const importe = Number(p.importe || 0);

    // Búsqueda de respaldo si faltan datos (tu lógica original)
    if (!nro || !documento) {
      const rows = detailsByGroupId[detailGroupId] || [];
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

    if (!nro || !documento) return alert("Faltan datos para anular.");

    try {
      // 2. Llamada al Backend (Solo acción, sin recarga masiva)
      await anularPendiente({ nro, documento });

      // 3. ACTUALIZACIÓN INSTANTÁNEA (Sin esperar al servidor)
      const key = `${nro}||${documento}`;

      // A) Quitar el Check visualmente
      setExclState((prev) => {
        const m = new Map(prev);
        m.set(key, false); // false = Habilitado para liquidar
        return m;
      });

      // B) Actualizar la lista interna para que desaparezca el botón "Anular"
      // Al poner isPendiente: false, el botón deja de renderizarse
      setDetailsByGroupId((prev) => {
        const newDetails = { ...prev };
        if (newDetails[detailGroupId]) {
          newDetails[detailGroupId] = newDetails[detailGroupId].map((r) => {
            const rKey = `${r.nro || ""}||${r.documento || ""}`;
            if (rKey === key) {
               return { ...r, isPendiente: false, origenPendiente: false }; 
            }
            return r;
          });
        }
        return newDetails;
      });

      // C) Sumar el importe al total del grupo en la pantalla de atrás
      setGroups((prevGroups) => 
        prevGroups.map((g) => {
          if (g.id === detailGroupId) {
             const nuevoDisponible = (g.importeDisponible || 0) + importe;
             return {
               ...g,
               importeDisponible: nuevoDisponible,
               importe: nuevoDisponible, // Actualiza el número que ves en la tabla principal
             };
          }
          return g;
        })
      );

      // (Opcional) Feedback rápido
      // alert("Paciente habilitado."); 

    } catch (err) {
      console.error("Error al anular pendiente:", err);
      alert("Error al intentar habilitar el paciente.");
    }
  }
  // ----------------------------------------------------------------------
// 1. REEMPLAZA ESTA FUNCIÓN: saveExclusionsClick
// ----------------------------------------------------------------------
async function saveExclusionsClick() {
  try {
    if (grupoActual && grupoActual.estadoLiquidado !== "NO") {
      alert("No puedes modificar pendientes de un grupo liquidado/parcial. Anula primero.");
      return;
    }
    setSavingExclusions(true);

    const rows = detailsByGroupId[detailGroupId] || [];
    const grp = groups.find((g) => g.id === detailGroupId) || {};
    const itemsToSend = [];

    // Recopilamos datos para el backend
    for (const p of patientsInGroup) {
      const k = `${p.nro || ""}||${p.documento || ""}`;
      const marcado = !!exclState.get(k);

      // Buscamos datos completos en 'rows'
      const matchingRow = rows.find(
          (r) => (r.nro || "") === (p.nro || "") && (r.documento || "") === (p.documento || "")
      ) || {};

      itemsToSend.push({
        nro: p.nro || matchingRow.nro || "",
        documento: p.documento || matchingRow.documento || "",
        exclude: marcado,
        paciente: p.paciente || matchingRow.paciente || "",
        cliente: grp.cliente || matchingRow.cliente || "",
        unidadProduccion: grp.unidadProduccion || matchingRow.unidadProduccion || "",
        tipoEvaluacion: grp.tipoEvaluacion || matchingRow.tipoEvaluacion || "",
        sedeNombre: matchingRow.sedeNombre || grp.sedeNombre || "",
        importe: p.importe ?? matchingRow.precioCb ?? 0,
        createdBy: "admin",
        fechaInicio: p.fechaInicio || matchingRow.fechaInicio || null,
      });
    }

    // 1. Guardar en BD (backend optimizado)
    await saveExclusions({ from, to, condicionPago, items: itemsToSend });

    // 2. ACTUALIZACIÓN OPTIMISTA (Sin recargar toda la búsqueda)
    // Actualizamos el detalle interno del grupo
    setDetailsByGroupId((prev) => {
      const newDetails = { ...prev };
      if (newDetails[detailGroupId]) {
        newDetails[detailGroupId] = newDetails[detailGroupId].map((r) => {
          const k = `${r.nro || ""}||${r.documento || ""}`;
          // Si está en el mapa de exclusiones, actualizamos su flag 'isPendiente'
          if (exclState.has(k)) {
            const isExcluded = exclState.get(k);
            return { ...r, isPendiente: isExcluded };
          }
          return r;
        });
      }
      return newDetails;
    });

    // Actualizamos los totales del GRUPO en la tabla principal
    setGroups((prevGroups) => 
      prevGroups.map((g) => {
        if (g.id === detailGroupId) {
          // Recalcular importes manualmente
          let nuevoImporteDisponible = 0;
          let nuevoImportePendiente = 0;
          let tienePendientes = false;

          // Usamos 'itemsToSend' que tiene el estado final
          itemsToSend.forEach(item => {
             const monto = Number(item.importe || 0);
             if (item.exclude) {
               nuevoImportePendiente += monto;
               tienePendientes = true;
             } else {
               nuevoImporteDisponible += monto;
             }
          });
          
          // Mantenemos el liquidado si hubiera (aunque aquí suele ser 0 si es editable)
          return {
            ...g,
            importeDisponible: nuevoImporteDisponible,
            importePendiente: nuevoImportePendiente,
            importe: nuevoImporteDisponible, // Actualizamos lo que ve el usuario
            tienePendientes: tienePendientes
          };
        }
        return g;
      })
    );

    closeDetalle();
    // 🚫 YA NO LLAMAMOS A handleProcess() PARA QUE SEA RÁPIDO
  } catch (err) {
    console.error(err);
    alert("Error al guardar pendientes.");
  } finally {
    setSavingExclusions(false);
  }
}

// ----------------------------------------------------------------------
// 2. REEMPLAZA ESTA FUNCIÓN: liquidarSeleccionados
// ----------------------------------------------------------------------
async function liquidarSeleccionados() {
  setMensajeLiq("");

  if (!from || !to) return alert("Indica fechas.");
  if (!selectedIds.size) return alert("Selecciona grupos.");

  const groupsMap = new Map(groups.map((g) => [g.id, g]));
  const idsArr = Array.from(selectedIds);
  const idsNoLiquidados = idsArr.filter((id) => {
    const g = groupsMap.get(id);
    return g && g.estadoLiquidado !== "LIQUIDADO";
  });

  if (!idsNoLiquidados.length) return alert("Grupos ya liquidados.");

  if (!window.confirm(`¿Liquidar ${idsNoLiquidados.length} grupo(s)?`)) return;

  const rowsToSend = [];
  // Mapa para saber si un grupo quedó PARCIAL
  const statusPorGrupo = new Map(); // groupId -> "LIQUIDADO" | "PARCIAL"

  for (const groupId of idsNoLiquidados) {
    const groupData = groupsMap.get(groupId);
    const rows = detailsByGroupId[groupId] || [];
    
    let huboExcluidos = false;
    // Si el grupo ya tenía pendientes previos que no se tocaron
    if (groupData.tienePendientes) huboExcluidos = true; 

    for (const r of rows) {
      const k = `${r.nro || ""}||${r.documento || ""}`;
      const estaExcluido = !!exclState.get(k) || (r.isPendiente && !exclState.has(k));

      if (!estaExcluido && !r.estaLiquidado) {
        rowsToSend.push({
          nro: r.nro,
          documento: r.documento,
          paciente: r.paciente,
          cliente: groupData.cliente,
          unidadProduccion: groupData.unidadProduccion,
          tipoEvaluacion: groupData.tipoEvaluacion,
          sedeNombre: groupData.sedeNombre,
          protocolo: r.protocolo || "",
          fechaInicio: r.fechaInicio,
          descripcionPrestacion: r.descripcionPrestacion || "",
          importe: Number(r.precioCb || r.importe || 0),
          condicionPago: r.condicionPago,
          rucCliente: r.rucCliente,
          razonSocial: r.razonSocial || groupData.cliente,
          evaluador: r.evaluador,
          
          // OBLIGATORIO: El ID para que el Backend sepa a quién marcar
          idPendiente: r.idPendiente || null
        });
      } else if (estaExcluido) {
        huboExcluidos = true;
      }
    }
    
    statusPorGrupo.set(groupId, huboExcluidos ? "PARCIAL" : "LIQUIDADO");
  }

  if (rowsToSend.length === 0) return alert("No hay pacientes para liquidar.");

  // === AQUÍ ESTÁ EL CAMBIO CLAVE ===
  // Preparamos la metadata para decirle al Backend: "Oye, este grupo guárdalo como PARCIAL"
  const groupsMetadata = [];
  for (const groupId of idsNoLiquidados) {
      const estado = statusPorGrupo.get(groupId);
      const g = groupsMap.get(groupId);
      if (g) {
          groupsMetadata.push({
              cliente: g.cliente,
              unidad: g.unidadProduccion,
              tipo: g.tipoEvaluacion,
              sede: g.sedeNombre,
              estado: estado // <-- Aquí va la decisión ("PARCIAL" o "LIQUIDADO")
          });
      }
  }

  try {
    setLiquidando(true);
    const resp = await liquidarClientes({
      from, to, condicionPago,
      selectedIds: idsNoLiquidados,
      rows: rowsToSend,
      groupsMetadata: groupsMetadata // <-- IMPORTANTE: Enviamos esto al backend
    });

    if (!resp?.ok) return alert(resp?.message || "Error.");

    setMensajeLiq(`✅ Liquidación exitosa. Código: ${resp.codigo}`);

    // ACTUALIZACIÓN VISUAL INMEDIATA
    setGroups((prev) => 
      prev.map((g) => {
        if (idsNoLiquidados.includes(g.id)) {
          const nuevoEstado = statusPorGrupo.get(g.id) || "LIQUIDADO";
          return {
            ...g,
            estadoLiquidado: nuevoEstado, 
            codigo: resp.codigo,
            tieneLiquidados: true,
            // Visualmente sumamos lo disponible al liquidado para que se vea lleno
            importeLiquidado: (g.importeLiquidado || 0) + (g.importeDisponible || 0),
            importeDisponible: 0
          };
        }
        return g;
      })
    );
    
    // Marcar filas como liquidadas internamente (para que no se puedan volver a enviar)
    setDetailsByGroupId((prev) => {
        const next = { ...prev };
        idsNoLiquidados.forEach(gid => {
            if(next[gid]) {
                next[gid] = next[gid].map(r => {
                    const k = `${r.nro}||${r.documento}`;
                    const excl = !!exclState.get(k) || (r.isPendiente && !exclState.has(k));
                    if(!excl && !r.estaLiquidado) return { ...r, estaLiquidado: true };
                    return r;
                })
            }
        });
        return next;
    });

    setSelectedIds(new Set());
    setSelectAll(false);
  } catch (err) {
    console.error(err);
    alert("Error al liquidar: " + err.message);
  } finally {
    setLiquidando(false);
  }
}
  // En Clientes.jsx

  async function exportarSeleccionados() {
    if (!selectedIds.size) return alert("Selecciona al menos un grupo.");
    
    const rowsToExport = []; // Enviaremos filas completas, no solo IDs
    const idsArr = Array.from(selectedIds);
    let warningSinDetalle = false;

    for (const groupId of idsArr) {
      const rows = detailsByGroupId[groupId];
      
      // Validación: Si el usuario no abrió el detalle, no tenemos datos para exportar
      if (!rows) {
        warningSinDetalle = true;
        continue; 
      }

      // Datos del grupo para rellenar vacíos si hiciera falta
      const grp = groups.find(g => g.id === groupId);

      for (const r of rows) {
        // 1. FILTRO VISUAL: Respetar el filtro de "Estado Prestación" (Combo)
        if (typeof cumpleFiltroEstado === 'function') {
             if (!cumpleFiltroEstado(r)) continue; 
        } else {
             // Fallback si no tienes la función auxiliar
             if (estadosPrestacion.length > 0) {
                let st = (r.estadoPrestacion || "SIN ESTADO").trim().toUpperCase();
                if (st === "ATENDIDO/RESULT") st = "ATENDIDO/RESUL";
                if (!estadosPrestacion.includes(st)) continue;
             }
        }

        // 2. EXCLUSIÓN MANUAL: Respetar los checks del modal
        const k = `${r.nro || ""}||${r.documento || ""}`;
        const estaExcluidoManual = !!exclState.get(k); 
        const esPendienteNativo = r.isPendiente && !exclState.has(k);
        
        // Si NO está excluido, lo exportamos
        if (!estaExcluidoManual && !esPendienteNativo) {
           // Agregamos la fila formateada para el Excel
           rowsToExport.push({
             ...r,
             // Aseguramos que lleve los datos del grupo (Cliente, Sede) para la agrupación correcta
             cliente: grp.cliente,
             sedeNombre: grp.sedeNombre,
             unidadProduccion: grp.unidadProduccion,
             tipoEvaluacion: grp.tipoEvaluacion,
             // Aseguramos formato numérico
             importe: Number(r.precioCb || r.importe || 0)
           });
        }
      }
    }

    if (warningSinDetalle && rowsToExport.length === 0) {
      alert("Para exportar, primero debes cargar los detalles (abrir 'Ver') de los grupos seleccionados.");
      return;
    }

    if (rowsToExport.length === 0) {
      alert("No hay registros válidos para exportar con los filtros actuales.");
      return;
    }

    try {
      setExportando(true);
      
      // CAMBIO: Llamamos a exportLiquidaciones pasando 'rows' en lugar de 'nros'
      // Asegúrate de que tu api.js soporte esto (ver abajo)
      const blob = await exportLiquidaciones({
        from, 
        to,
        condicionPago,
        rows: rowsToExport, // <--- Enviamos la data procesada
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Liquidacion_${from}_${to}.xlsx`;
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
      {/* TARJETA DE BÚSQUEDA RENOVADA */}
      <div className="filters-card">
        <div className="filters-header">
          <span>🔍</span> Panel de Control
        </div>

        <form className="filters-row" onSubmit={handleProcess}>
          
          {/* Campo Desde */}
          <div className="filter-group">
            <label className="filter-label">Desde</label>
            <input
              className="filter-input"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>

          {/* Campo Hasta */}
          <div className="filter-group">
            <label className="filter-label">Hasta</label>
            <input
              className="filter-input"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          {/* Campo Condición */}
          <div className="filter-group">
            <label className="filter-label">Condición</label>
            <select
              className="filter-input"
              value={condicionPago}
              onChange={(e) => setCondicionPago(e.target.value)}
              style={{ minWidth: "180px" }} // Un poco más ancho para el texto
            >
              <option value="TODAS">Todas</option>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>

          {/* Botón Buscar (Alineado a la derecha del grupo o seguido) */}
          <button
            type="submit"
            className="btn-search"
            disabled={loading}
          >
            {loading ? (
              "Loading..."
            ) : (
              <>
                <svg className="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                Buscar
              </>
            )}
          </button>

        </form>

        {/* Mensaje de Error (si existe) */}
        {error && (
          <div style={{ marginTop: 12, color: "#EF4444", fontSize: "0.85rem", display: 'flex', alignItems: 'center', gap: 6 }}>
             ⚠️ {error}
          </div>
        )}
      </div>

      {/* Resumen con filtros UI */}
      <div className="section-card">
        <div>
            <h3 className="section-title">Resumen de liquidación</h3>
        </div><br />
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
           
           {/* FILTRO ESTADO PRESTACIÓN (DISEÑO HONORARIOS) */}
            <div 
              className="estado-filter" 
              style={{ position: 'relative', minWidth: '200px' }}
              ref={filterRef} // Referencia para cerrar al hacer clic fuera
            >
                <div 
                  className="form-select" 
                  style={{
                    cursor: 'pointer', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    color: '#333',
                    height: '42px', // Altura forzada para alinear con otros selects
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    padding: '0 12px'
                  }}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px' }}>
                    {estadosPrestacion.length > 0 
                      ? `${estadosPrestacion.length} seleccionados` 
                      : "Estado Prestación"}
                  </span>
                  <span style={{ fontSize: '10px', opacity: 0.6 }}>▼</span>
                </div>

                {dropdownOpen && (
                   <div className="estado-dropdown" style={{
                     position: 'absolute', top: '100%', left: 0, right: 0,
                     background: 'white', border: '1px solid #ccc', 
                     padding: '10px', zIndex: 100, boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                     maxHeight: '300px', overflowY: 'auto', borderRadius: '0 0 6px 6px',
                     marginTop: '4px'
                   }}>
                     {/* LAS 4 OPCIONES FIJAS */}
                     {["ATENDIDO", "ATENDIDO/RESUL", "GENERADO", "PENDIENTE"].map(est => (
                       <label key={est} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer' }}>
                         <input 
                           type="checkbox" 
                           checked={estadosPrestacion.includes(est)}
                           onChange={(e) => {
                             // Importante: stopPropagation para no cerrar el menú al hacer click
                             // (aunque el ref y el onClick del padre lo manejan, es buena práctica)
                             if(e.target.checked) setEstadosPrestacion(prev => [...prev, est]);
                             else setEstadosPrestacion(prev => prev.filter(x => x !== est));
                           }}
                           style={{ accentColor: '#2563EB', width:'16px', height:'16px' }}
                         /> 
                         <span style={{ fontSize: '13px', color: '#333' }}>{est}</span>
                       </label>
                     ))}
                   </div>
                )}
            </div>
          </div> 
        </div>

        <div className="table-wrapper">
          <table className="simple-table">
            <thead>
              <tr>
                {/* Checkbox (Fijo pequeño) */}
                <th style={{ width: '30px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} />
                </th>
                
                {/* Cliente: AUTO (Toma todo el espacio libre disponible) */}
                <th style={{ width: 'auto' }}>Cliente</th>
                
                {/* Resto de columnas con % para mantener estructura */}
                <th style={{ width: '15%' }}>Unidad</th>
                <th style={{ width: '15%' }}>Tipo</th>
                <th style={{ width: '10%', textAlign: "right" }}>Importe</th>
                <th style={{ width: '8%', textAlign: "center" }}>Estado</th>
                <th style={{ width: '10%', textAlign: "center" }}>Código</th>
                
                {/* Ver: Ancho FIJO y pequeño (40px) para que no se vaya a la derecha */}
                <th style={{ textAlign: "center" }}>Ver</th>
              </tr>
            </thead>
            <tbody>
              {viewGroups.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan={8} style={{textAlign:'center', padding:20, color:'#999'}}>
                    Sin resultados.
                  </td>
                </tr>
              ) : (
                viewGroups.map((g) => (
                  <tr key={g.id}>
                    
                    {/* Checkbox */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(g.id)}
                            onChange={() => toggleSelect(g.id)}
                            style={{ cursor: 'pointer' }}
                          />
                          {(g.estadoLiquidado === "LIQUIDADO" || g.estadoLiquidado === "PARCIAL") && (
                              <span style={{ color: '#166534', fontSize: '12px', fontWeight:'bold' }}>✓</span>
                          )}
                      </div>
                    </td>

                    {/* CLIENTE */}
                    <td>
                      <span className="text-truncate col-w-cliente" title={g.cliente} style={{ color: '#1E293B', fontWeight: 500 }}>
                        {g.cliente || "-"}
                      </span>
                    </td>

                    {/* UNIDAD */}
                    <td>
                       <span className="text-truncate col-w-unidad" style={{ color: '#475569' }} title={g.unidadProduccion}>
                         {g.unidadProduccion || "-"}
                       </span>
                    </td>

                    {/* TIPO (Aquí cerramos el hueco) */}
                    <td>
                        <span className="text-truncate col-w-tipo" style={{ color: '#475569' }} title={g.tipoEvaluacion}>
                            {g.tipoEvaluacion || "-"}
                        </span>
                    </td>
                    
                    {/* IMPORTE */}
                    <td style={{ textAlign: "right", fontFamily:'monospace', fontWeight: 600, fontSize:'0.85rem' }}>
                      {fmtMoney(g.importeVisible ?? g.importe)}
                    </td>
                    
                    {/* ESTADO */}
                    <td style={{textAlign: 'center'}}>
                      {g.estadoLiquidado === "LIQUIDADO" && <span style={{background:'#F0FDF4', color:'#166534', padding:'1px 6px', borderRadius:4, fontSize:10, border:'1px solid #DCFCE7'}}>LIQ</span>}
                      {g.estadoLiquidado === "PARCIAL" && <span style={{background:'#FFFBEB', color:'#92400E', padding:'1px 6px', borderRadius:4, fontSize:10, border:'1px solid #FEF3C7'}}>PAR</span>}
                      {g.estadoLiquidado === "NO" && <span style={{background:'#FEF2F2', color:'#991B1B', padding:'1px 6px', borderRadius:4, fontSize:10, border:'1px solid #FEE2E2'}}>PEN</span>}
                    </td>
                    
                    {/* CÓDIGO */}
                    <td style={{ textAlign: "center", fontSize: 10, color:'#94A3B8' }}>
                        {g.codigo || "-"}
                    </td>
                    
                    {/* ACCIÓN */}
                    <td className="col-action">
                      <button
                        className="btn-icon-action"
                        onClick={() => openDetalle(g.id)}
                        title="Ver Detalle"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pie: totales + exportar + liquidar */}
        {/* FOOTER DE ACCIONES MODERNO */}
        <div className="table-footer">
          
          {/* IZQUIERDA: Totales Organizados Verticalmente */}
          <div className="footer-totals">
            
            <div className="total-item">
              <span className="total-label">Seleccionados</span>
              <span className="total-value">{selectedIds.size}</span>
            </div>

            <div className="total-item">
              <span className="total-label">Subtotal</span>
              <span className="total-value">{fmtMoney(subtotal)}</span>
            </div>

            <div className="total-item">
              <span className="total-label">IGV (18%)</span>
              <span className="total-value">{fmtMoney(subtotal * 0.18)}</span>
            </div>

            {/* Total Destacado en Azul y Grande */}
            <div className="total-item highlight">
              <span className="total-label">Total Neto</span>
              <span className="total-value">{fmtMoney(subtotal * 1.18)}</span>
            </div>
            
          </div>

          {/* DERECHA: Botones con Iconos */}
          <div className="footer-actions">
            
            <button
              className="btn-export"
              onClick={exportarSeleccionados}
              disabled={!selectedIds.size || loading || exportando}
            >
              {/* Icono Descarga */}
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              {exportando ? "Exportando..." : "Exportar"}
            </button>

            <button
              className="btn-liquidar"
              onClick={liquidarSeleccionados}
              disabled={liquidando || !selectedIds.size}
            >
              {/* Icono Check */}
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              {liquidando ? "Procesando..." : `Liquidar (${selectedIds.size})`}
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