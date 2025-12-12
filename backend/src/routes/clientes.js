// backend/src/routes/clientes.js
import { Router } from "express";
import { getPoolCbmedic, getPool, sql } from "../util/db.js";
import ExcelJS from "exceljs";
import crypto from "crypto"
const router = Router();

/**
 * Helper: mapea el sufijo del Nro (_3, _8, _10, _11) a nombre de sede.
 */
function mapTipoEvaluacion(raw) {
  if (!raw) return "PRE OCUPACIONAL"; // valor por defecto

  // Pasamos a mayúsculas y quitamos tildes
  const t = raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // 1) PERIODICO
  if (t.includes("PERIOD")) {
    // EJ: "EVALUACION MEDICA PERIODICA"
    return "PERIODICO";
  }

  // 2) POST OCUPACIONAL
  if (t.includes("POST") || t.includes("RETIRO")) {
    // EJ: "EVAL. MEDICA POST OCUPACIONAL", "EVALUACION RETIRO"
    return "POST OCUPACIONAL";
  }

  // 3) PRE OCUPACIONAL
  if (t.includes("OCUPAC") || t.includes("INGRESO") || t.includes("PRE")) {
    // EJ: "EVALUACION MEDICA OCUPACIONAL", "EVAL. INGRESO"
    return "PRE OCUPACIONAL";
  }

  // Si no entra en nada, igual lo mandamos a uno de los 3 (por defecto)
  return "PRE OCUPACIONAL";
}
function mapSedeFromNro(nroRaw) {
  if (!nroRaw) return { sedeCodigo: null, sedeNombre: null };

  const parts = String(nroRaw).split("_");
  const sedeCodigo = parts.length > 1 ? parts[1] : null;

  let sedeNombre = null;
  switch (sedeCodigo) {
    case "3":
      sedeNombre = "EMO - MEGA PLAZA";
      break;
    case "8":
      sedeNombre = "IN HOUSE OCUPACIONAL";
      break;
    case "10":
      sedeNombre = "EMO - GUARDIA";
      break;
    case "11":
      sedeNombre = "INTEGRAMEDICA (MEGA PLAZA)";
      break;
    default:
      // otras sedes no se usan en filtros / resumen
      sedeNombre = null;
  }

  return { sedeCodigo, sedeNombre };
}

/**
 * GET /api/clientes/process
 * Query:
 *   from=YYYY-MM-DD
 *   to=YYYY-MM-DD
 *   condicionPago=CONTADO|CREDITO|TODAS (opcional)
 *
 * Devuelve:
 *  - groups: resumen por cliente+unidad+tipo+sede
 *  - detailsByGroupId: detalle fila a fila
 *  - filters: listas para combos de cliente/tipo/sede
 */
router.get("/process", async (req, res) => {
  try {
    const { from, to, condicionPago } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        ok: false,
        message: "Debe indicar fecha desde (from) y hasta (to).",
      });
    }

    const poolCb = await getPoolCbmedic();
    const poolFact = await getPool(); // FacturacionCBMedic

    // =======================
    // 1) EJECUTAR SP PRINCIPAL (cbmedic)
    // =======================
    const result = await poolCb
      .request()
      .input("FechaDesde", sql.Date, from)
      .input("FechaHasta", sql.Date, to)
      .input("CondicionPago", sql.VarChar(20), condicionPago || "TODAS")
      .query(`
        EXEC dbo.pa_liq_clientes_rango_export
          @FechaDesde,
          @FechaHasta,
          @CondicionPago
      `);

    const rows = result.recordset || [];

    // 2) LEER PENDIENTES (NO LIQUIDAR) DE ESTE PERIODO y también arrastrados
const pendResult = await poolFact
  .request()
  .input("DesdeActual", sql.Date, from)
  .input("HastaActual", sql.Date, to)
  .query(`
    SELECT 
      Nro,
      Documento,
      Paciente,
      Cliente,
      UnidadProduccion,
      TipoEvaluacion,
      Sede,
      FechaInicio,
      Importe,
      CondicionPago,
      Desde,
      Hasta,
      Estado
    FROM dbo.LiquidacionClientesPendientes
  WHERE Estado IN ('PENDIENTE', 'REACTIVADO')
      AND (
           (Desde = @DesdeActual AND Hasta = @HastaActual) -- mismo período
        OR (Hasta < @DesdeActual)                          -- períodos anteriores completamente
      )
  `);

const pendRows = pendResult.recordset || [];

// 🔒 SOLO se consideran "NO liquidar" los PENDIENTE del PERIODO ACTUAL
const pendientesSet = new Set(
  pendRows
    .filter((p) => {
      const estado = (p.Estado || "").toUpperCase();
      if (estado !== "PENDIENTE") return false;

      // comparamos fechas del registro con el rango actual
      if (!p.Desde || !p.Hasta) return false;

      const desdeStr = new Date(p.Desde).toISOString().slice(0, 10);
      const hastaStr = new Date(p.Hasta).toISOString().slice(0, 10);

      return desdeStr === from && hastaStr === to;
    })
    .map((p) => {
      const nro = (p.Nro || "").trim();
      const doc = (p.Documento || "").trim();
      return `${nro}||${doc}`;
    })
);

// lista completa de pendientes (PENDIENTE + REACTIVADO) — por si luego quieres usarlos
const pendientesExtra = pendRows;
    // ======================================
    // 3) EPISODIOS YA LIQUIDADOS (todas las liquidaciones VIGENTES)
    // ======================================
    const episodiosLiquidados = await poolFact.request().query(`
      SELECT d.Nro, d.Documento
      FROM dbo.LiquidacionClientesDet d
      INNER JOIN dbo.LiquidacionClientesCab c
        ON d.IdLiquidacion = c.IdLiquidacion
      WHERE c.Estado IS NULL OR c.Estado = 'VIGENTE'
    `);

    const liquidadosSet = new Set(
      (episodiosLiquidados.recordset || []).map((r) => {
        const nro = (r.Nro || "").trim();
        const doc = (r.Documento || "").trim();
        return `${nro}||${doc}`;
      })
    );
  
    // ======================================
    // 4) CÓDIGOS DE LIQUIDACIÓN POR GRUPO (para mostrar LQ-xxxxx)
    // ======================================
    const codigosPorGrupo = new Map();
    const codigosResult = await poolFact
    .request()
    .input("Desde", sql.Date, from)
    .input("Hasta", sql.Date, to)
    .query(`
      SELECT 
        c.Codigo,
        d.Cliente,
        d.UnidadProduccion,
        d.TipoEvaluacion,
        d.Sede
      FROM dbo.LiquidacionClientesDet d
      INNER JOIN dbo.LiquidacionClientesCab c
        ON d.IdLiquidacion = c.IdLiquidacion
      WHERE (c.Estado IS NULL OR c.Estado = 'VIGENTE')
        AND c.Desde = @Desde
        AND c.Hasta = @Hasta
    `);

    (codigosResult.recordset || []).forEach((r) => {
      const tipoNorm = mapTipoEvaluacion(r.TipoEvaluacion || "");
      const key =
        (r.Cliente || "").trim().toUpperCase() +
        "||" +
        (r.UnidadProduccion || "").trim().toUpperCase() +
        "||" +
        (tipoNorm || "").trim().toUpperCase() +
        "||" +
        (r.Sede || "").trim().toUpperCase();

      if (!codigosPorGrupo.has(key)) {
        codigosPorGrupo.set(key, r.Codigo);
      }
    });

    // =======================
    // 5) FILTRO CONDICIÓN PAGO (por seguridad)
    // =======================
    let filtered = rows;
    if (condicionPago && condicionPago !== "TODAS") {
      const condUp = condicionPago.toString().trim().toUpperCase();
      filtered = rows.filter((r) => {
        const val = (
          r["Condición de Pago"] ||
          r["Condicion de Pago"] ||
          ""
        )
          .toString()
          .trim()
          .toUpperCase();
        return val === condUp;
      });
    }

    if (!filtered.length) {
      return res.json({
        ok: true,
        groups: [],
        detailsByGroupId: {},
        filters: {
          clientes: [],
          tipos: [],
          sedes: [],
        },
      });
    }
  
   // ===========================
