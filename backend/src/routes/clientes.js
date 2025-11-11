// backend/src/routes/clientes.js
import { Router } from "express";
import { getCbmedicPool, sql } from "../util/db.js";

const router = Router();

/**
 * Helper: mapea el sufijo del Nro (_3, _10, _11) a nombre de sede.
 */
function mapSedeFromNro(nroRaw) {
  if (!nroRaw) return { sedeCodigo: null, sedeNombre: null };

  const parts = String(nroRaw).split("_");
  const sedeCodigo = parts.length > 1 ? parts[1] : null;

  let sedeNombre = null;
  switch (sedeCodigo) {
    case "11":
      sedeNombre = "INTEGRAMEDICA - MEGA PLAZA";
      break;
    case "3":
      sedeNombre = "EMO - MEGA PLAZA";
      break;
    case "10":
      sedeNombre = "EMO - GUARDIA";
      break;
    default:
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

    // 👈 AQUÍ USAMOS la pool de CBMEDIC
    const pool = await getCbmedicPool();

    // IMPORTANTE: aquí estamos asumiendo que ya tienes creado el SP:
    //   pa_liq_clientes_rango @FechaDesde, @FechaHasta
    const result = await pool
      .request()
      .input("FechaDesde", sql.Date, from)
      .input("FechaHasta", sql.Date, to)
      .query(`
        EXEC dbo.pa_liq_clientes_rango @FechaDesde, @FechaHasta
      `);

    const rows = result.recordset || [];

    // Filtro por condición de pago (si NO es "TODAS" ni vacío)
    let filtered = rows;
    if (condicionPago && condicionPago !== "TODAS") {
      const condUp = condicionPago.toString().trim().toUpperCase();
      filtered = rows.filter((r) => {
        const val = (r["Condicion de Pago"] || "")
          .toString()
          .trim()
          .toUpperCase();
        return val === condUp;
      });
    }

    // Si no hay datos -> respondemos vacío
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

    // 1) Detalle normalizado
    const details = [];
    for (const r of filtered) {
      const { sedeCodigo, sedeNombre } = mapSedeFromNro(r.Nro);

      details.push({
        nro: r.Nro,
        fechaInicio: r["Fecha Inicio"],

        cliente: r["RAZÓN SOCIAL"],
        rucCliente: r["RUC DEL CLIENTE"],
        unidadProduccion: r["Unidad de Producción"],
        tipoEvaluacion: r["Tipo de Examen"],
        condicionPago: r["Condicion de Pago"],

        tipoDocumento: r["Tipo de Documento"],
        documento: r["N° Documento"],
        paciente: r["Paciente"],

        descripcionPrestacion: r["Descripción de la Prestación"],
        evaluador: r["Evaluador"],
        companiaMedica: r["Compañia Médica"],

        precioCb: Number(r["Precio CB"] || 0),
        estadoPrestacion: r["Estado Prestacion"],

        sedeCodigo,
        sedeNombre,
      });
    }

    // 2) Agrupar por (Cliente + Unidad + TipoEvaluacion)
    const groupMap = new Map();

    for (const row of details) {
      const key =
        (row.cliente || "") +
        "||" +
        (row.unidadProduccion || "") +
        "||" +
        (row.tipoEvaluacion || "");

      let grp = groupMap.get(key);
      if (!grp) {
        grp = {
          id: `g_${groupMap.size + 1}`,
          cliente: row.cliente,
          unidadProduccion: row.unidadProduccion,
          tipoEvaluacion: row.tipoEvaluacion,
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

      grp.importe += row.precioCb || 0;
      grp.rows.push(row);
    }

    const groups = [];
    const detailsByGroupId = {};

    for (const [, grp] of groupMap.entries()) {
      const { id, rows: grpRows, ...summary } = grp;
      groups.push({ id, ...summary }); // 👈 importante incluir id
      detailsByGroupId[id] = grpRows;
    }

    // Orden por cliente, unidad, tipo
    groups.sort((a, b) => {
      const c1 = (a.cliente || "").localeCompare(b.cliente || "");
      if (c1 !== 0) return c1;
      const u1 = (a.unidadProduccion || "").localeCompare(
        b.unidadProduccion || ""
      );
      if (u1 !== 0) return u1;
      return (a.tipoEvaluacion || "").localeCompare(b.tipoEvaluacion || "");
    });

    // 3) Filtros
    const clientesSet = new Set();
    const tiposSet = new Set();
    const sedesSet = new Set();

    for (const d of details) {
      if (d.cliente) clientesSet.add(d.cliente);
      if (d.tipoEvaluacion) tiposSet.add(d.tipoEvaluacion);
      if (d.sedeNombre) sedesSet.add(d.sedeNombre);
    }

    const filters = {
      clientes: Array.from(clientesSet).sort(),
      tipos: Array.from(tiposSet).sort(),
      sedes: Array.from(sedesSet).sort(),
    };

    return res.json({
      ok: true,
      groups,
      detailsByGroupId,
      filters,
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

export default router;