// 6) NORMALIZAR DETALLES
// ===========================
const details = [];

// 6.a) Primero procesamos las filas del SP
for (const r of filtered) {
  const { sedeCodigo, sedeNombre } = r["Sede"]
    ? { sedeCodigo: null, sedeNombre: r["Sede"] }
    : mapSedeFromNro(r.Nro);

  const nro = (r.Nro || "").trim();
  const doc = (r["Documento"] || r["N° Documento"] || "").trim();
  const key = `${nro}||${doc}`;

  const cliente = r["Cliente"] || r["RAZÓN SOCIAL"] || "";
  const unidadProduccion = r["Unidad de Producción"] || "";
  const tipoEvalNorm = mapTipoEvaluacion(
    r["Tipo de Evaluación"] || r["Tipo de Examen"] || ""
  );
  const precioCb = Number(r["Importe"] || r["Precio CB"] || 0);

  // flags de estado
  const isPendiente = pendientesSet.has(key);
  const estaLiquidado = liquidadosSet.has(key);

  details.push({
    nro,
    fechaInicio: r["Fecha Inicio"] || null,

    cliente,
    rucCliente: r["RUC DEL CLIENTE"] || null,
    unidadProduccion,
    tipoEvaluacion: tipoEvalNorm,

    condicionPago: r["Condición de Pago"] || r["Condicion de Pago"] || "",

    tipoDocumento: r["Tipo de Documento"] || "",
    documento: doc,
    paciente: r["Paciente"] || "",
    evaluador: r["Evaluador"] || "",

    precioCb,
    estadoPrestacion: r["Estado de la Prestación"] || "",

    sedeCodigo,
    sedeNombre,

    isPendiente,
    estaLiquidado,
    origenPendiente: false,
  });
}  // ← AQUÍ CIERRA EL PRIMER FOR

// 6.b) Añadir también las filas PENDIENTES (de cualquier periodo)
for (const p of pendientesExtra) {
  const nro = (p.Nro || "").trim();
  const doc = (p.Documento || "").trim();
  const key = `${nro}||${doc}`;

  // Si ya vino en el detalle normal del SP, no lo duplicamos
  const yaExiste = details.some(
    (d) => `${d.nro || ""}||${d.documento || ""}` === key
  );
  if (yaExiste) continue;

  // Si se está filtrando por condición de pago, respetarlo también aquí
  if (condicionPago && condicionPago !== "TODAS") {
    const condPend = (p.CondicionPago || "").toString().trim().toUpperCase();
    const condFiltro = condicionPago.toString().trim().toUpperCase();
    if (condPend !== condFiltro) continue;
  }

  const sedeNombre = p.Sede || "";
  const sedeCodigo = null;

  const cliente = p.Cliente || "";
  const unidadProduccion = p.UnidadProduccion || "";
  const tipoEvalNorm = mapTipoEvaluacion(p.TipoEvaluacion || "");
  const importeNum = Number(p.Importe ?? 0);
  const estadoPend = (p.Estado || "").toUpperCase();

  // 🔍 Determinar si es del MISMO periodo o arrastrado
  let esMismoPeriodo = false;
  if (p.Desde && p.Hasta) {
    const desdeStr = new Date(p.Desde).toISOString().slice(0, 10);
    const hastaStr = new Date(p.Hasta).toISOString().slice(0, 10);
    esMismoPeriodo = desdeStr === from && hastaStr === to;
  }

  // 👉 Regla:
  // - Si es MISMO periodo y Estado = PENDIENTE → sigue siendo "no liquidar" en este rango
  // - Si es de periodos anteriores (arrastrado) → se considera disponible para liquidar,
  //   pero marcamos origenPendiente = true para poder resaltarlo.
  const esPendienteMismoPeriodo =
    esMismoPeriodo && estadoPend === "PENDIENTE";

  const esArrastradoPendiente =
    !esMismoPeriodo && (estadoPend === "PENDIENTE" || estadoPend === "REACTIVADO");

  // 👉 Fallback de fecha: primero FechaInicio, luego Desde, luego Hasta
  const fechaInicioPend = p.FechaInicio || p.Desde || p.Hasta || null;

  details.push({
    nro,
    fechaInicio: fechaInicioPend,

    cliente,
    rucCliente: null,
    unidadProduccion,
    tipoEvaluacion: tipoEvalNorm,

    condicionPago: p.CondicionPago || "",

    tipoDocumento: "",
    documento: doc,
    paciente: p.Paciente || "",
    evaluador: "",

    precioCb: importeNum,
    estadoPrestacion: "PENDIENTE",

    sedeCodigo,
    sedeNombre,

    // 🔔 Sólo se bloquea en el MISMO periodo
    isPendiente: esPendienteMismoPeriodo,
    estaLiquidado: false,

    // 🔔 Si viene de periodos anteriores lo marcamos como "origenPendiente"
    //     pero se puede liquidar directamente
    origenPendiente: esArrastradoPendiente,
  });
}
  // ===========================
// 7) AGRUPAR RESUMEN
// ===========================
const groupMap = new Map();

for (const row of details) {
  const keyGrupo =
    (row.cliente || "") +
    "||" +
    (row.unidadProduccion || "") +
    "||" +
    (row.tipoEvaluacion || "") +
    "||" +
    (row.sedeNombre || "");

  let grp = groupMap.get(keyGrupo);
  if (!grp) {
    // dentro del if (!grp) { ... }
  grp = {
    id: keyGrupo,
    cliente: row.cliente,
    unidadProduccion: row.unidadProduccion,
    tipoEvaluacion: row.tipoEvaluacion,
    sedeNombre: row.sedeNombre,
    fechaInicioMin: row.fechaInicio,

    // 👉 separa importes
    importeTotal: 0,        // suma de TODAS las filas
    importeDisponible: 0,   // filas que se pueden liquidar
    importeLiquidado: 0,    // NUEVO: filas ya liquidadas
    importePendiente: 0,    // NUEVO: filas marcadas PENDIENTE
    importe: 0,             // el que se envía al front

    rows: [],
    firmaStatus: "SIN_FIRMA",

    // estado
    estadoLiquidado: "NO",
    codigo: null,

    // flags internos
    tienePendientes: false,
    tieneLiquidados: false,
    tieneDisponibles: false,
    esSoloPendiente: false,
    esGrupoPendiente: false,
  };
    groupMap.set(keyGrupo, grp);
  }

  // marcar flags de estado a nivel grupo
  if (row.isPendiente) grp.tienePendientes = true;
  if (row.estaLiquidado) grp.tieneLiquidados = true;

  const esDisponible = !row.isPendiente && !row.estaLiquidado;
  if (esDisponible) grp.tieneDisponibles = true;

  // Siempre guardamos la fila en rows (para detalle y export)
  grp.rows.push(row);

  const monto = Number(row.precioCb || 0);

  // 💰 Siempre sumamos al TOTAL del grupo
  grp.importeTotal += monto;

  // 💰 Solo sumamos a "disponible" si no está pendiente ni liquidado
  if (!row.isPendiente && !row.estaLiquidado) {
    grp.importeDisponible += monto;
  }
  // 💰 nuevo: acumular importes por estado
  if (row.estaLiquidado) {
    grp.importeLiquidado += monto;
  }
  if (row.isPendiente) {
    grp.importePendiente += monto;
  }
  // actualizar fecha mínima
  if (
    row.fechaInicio &&
    (!grp.fechaInicioMin ||
      new Date(row.fechaInicio) < new Date(grp.fechaInicioMin))
  ) {
    grp.fechaInicioMin = row.fechaInicio;
  }
}

// marcar si proviene de pendientes (cualquier fila con origenPendiente)
for (const grp of groupMap.values()) {
  grp.esGrupoPendiente = grp.rows.some((r) => r.origenPendiente);
}
// ============================
// 8) CALCULAR FIRMA STATUS
// ============================
for (const [, grp] of groupMap.entries()) {
  const allSin = grp.rows.length > 0 && grp.rows.every(
    (r) => !r.evaluador || r.evaluador.toUpperCase() === "SIN FIRMA"
  );
  const allCon = grp.rows.length > 0 && grp.rows.every(
    (r) => r.evaluador && r.evaluador.toUpperCase() !== "SIN FIRMA"
  );

  if (allSin) grp.firmaStatus = "SIN_FIRMA";
  else if (allCon) grp.firmaStatus = "CON_FIRMA";
  else grp.firmaStatus = "MIXTO";
}

// ======================================================
// 9) MARCAR ESTADO: NO / PARCIAL / LIQUIDADO + CÓDIGO
// ======================================================
for (const grp of groupMap.values()) {
  // 1) Estado general del grupo
  if (grp.tieneLiquidados) {
    if (grp.tienePendientes || grp.tieneDisponibles) {
      grp.estadoLiquidado = "PARCIAL";
    } else {
      grp.estadoLiquidado = "LIQUIDADO";
    }
  } else {
    grp.estadoLiquidado = "NO";
  }
    // 🔑 Elegimos qué importe mostrar al front:
if (grp.estadoLiquidado === "LIQUIDADO") {
  // todo liquidado → mostrar todo
  grp.importe = grp.importeTotal;
} else if (grp.estadoLiquidado === "PARCIAL") {
  // parcial → mostrar lo YA LIQUIDADO
  grp.importe = grp.importeLiquidado;
} else {
  // estado "NO" → mostrar solo lo disponible
  grp.importe = grp.importeDisponible;
}

  // 5) Código de liquidación (si existe)
  if (typeof codigosPorGrupo !== "undefined") {
    const keyNorm =
      (grp.cliente || "").trim().toUpperCase() +
      "||" +
      (grp.unidadProduccion || "").trim().toUpperCase() +
      "||" +
      (grp.tipoEvaluacion || "").trim().toUpperCase() +
      (grp.sedeNombre || "").trim().toUpperCase();

    grp.codigo = codigosPorGrupo.get(keyNorm) || null;
  }
}
  
    // ===========================
    // 10) PREPARAR RESPUESTA FINAL
    // ===========================
    const groups = [];
    const detailsByGroupId = {};

    for (const [key, grp] of groupMap.entries()) {
      const { rows: grpRows, totalFilas, totalLiquidadas, ...summary } = grp;
      groups.push(summary);
      detailsByGroupId[key] = grpRows;
    }

    groups.sort((a, b) => {
    // 1) Por cliente
    const c = (a.cliente || "").localeCompare(b.cliente || "");
    if (c !== 0) return c;

    // 2) Por fecha mínima
    const ta = a.fechaInicioMin ? new Date(a.fechaInicioMin).getTime() : 0;
    const tb = b.fechaInicioMin ? new Date(b.fechaInicioMin).getTime() : 0;

    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;

    return ta - tb;
  });
    const clientesSet = new Set();
    const tiposSet = new Set();
    const sedesSet = new Set();
    const estadosPrestacionSet = new Set();

    for (const d of details) {
      if (d.cliente) clientesSet.add(d.cliente);
      if (d.tipoEvaluacion) tiposSet.add(d.tipoEvaluacion);
      if (d.sedeNombre) sedesSet.add(d.sedeNombre);
      if (d.estadoPrestacion) estadosPrestacionSet.add(d.estadoPrestacion);
    }

    return res.json({
      ok: true,
      groups,
      detailsByGroupId,
      filters: {
        clientes: Array.from(clientesSet).sort(),
        tipos: Array.from(tiposSet).sort(),
        sedes: Array.from(sedesSet).sort(),
        estadosPrestacion: Array.from(estadosPrestacionSet).sort(),
      },
    });
  } catch (err) {
    console.error("Error en GET /api/clientes/process:", err);
    return res.status(500).json({
      ok: false,
      message: "Error al procesar liquidación de clientes.",
      debug: err.message,
    });
  }
});
/**
 * POST /api/clientes/exclusions
 * Guarda pacientes marcados como "no liquidar".
 * Body: { items: [{ nro, documento, paciente, fechaInicio, cliente, unidadProduccion, tipoEvaluacion, createdBy }] }
 */
// Guarda pacientes marcados como "NO liquidar" en LiquidacionClientesPendientes
router.post("/exclusions", async (req, res) => {
  try {
    const { from, to, condicionPago, items } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({
        ok: false,
        message: "No hay elementos para excluir.",
      });
    }

    if (!from || !to) {
      return res.status(400).json({
        ok: false,
        message: "Faltan fechas desde/hasta para registrar pendientes.",
      });
    }

    const pool = await getPool(); // FacturacionCBMedic

    for (const it of items) {
      const nro = (it.nro || "").trim();
      const documento = (it.documento || "").trim();
      const paciente = it.paciente || "";
      const cliente = it.cliente || "";
      const unidadProduccion = it.unidadProduccion || "";
      const tipoEvaluacion = it.tipoEvaluacion || "";
      const sede = it.sedeNombre || it.sede || "";
      const fechaInicio = it.fechaInicio || null;
      const importe = Number(it.precioCb ?? it.importe ?? 0);
      const usuario = it.createdBy || "";
      const exclude = !!it.exclude;

      if (!nro) continue; // seguridad mínima

      if (exclude) {
        // 👉 Marcar / mantener como PENDIENTE en este período
        await pool
  .request()
  .input("Desde", sql.Date, from)
  .input("Hasta", sql.Date, to)
  .input("CondicionPago", sql.NVarChar, condicionPago || "TODAS")
  .input("Nro", sql.NVarChar, nro)
  .input("Documento", sql.NVarChar, documento)
  .input("Paciente", sql.NVarChar, paciente)
  .input("Cliente", sql.NVarChar, cliente)
  .input("UnidadProduccion", sql.NVarChar, unidadProduccion)
  .input("TipoEvaluacion", sql.NVarChar, tipoEvaluacion)
  .input("Sede", sql.NVarChar, sede)
  .input("FechaInicio", sql.Date, fechaInicio)     // 👈 NUEVO
  .input("Importe", sql.Decimal(18, 2), importe)
  .input("Usuario", sql.NVarChar, usuario)
  .query(`
    IF EXISTS (
      SELECT 1
      FROM dbo.LiquidacionClientesPendientes
      WHERE Nro = @Nro
        AND ISNULL(Documento,'') = ISNULL(@Documento,'')
        AND Desde = @Desde
        AND Hasta = @Hasta
        AND Estado = 'PENDIENTE'
    )
    BEGIN
      SELECT 1;
    END
    ELSE
    BEGIN
      INSERT INTO dbo.LiquidacionClientesPendientes (
        IdPendiente,
        Desde,
        Hasta,
        CondicionPago,
        Nro,
        Documento,
        Paciente,
        Cliente,
        UnidadProduccion,
        TipoEvaluacion,
        Sede,
        FechaInicio,
        Importe,
        Usuario,
        Motivo,
        Estado,
        CreatedAt,
        UpdatedAt
      )
      VALUES (
        NEWID(),
        @Desde,
        @Hasta,
        @CondicionPago,
        @Nro,
        @Documento,
        @Paciente,
        @Cliente,
        @UnidadProduccion,
        @TipoEvaluacion,
        @Sede,
        @FechaInicio,   -- ✅ AHORA SI GUARDAMOS FECHA
        @Importe,
        @Usuario,
        NULL,
        'PENDIENTE',
        SYSDATETIME(),
        NULL
      );
    END
  `);
      } else {
        // 👉 ANULAR el pendiente para este período (vuelve a ser candidato)
        await pool
          .request()
          .input("Desde", sql.Date, from)
          .input("Hasta", sql.Date, to)
          .input("Nro", sql.NVarChar, nro)
          .input("Documento", sql.NVarChar, documento)
          .query(`
            UPDATE dbo.LiquidacionClientesPendientes
            SET Estado = 'REACTIVADO',
                UpdatedAt = SYSDATETIME()
            WHERE Nro = @Nro
              AND ISNULL(Documento,'') = ISNULL(@Documento,'')
              AND Desde = @Desde
              AND Hasta = @Hasta
              AND Estado = 'PENDIENTE';
          `);
      }
    }

    return res.json({
      ok: true,
      message: "Pendientes actualizados correctamente.",
    });
  } catch (err) {
    console.error("Error en POST /api/clientes/exclusions:", err);
    return res.status(500).json({
      ok: false,
      message: "Error al guardar exclusiones/pendientes.",
      debug: err.message,
    });
  }
});
/**
 * POST /api/clientes/export
 * Body: { from, to, condicionPago, selectedIds }
 * Genera un Excel detallado por paciente/prestación para los grupos seleccionados.
 */
router.post("/export", async (req, res) => {
  try {
    const { from, to, condicionPago, selectedIds, estadosPrestacion, } = req.body;
    const estadosFiltro = Array.isArray(estadosPrestacion)
    ? estadosPrestacion.filter((e) => e).map((e) => e.toString().trim().toUpperCase())
    : [];
    if (!from || !to) {
      return res
        .status(400)
        .send("Debe indicar fecha desde y hasta para exportar.");
    }
    const idsSet = new Set(selectedIds || []);

    const pool = await getPoolCbmedic();
    const result = await pool
      .request()
      .input("FechaDesde", sql.Date, from)
      .input("FechaHasta", sql.Date, to)
      .input("CondicionPago", sql.VarChar(20), condicionPago || "TODAS")
      .query(`
        EXEC dbo.pa_liq_clientes_rango_export @FechaDesde, @FechaHasta, @CondicionPago
      `);

    const rows = result.recordset || [];

    // 🔹 Cargar pendientes SOLO del periodo actual (para "NO liquidar")
    const poolFact = await getPool();            // 👈 IMPORTANTE: aquí defines poolFact
    const pendResult = await poolFact
      .request()
      .input("Desde", sql.Date, from)
      .input("Hasta", sql.Date, to)
      .query(`
        SELECT Nro, Documento
        FROM dbo.LiquidacionClientesPendientes
        WHERE Estado = 'PENDIENTE'
          AND Desde = @Desde
          AND Hasta = @Hasta
      `);

    const pendRows = pendResult.recordset || [];

    // 🔒 SOLO se consideran "NO liquidar" los PENDIENTE del PERIODO ACTUAL
    const pendientesSet = new Set(
      pendRows.map((p) => {
        const nro = (p.Nro || "").trim();
        const doc = (p.Documento || "").trim();
        return `${nro}||${doc}`;
      })
    );

    // 🔽 Aplicar "NO liquidar" + filtro de estado de prestación
    const filteredRows = rows.filter((r) => {
      const nro = (r.Nro || "").trim();
      const doc = (r["Documento"] || r["N° Documento"] || "").trim();
      const key = `${nro}||${doc}`;

      // 1) Nunca exportar lo marcado como NO liquidar en este periodo
      if (pendientesSet.has(key)) return false;

      // 2) Respetar el filtro de estado de prestación si viene del front
      if (estadosFiltro.length > 0) {
        const estadoRow = (r["Estado de la Prestación"] || "")
          .toString()
          .trim()
          .toUpperCase();

        if (!estadosFiltro.includes(estadoRow)) {
          return false;
        }
      }

      return true;
    });

    // 🧱 A partir de aquí sigues tal cual tenías:
    // // 1) Construir detalles a partir del SP (rango actual)
    const details = [];
    for (const r of filteredRows) {
      const { sedeCodigo, sedeNombre } = r["Sede"]
        ? { sedeCodigo: null, sedeNombre: r["Sede"] }
        : mapSedeFromNro(r.Nro);

      details.push({
        nro: r.Nro,
        fechaInicio: r["Fecha Inicio"],
        protocolo: r["Protocolo"],
        cliente: r["Cliente"] || r["RAZÓN SOCIAL"],
        rucCliente: r["RUC DEL CLIENTE"],
        razonSocial: r["RAZÓN SOCIAL"] || r["Cliente"],
        unidadProduccion: r["Unidad de Producción"],
        tipoEvaluacion: mapTipoEvaluacion(
          r["Tipo de Evaluación"] || r["Tipo de Examen"]
        ),
        condicionPago: r["Condición de Pago"] || r["Condicion de Pago"],
        documento: r["Documento"] || r["N° Documento"],
        paciente: r["Paciente"],
        descripcionPrestacion: r["Descripción de la Prestación"],
        importe: Number(r["Importe"] || r["Precio CB"] || 0),
        sedeNombre,
        estadoPrestacion: r["Estado de la Prestación"] || "",
      });
    }

    // 👇 Y aquí ya sigue tu bloque de `pendExtraResult` que usa el MISMO poolFact
    const pendExtraResult = await poolFact
      .request()
      .input("DesdeActual", sql.Date, from)
      .input("HastaActual", sql.Date, to)
      .query(`
        SELECT 
          Nro,
          Documento,
          Paciente,
          Cliente,
          UnidadProduccion,
          TipoEvaluacion,
          Sede,
          FechaInicio,
          Importe,
          CondicionPago,
          Desde,
          Hasta,
          Estado
        FROM dbo.LiquidacionClientesPendientes
        WHERE Estado IN ('PENDIENTE','REACTIVADO')
          AND (
               (Desde = @DesdeActual AND Hasta = @HastaActual) -- mismos días
            OR (Hasta < @HastaActual)                          -- meses anteriores
          )
      `);

const pendientesExtra = pendExtraResult.recordset || [];

// fusionar como en /process
for (const p of pendientesExtra) {
  const nro = (p.Nro || "").trim();
  const doc = (p.Documento || "").trim();
  const key = `${nro}||${doc}`;

  // evitar duplicación si ya vino en SP
  const yaExiste = details.some(
    (d) => `${d.nro || ""}||${d.documento || ""}` === key
  );
  if (yaExiste) continue;

  // respetar condición de pago
  if (condicionPago && condicionPago !== "TODAS") {
    const condPend = (p.CondicionPago || "").toString().trim().toUpperCase();
    const condFiltro = condicionPago.toString().trim().toUpperCase();
    if (condPend !== condFiltro) continue;
  }

  // fecha original del paciente
  const fechaInicioPend =
    p.FechaInicio || p.Desde || p.Hasta || null;

  details.push({
  nro,
  fechaInicio: fechaInicioPend,
  protocolo: null,
  cliente: p.Cliente || "",
  rucCliente: null,
  razonSocial: p.Cliente || "",
  unidadProduccion: p.UnidadProduccion || "",
  tipoEvaluacion: mapTipoEvaluacion(p.TipoEvaluacion || ""),
  condicionPago: p.CondicionPago || "",
  documento: doc,
  paciente: p.Paciente || "",
  descripcionPrestacion: "(Pendiente arrastrado)",
  importe: Number(p.Importe ?? 0),
  sedeNombre: p.Sede || "",
  evaluador: "",
  estadoPrestacion: "PENDIENTE",   // 👈 NUEVO: para que entre en el filtro por estado
});
}

// =========================================================
// 3) Validación final (ya incluye SP + pendientes extra)
// =========================================================
// =========================================================
// 3) Filtro FINAL por Estado de la Prestación (a nivel fila)
// =========================================================
let finalDetails = details;

if (estadosFiltro.length > 0) {
  finalDetails = details.filter((d) => {
    const est = (d.estadoPrestacion || "")
      .toString()
      .trim()
      .toUpperCase();
    return estadosFiltro.includes(est);
  });
}

if (!finalDetails.length) {
  return res.status(400).send("No hay datos para exportar.");
}

    // Agrupamos igual que en /process: Cliente + Unidad + Tipo + Sede
      const groupMap = new Map();

      for (const row of finalDetails) {
      const key =
        (row.cliente || "") +
        "||" +
        (row.unidadProduccion || "") +
        "||" +
        (row.tipoEvaluacion || "") +
        "||" +
        (row.sedeNombre || "");

      let grp = groupMap.get(key);
      if (!grp) {
        grp = {
          id: key,
          cliente: row.cliente,
          unidadProduccion: row.unidadProduccion,
          tipoEvaluacion: row.tipoEvaluacion,
          sedeNombre: row.sedeNombre,
          fechaInicioMin: row.fechaInicio,
          importe: 0,
          rows: [],
        };
        groupMap.set(key, grp);
      }

      if (
        row.fechaInicio &&
        (!grp.fechaInicioMin ||
          new Date(row.fechaInicio) < new Date(grp.fechaInicioMin))
      ) {
        grp.fechaInicioMin = row.fechaInicio;
      }

      grp.importe += row.importe || 0;
      grp.rows.push(row);
    }

    // Filtrar solo los grupos seleccionados (ids = keys)
    const selectedGroups = [];
    for (const [key, grp] of groupMap.entries()) {
      if (!idsSet.size || idsSet.has(key)) {
        selectedGroups.push(grp);
      }
    }

    if (!selectedGroups.length) {
      return res
        .status(400)
        .send("No se encontró ningún grupo seleccionado para exportar.");
    }

    // Crear Excel
    const workbook = new ExcelJS.Workbook();
    const usedSheetNames = new Set();
    selectedGroups.forEach((grp, index) => {
            // Base: Cliente - Sede (si hay)
      let baseName =
        grp.cliente && grp.sedeNombre
          ? `${grp.cliente} - ${grp.sedeNombre}`
          : grp.cliente || `Grupo ${index + 1}`;

      // Excel solo permite 31 chars
      baseName = baseName.substring(0, 31);

      // Asegurar nombre único
      let sheetName = baseName;
      let suffix = 2;
      while (usedSheetNames.has(sheetName)) {
        const suffixStr = ` (${suffix})`;
        const maxLen = 31 - suffixStr.length;
        sheetName = baseName.substring(0, maxLen) + suffixStr;
        suffix++;
      }
      usedSheetNames.add(sheetName);

      const ws = workbook.addWorksheet(sheetName || `Grupo${index + 1}`);

      // Cabecera (todas las columnas pedidas)
      const header = [
        "Fecha inicio",
        "Protocolo",
        "Cliente",
        "Tipo de evaluación",
        "Documento",
        "Paciente",
        "Descripción prestación",
        "Importe",
        "Condición de pago",
        "RUC del cliente",
        "Razón social",
        "Sede",
        "Unidad de producción",
        "Estado prestación",
      ];
      const headerRow = ws.addRow(header);

      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE3F2FD" }, // azul claro
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Filas de detalle (una por prestación/paciente)
      grp.rows.forEach((r) => {
        ws.addRow([
          r.fechaInicio,
          r.protocolo,
          r.cliente,
          r.tipoEvaluacion,
          r.documento,
          r.paciente,
          r.descripcionPrestacion,
          r.importe,
          r.condicionPago,
          r.rucCliente,
          r.razonSocial,
          r.sedeNombre,
          r.unidadProduccion,
          r.estadoPrestacion,
        ]);
      });

      // Fila de total del grupo
      const totalRow = ws.addRow([
        "",
        "",
        "",
        "",
        "",
        "",
        "TOTAL",
        grp.importe,
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      totalRow.font = { bold: true };
      totalRow.getCell(7).alignment = { horizontal: "right" };

      // Ajustar ancho de columnas
      ws.columns.forEach((col) => {
        let maxLength = 10;
        col.eachCell({ includeEmpty: true }, (cell) => {
          const value = cell.value ? cell.value.toString() : "";
          maxLength = Math.max(maxLength, value.length + 2);
        });
        col.width = Math.min(maxLength, 45);
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="liquidaciones_${from}_a_${to}.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Error en POST /api/clientes/export:", err);
    return res.status(500).send("Error al generar Excel.");
  }
});
/**
 * POST /api/clientes/liquidar
 * Guarda una liquidación real en LiquidacionClientesCab + Det
 */
// ===============================
//  POST /api/clientes/liquidar
// ===============================
router.post("/liquidar", async (req, res) => {
  try {
    const { from, to, condicionPago, selectedIds, usuario } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        ok: false,
        message: "Debe indicar fecha desde y hasta para liquidar.",
      });
    }

    const idsSet = new Set(selectedIds || []);

    // 1) Traer detalle completo desde cbmedic (mismo SP que /process)
    const poolCb = await getPoolCbmedic();
    const poolFact = await getPool(); // 👈 AQUÍ se define poolFact

    const result = await poolCb
      .request()
      .input("FechaDesde", sql.Date, from)
      .input("FechaHasta", sql.Date, to)
      .input("CondicionPago", sql.VarChar(20), condicionPago || "TODAS")
      .query(`
        EXEC dbo.pa_liq_clientes_rango_export
          @FechaDesde,
          @FechaHasta,
          @CondicionPago
      `);

    const rawRows = result.recordset || [];

    if (!rawRows.length) {
      return res.status(400).json({
        ok: false,
        message: "No hay datos para liquidar en el rango indicado.",
      });
    }

    // 2) LEER PENDIENTES (NO LIQUIDAR) DEL PERIODO ACTUAL + ARRASTRADOS
    const pendResult = await poolFact
      .request()
      .input("DesdeActual", sql.Date, from)
      .input("HastaActual", sql.Date, to)
      .query(`
        SELECT 
          Nro,
          Documento,
          Paciente,
          Cliente,
          UnidadProduccion,
          TipoEvaluacion,
          Sede,
          FechaInicio,
          Importe,
          CondicionPago,
          Desde,
          Hasta,
          Estado
        FROM dbo.LiquidacionClientesPendientes
      WHERE Estado IN ('PENDIENTE', 'REACTIVADO')
          AND (
               (Desde = @DesdeActual AND Hasta = @HastaActual) -- mismo periodo
            OR (Hasta < @DesdeActual)                          -- periodos anteriores completamente
          )
      `);

    const pendRows = pendResult.recordset || [];
    const pendientesExtra = pendRows;

    // CORRECCIÓN AQUÍ:
    // Solo agregamos al "Set de bloqueo" (pendientesSet) aquellos registros 
    // que son PENDIENTES y pertenecen EXACTAMENTE al periodo que estamos liquidando.
    // Si pertenecen a periodos pasados, NO los metemos aquí para que el código de abajo 
    // (4.b) los deje pasar y se liquiden.
    const pendientesSet = new Set(
      pendRows
        .filter((p) => {
          // Validamos que el estado sea PENDIENTE
          const estado = (p.Estado || "").toUpperCase();
          if (estado !== "PENDIENTE") return false;

          // Validamos fechas para asegurar que es una exclusión de ESTE periodo
          if (!p.Desde || !p.Hasta) return false;
          const desdeStr = new Date(p.Desde).toISOString().slice(0, 10);
          const hastaStr = new Date(p.Hasta).toISOString().slice(0, 10);

          return desdeStr === from && hastaStr === to;
        })
        .map((p) => {
          const nro = (p.Nro || "").trim();
          const doc = (p.Documento || "").trim();
          return `${nro}||${doc}`;
        })
    );

    // 3) Excluir NO liquidar (Solo se excluirán los que estén en el Set filtrado arriba)
    const filtered = rawRows.filter((r) => {
      const nro = (r.Nro || "").trim();
      const doc = (r["Documento"] || r["N° Documento"] || "").trim();
      const key = `${nro}||${doc}`;
      return !pendientesSet.has(key);
    });

    // 4) Normalizar filas del SP
    const details = [];

    for (const r of filtered) {
      const { sedeCodigo, sedeNombre } = r["Sede"]
        ? { sedeCodigo: null, sedeNombre: r["Sede"] }
        : mapSedeFromNro(r.Nro);

      details.push({
        nro: (r.Nro || "").trim(),
        documento: (r["Documento"] || r["N° Documento"] || "").trim(),
        paciente: r["Paciente"],
        cliente: r["Cliente"] || r["RAZÓN SOCIAL"],
        unidadProduccion: r["Unidad de Producción"],
        tipoEvaluacion: mapTipoEvaluacion(
          r["Tipo de Evaluación"] || r["Tipo de Examen"]
        ),
        sedeNombre,
        fechaInicio: r["Fecha Inicio"],
        importe: Number(r["Importe"] || r["Precio CB"] || 0),
        condicionPago:
          r["Condición de Pago"] || r["Condicion de Pago"] || "",
        rucCliente: r["RUC DEL CLIENTE"] || null,
        razonSocial: r["RAZÓN SOCIAL"] || r["Cliente"] || "",
        descripcionPrestacion: r["Descripción de la Prestación"],
        evaluador: r["Evaluador"] || "",
      });
    }

    // 4.b) AGREGAR PENDIENTES ARRASTRADOS A LA LIQUIDACIÓN
    console.log("=== DEBUG: Pendientes para liquidar ===");
    console.log("Total pendientes extra:", pendientesExtra.length);
    console.log("From:", from, "To:", to);
    
    for (const p of pendientesExtra) {
      const nro = (p.Nro || "").trim();
      const doc = (p.Documento || "").trim();
      if (!nro) continue;

      const desdeStr = new Date(p.Desde).toISOString().slice(0, 10);
      const hastaStr = new Date(p.Hasta).toISOString().slice(0, 10);
      const esMismoPeriodo = desdeStr === from && hastaStr === to;
      const estadoPend = (p.Estado || "").toUpperCase();

      // Si es PENDIENTE del PERIODO ACTUAL → sigue siendo NO liquidar
      // PERO si es REACTIVADO del periodo actual, SÍ se puede liquidar
      if (esMismoPeriodo && estadoPend === "PENDIENTE") {
        continue;
      }
      
      // Si es de períodos anteriores, siempre se puede liquidar (PENDIENTE o REACTIVADO)
      const esArrastrado = !esMismoPeriodo;

      // Evitar duplicados (si ya vino del SP)
      const key = `${nro}||${doc}`;
      const yaExiste = details.some(
        (d) => `${(d.nro || "").trim()}||${(d.documento || "").trim()}` === key
      );
      if (yaExiste) continue;
      
      console.log(`Procesando pendiente: ${nro} - ${p.Paciente} - ${p.Cliente}`);
      console.log(`  - Estado: ${estadoPend}`);
      console.log(`  - esMismoPeriodo: ${esMismoPeriodo}`);
      console.log(`  - esArrastrado: ${esArrastrado}`);
      console.log(`  - Desde: ${desdeStr} Hasta: ${hastaStr}`);

      // Respetar condición de pago
      if (condicionPago && condicionPago !== "TODAS") {
        const condPend = (p.CondicionPago || "")
          .toString()
          .trim()
          .toUpperCase();
        const condFiltro = condicionPago.toString().trim().toUpperCase();
        if (condPend !== condFiltro) continue;
      }

      const importeNum = Number(p.Importe ?? 0);
      
      // Normalizar el tipo de evaluación para que coincida con el mapeo
      const tipoEvalNormalizado = mapTipoEvaluacion(p.TipoEvaluacion || "");

      details.push({
        nro,
        documento: doc,
        paciente: p.Paciente || "",
        cliente: p.Cliente || "",
        unidadProduccion: p.UnidadProduccion || "",
        tipoEvaluacion: tipoEvalNormalizado,
        sedeNombre: p.Sede || "",
        fechaInicio: p.FechaInicio || p.Desde || null,
        importe: importeNum,
        condicionPago: p.CondicionPago || "",
        rucCliente: null,
        razonSocial: p.Cliente || "",
        descripcionPrestacion: "(Pendiente arrastrado)",
        evaluador: "",
        origenPendiente: esArrastrado,
        // Campos adicionales para consistencia con las filas del SP
        precioCb: importeNum,
        isPendiente: false, // Los arrastrados se pueden liquidar
        estaLiquidado: false,
      });
      
      console.log(`  ✓ Agregado a details: ${p.Cliente} - ${p.TipoEvaluacion} - ${p.Sede}`);
    }
    
    console.log("Total details después de agregar pendientes:", details.length);
    console.log("=== FIN DEBUG ===");

    if (!details.length) {
      return res.status(400).json({
        ok: false,
        message: "No hay filas para liquidar (SP + pendientes arrastrados).",
      });
    }

    // 5) Agrupar por cliente + unidad + tipo + sede (igual que en /process)
    const groupMap = new Map();
    console.log("=== DEBUG: Agrupando para liquidar ===");
    console.log("Total details:", details.length);
    
    for (const row of details) {
      const key =
        (row.cliente || "") +
        "||" +
        (row.unidadProduccion || "") +
        "||" +
        (row.tipoEvaluacion || "") +
        "||" +
        (row.sedeNombre || "");

      let grp = groupMap.get(key);
      if (!grp) {
        grp = {
          id: key,
          cliente: row.cliente,
          unidadProduccion: row.unidadProduccion,
          tipoEvaluacion: row.tipoEvaluacion,
          sedeNombre: row.sedeNombre,
          rows: [],
        };
        groupMap.set(key, grp);
        console.log(`Nuevo grupo creado: ${key}`);
      }
      grp.rows.push(row);
      
      if (row.origenPendiente) {
        console.log(`  - Fila con origenPendiente: ${row.paciente} (${row.nro})`);
      }
    }
    
    console.log("Grupos creados:", groupMap.size);
    console.log("=== FIN DEBUG AGRUPAR ===");

    // 6) Tomar solo los grupos seleccionados
    const rowsToLiquidate = [];
    const groupKeysSelected = new Set();

    console.log("=== DEBUG: Selección de grupos ===");
    console.log("IDs seleccionados desde frontend:", selectedIds);
    console.log("Claves disponibles en groupMap:", Array.from(groupMap.keys()));
    
    // Normalizar IDs para comparación
    const normalizedSelectedIds = selectedIds.map(id => {
      const parts = id.split('||');
      return `${parts[0] || ""}||${parts[1] || ""}||${parts[2] || ""}||${parts[3] || ""}`;
    });
    console.log("IDs normalizados:", normalizedSelectedIds);
    console.log("Claves normalizadas en groupMap:", Array.from(groupMap.keys()));

    for (const [key, grp] of groupMap.entries()) {
      console.log(`Verificando grupo: ${key}`);
      console.log(`  - Está en selectedIds: ${idsSet.has(key)}`);
      console.log(`  - Está en normalizedSelectedIds: ${normalizedSelectedIds.includes(key)}`);
      console.log(`  - Filas totales: ${grp.rows.length}`);
      console.log(`  - Filas con origenPendiente: ${grp.rows.filter(r => r.origenPendiente).length}`);
      
      if (!idsSet.size || idsSet.has(key)) {
        console.log(`  ✓ Grupo SELECCIONADO`);
        groupKeysSelected.add(key);
        rowsToLiquidate.push(...grp.rows);
      }
    }

    console.log("Total filas a liquidar:", rowsToLiquidate.length);
    console.log("Filas con origenPendiente en liquidación:", rowsToLiquidate.filter(r => r.origenPendiente).length);
    console.log("=== FIN DEBUG SELECCIÓN ===");

    if (!rowsToLiquidate.length) {
      return res.status(400).json({
        ok: false,
        message: "No se encontraron filas para los grupos seleccionados.",
      });
    }

    // 7) Calcular montos y métricas
    let subtotal = 0;
    const pacientesSet = new Set();

    for (const r of rowsToLiquidate) {
      subtotal += Number(r.importe || 0);
      const pacKey = `${(r.nro || "").trim()}||${(r.documento || "").trim()}`;
      pacientesSet.add(pacKey);
    }

    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    const grupos = groupKeysSelected.size;
    const pacientes = pacientesSet.size;

    // 8) Generar código LQ-xxxxx
    const codeResult = await poolFact.request().query(`
      SELECT MAX(CAST(SUBSTRING(Codigo, 4, 10) AS INT)) AS lastNum
      FROM dbo.LiquidacionClientesCab
      WHERE Codigo LIKE 'LQ-%'
    `);

    const lastNum = codeResult.recordset?.[0]?.lastNum || 0;
    const nextNum = lastNum + 1;
    const codigo = `LQ-${String(nextNum).padStart(5, "0")}`;

    // 9) Insertar CAB + DET dentro de una transacción
    const tx = new sql.Transaction(poolFact);
    await tx.begin();

    try {
      const IdLiquidacion = crypto.randomUUID();

      // CABECERA
      const reqCab = new sql.Request(tx);
      await reqCab
        .input("IdLiquidacion", sql.UniqueIdentifier, IdLiquidacion)
        .input("Desde", sql.Date, from)
        .input("Hasta", sql.Date, to)
        .input("CondicionPago", sql.NVarChar, condicionPago || "TODAS")
        .input("Usuario", sql.NVarChar, usuario || "")
        .input("Subtotal", sql.Decimal(18, 2), subtotal)
        .input("IGV", sql.Decimal(18, 2), igv)
        .input("Total", sql.Decimal(18, 2), total)
        .input("Grupos", sql.Int, grupos)
        .input("Pacientes", sql.Int, pacientes)
        .input("Codigo", sql.NVarChar, codigo)
        .query(`
          INSERT INTO dbo.LiquidacionClientesCab (
            IdLiquidacion,
            FechaLiquidacion,
            Desde,
            Hasta,
            CondicionPago,
            Usuario,
            Subtotal,
            IGV,
            Total,
            Grupos,
            Pacientes,
            Codigo,
            Estado
          )
          VALUES (
            @IdLiquidacion,
            SYSDATETIME(),
            @Desde,
            @Hasta,
            @CondicionPago,
            @Usuario,
            @Subtotal,
            @IGV,
            @Total,
            @Grupos,
            @Pacientes,
            @Codigo,
            'VIGENTE'
          )
        `);

      // DETALLE
      for (const r of rowsToLiquidate) {
        const rq = new sql.Request(tx);

        await rq
          .input("IdLiquidacion", sql.UniqueIdentifier, IdLiquidacion)
          .input("Nro", sql.NVarChar, r.nro || "")
          .input("Documento", sql.NVarChar, r.documento || "")
          .input("Paciente", sql.NVarChar, r.paciente || "")
          .input("Cliente", sql.NVarChar, r.cliente || "")
          .input(
            "UnidadProduccion",
            sql.NVarChar,
            r.unidadProduccion || ""
          )
          .input(
            "TipoEvaluacion",
            sql.NVarChar,
            r.tipoEvaluacion || ""
          )
          .input("Sede", sql.NVarChar, r.sedeNombre || "")
          .input("Protocolo", sql.NVarChar, r.protocolo || "")
          .input(
            "FechaInicio",
            sql.Date,
            r.fechaInicio || null
          )
          .input(
            "DescripcionPrestacion",
            sql.NVarChar,
            r.descripcionPrestacion || ""
          )
          .input("Importe", sql.Decimal(18, 2), r.importe || 0)
          .input(
            "CondicionPago",
            sql.NVarChar,
            r.condicionPago || ""
          )
          .input("RucCliente", sql.NVarChar, r.rucCliente || "")
          .input(
            "RazonSocial",
            sql.NVarChar,
            r.razonSocial || r.cliente || ""
          )
          .input("Evaluador", sql.NVarChar, r.evaluador || "")
          .query(`
            INSERT INTO dbo.LiquidacionClientesDet (
              IdLiquidacion, Nro, Documento, Paciente, Cliente,
              UnidadProduccion, TipoEvaluacion, Sede, Protocolo, FechaInicio,
              DescripcionPrestacion, Importe, CondicionPago, RucCliente,
              RazonSocial, Evaluador
            )
            VALUES (
              @IdLiquidacion, @Nro, @Documento, @Paciente, @Cliente,
              @UnidadProduccion, @TipoEvaluacion, @Sede, @Protocolo, @FechaInicio,
              @DescripcionPrestacion, @Importe, @CondicionPago, @RucCliente,
              @RazonSocial, @Evaluador
            )
          `);
      }

      await tx.commit();

      // 10) Actualizar estado de pendientes liquidados
      // Marcar como LIQUIDADO los pendientes que se incluyeron en esta liquidación
      const pendientesLiquidados = rowsToLiquidate.filter(r => r.origenPendiente);
      
      if (pendientesLiquidados.length > 0) {
        for (const r of pendientesLiquidados) {
          await poolFact
            .request()
            .input("Nro", sql.NVarChar, r.nro)
            .input("Documento", sql.NVarChar, r.documento)
            .query(`
              UPDATE dbo.LiquidacionClientesPendientes
              SET Estado = 'LIQUIDADO',
                  UpdatedAt = SYSDATETIME()
              WHERE Nro = @Nro
                AND ISNULL(Documento,'') = ISNULL(@Documento,'')
                AND Estado IN ('PENDIENTE', 'REACTIVADO');
            `);
        }
      }

      return res.json({
        ok: true,
        message: "Liquidación registrada correctamente.",
        idLiquidacion: IdLiquidacion,
        codigo,
        subtotal,
        igv,
        total,
        grupos,
        pacientes,
      });
    } catch (errTx) {
      try {
        if (!tx._aborted) {
          await tx.rollback();
        }
      } catch (rbErr) {
        console.error("Error al hacer rollback en /liquidar:", rbErr);
      }

      console.error("Error en transacción /liquidar:", errTx);
      return res.status(500).json({
        ok: false,
        message: "Error al registrar la liquidación.",
        debug: errTx.message,
      });
    }
  } catch (err) {
    console.error("Error general en /liquidar:", err);
    return res.status(500).json({
      ok: false,
      message: "Error al procesar la liquidación.",
      debug: err.message,
    });
  }
});
/** 
 * GET /api/clientes/liquidaciones
 * Lista cabeceras de liquidación de clientes (histórico).
 * Query opcional:
 *   from=YYYY-MM-DD  (filtra Desde >= from)
 *   to=YYYY-MM-DD    (filtra Hasta <= to)
 *   condicionPago=CONTADO|CREDITO|TODAS
 */
router.get("/liquidaciones", async (req, res) => {
  try {
    const { from, to, condicionPago } = req.query;
    const pool = await getPool(); // FacturacionCBMedic

    let rq = pool.request();
    let where = "WHERE 1=1";

    if (from) {
      rq = rq.input("DesdeMin", sql.Date, from);
      where += " AND Desde >= @DesdeMin";
    }

    if (to) {
      rq = rq.input("HastaMax", sql.Date, to);
      where += " AND Hasta <= @HastaMax";
    }

    if (condicionPago && condicionPago !== "TODAS") {
      rq = rq.input(
        "CondicionPago",
        sql.NVarChar,
        condicionPago.toString().trim().toUpperCase()
      );
      where += " AND UPPER(CondicionPago) = @CondicionPago";
    }

    const query = `
      SELECT
        IdLiquidacion,
        FechaLiquidacion,
        Desde,
        Hasta,
        CondicionPago,
        Subtotal,
        IGV,
        Total,
        Grupos,
        Pacientes,
        Observacion,
        Codigo,
        Estado
      FROM dbo.LiquidacionClientesCab
      ${where}
      ORDER BY FechaLiquidacion DESC, Desde DESC, Hasta DESC
    `;

    const result = await rq.query(query);
    return res.json({
      ok: true,
      items: result.recordset || [],
    });
  } catch (err) {
    console.error("Error en GET /api/clientes/liquidaciones:", err);
    return res.status(500).json({
      ok: false,
      message: "Error al listar liquidaciones de clientes.",
      debug: err.message,
    });
  }
});
/**
 * GET /api/clientes/liquidaciones/:id
 * Devuelve cabecera + detalle de una liquidación específica.
 * :id = IdLiquidacion (GUID) generado al liquidar.
 */
router.get("/liquidaciones/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool(); // FacturacionCBMedic

    // 1) Cabecera
    const cabResult = await pool
      .request()
      .input("Id", sql.UniqueIdentifier, id)
      .query(`
        SELECT
          IdLiquidacion,
          FechaLiquidacion,
          Desde,
          Hasta,
          CondicionPago,
          Subtotal,
          IGV,
          Total,
          Grupos,
          Pacientes,
          Observacion,
          Codigo,
          Estado
        FROM dbo.LiquidacionClientesCab
        WHERE IdLiquidacion = @Id
      `);

    if (!cabResult.recordset || cabResult.recordset.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Liquidación no encontrada.",
      });
    }

    const header = cabResult.recordset[0];

    // 2) Detalle
    const detResult = await pool
      .request()
      .input("Id", sql.UniqueIdentifier, id)
      .query(`
        SELECT
          IdLiquidacion,
          Nro,
          Documento,
          Paciente,
          Cliente,
          UnidadProduccion,
          TipoEvaluacion,
          Sede,
          Protocolo,
          FechaInicio,
          DescripcionPrestacion,
          Importe,
          CondicionPago,
          RucCliente,
          RazonSocial,
          Evaluador,
          CreatedAt
        FROM dbo.LiquidacionClientesDet
        WHERE IdLiquidacion = @Id
        ORDER BY
          Cliente,
          UnidadProduccion,
          TipoEvaluacion,
          Sede,
          Paciente,
          Documento
      `);

    return res.json({
      ok: true,
      header,
      rows: detResult.recordset || [],
    });
    
  } catch (err) {
    console.error("Error en GET /api/clientes/liquidaciones/:id:", err);
    return res.status(500).json({
      ok: false,
      message: "Error al obtener detalle de la liquidación.",
      debug: err.message,
    });
  }
});

/** 
 * GET /api/clientes/detalle-con-pendientes
 * Query:
 *   from, to, cliente, unidad, tipo, sede
 *
 * Devuelve:
 *   - rowsNormales: del SP principal
 *   - rowsPendientes: de LiquidacionClientesPendientes
 */
/**
 * POST /api/clientes/liquidaciones/:id/anular
 * Anula una liquidación (marca Estado = 'ANULADA').
 * Body: { usuario?: string }
 */
router.post("/liquidaciones/:id/anular", async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.body || {};

    const pool = await getPool(); // FacturacionCBMedic

    const result = await pool
      .request()
      .input("Id", sql.UniqueIdentifier, id)
      .input("UsuarioAnula", sql.NVarChar, usuario || "admin")
      .query(`
        UPDATE dbo.LiquidacionClientesCab
        SET Estado = 'ANULADA',
            FechaAnulacion = SYSDATETIME(),
            UsuarioAnula = @UsuarioAnula
        WHERE IdLiquidacion = @Id
          AND (Estado IS NULL OR Estado = 'VIGENTE');
      `);

    const rowsAffected = result.rowsAffected?.[0] || 0;

    if (!rowsAffected) {
      return res.status(404).json({
        ok: false,
        message: "No se encontró una liquidación VIGENTE con ese Id.",
      });
    }

    return res.json({
      ok: true,
      message: "Liquidación anulada correctamente.",
    });
  } catch (err) {
    console.error("Error en POST /api/clientes/liquidaciones/:id/anular:", err);
    return res.status(500).json({
      ok: false,
      message: "Error al anular la liquidación.",
      debug: err.message,
    });
  }
});
// clientes.js – reemplaza el contenido de router.get("/detalle-con-pendientes", ...)

router.get("/detalle-con-pendientes", async (req, res) => {
  try {
    const { from, to, cliente, unidad, tipo, sede } = req.query;

    if (!from || !to || !cliente || !unidad || !tipo || !sede) {
      return res.status(400).json({
        ok: false,
        message: "Faltan parámetros para cargar detalle.",
      });
    }

    const poolCb = await getPoolCbmedic();
    const data = await poolCb
      .request()
      .input("FechaDesde", sql.Date, from)
      .input("FechaHasta", sql.Date, to)
      .query(`
        EXEC dbo.pa_liq_clientes_rango_export
          @FechaDesde,
          @FechaHasta,
          'TODAS'
      `);

    const rows = data.recordset || [];

    const rowsNormales = rows.filter((r) => {
      return (
        (r["Cliente"] || r["RAZÓN SOCIAL"]) === cliente &&
        r["Unidad de Producción"] === unidad &&
        r["Tipo de Evaluación"] === tipo &&
        r["Sede"] === sede
      );
    });

    // 2) Pendientes (mismo criterio que /process)
    const poolFact = await getPool();
    const pend = await poolFact
      .request()
      .input("Cliente", sql.NVarChar, cliente)
      .input("Unidad", sql.NVarChar, unidad)
      .input("Tipo", sql.NVarChar, tipo)
      .input("Sede", sql.NVarChar, sede)
      .input("DesdeActual", sql.Date, from)
      .input("HastaActual", sql.Date, to)
      .query(`
        SELECT 
          Nro,
          Documento,
          Paciente,
          Cliente,
          UnidadProduccion,
          TipoEvaluacion,
          Sede,
          FechaInicio,
          Importe,
          CondicionPago,
          Desde,
          Hasta,
          Estado,
          CASE 
            WHEN Estado = 'PENDIENTE' 
              AND Desde = @DesdeActual 
              AND Hasta = @HastaActual
            THEN 1
            ELSE 0
          END AS EsPendienteActual
        FROM dbo.LiquidacionClientesPendientes
        WHERE Estado IN ('PENDIENTE','REACTIVADO')
          AND Cliente = @Cliente
          AND UnidadProduccion = @Unidad
          AND TipoEvaluacion = @Tipo
          AND Sede = @Sede
      `);

    return res.json({
      ok: true,
      rowsNormales,
      rowsPendientes: pend.recordset || [],
    });
  } catch (e) {
    console.error("Error detalle-con-pendientes:", e);
    return res.status(500).json({
      ok: false,
      message: "Error al cargar detalle con pendientes.",
      debug: e.message,
    });
  }
});
// POST /api/clientes/pendientes/anular
// Body: { nro, documento }
// Marca como ANULADO el pendiente (para que vuelva a aparecer en futuras liquidaciones)
router.post("/pendientes/anular", async (req, res) => {
  try {
    const { nro, documento } = req.body;

    if (!nro || !documento) {
      return res.status(400).json({
        ok: false,
        message: "Faltan Nro o Documento.",
      });
    }

    const pool = await getPool(); // FacturacionCBMedic

    const rq = pool
      .request()
      .input("Nro", sql.NVarChar, nro)
      .input("Documento", sql.NVarChar, documento);

    const result = await rq.query(`
      UPDATE dbo.LiquidacionClientesPendientes
      SET Estado = 'REACTIVADO',
          UpdatedAt = SYSDATETIME()
      WHERE 
        LTRIM(RTRIM(Nro)) = LTRIM(RTRIM(@Nro))
        AND LTRIM(RTRIM(ISNULL(Documento, ''))) = LTRIM(RTRIM(ISNULL(@Documento, '')))
        AND Estado = 'PENDIENTE';
    `);

    const rowsAffected = result.rowsAffected?.[0] || 0;

    if (!rowsAffected) {
      return res.status(404).json({
        ok: false,
        message:
          "No se encontró un pendiente PENDIENTE con ese Nro y Documento.",
      });
    }

    return res.json({
      ok: true,
      message: "Pendiente anulado correctamente.",
    });
  } catch (err) {
    console.error("Error en POST /api/clientes/pendientes/anular:", err);
    return res.status(500).json({
      ok: false,
      message: "Error al anular pendiente.",
      debug: err.message,
    });
  }
});
export default router;