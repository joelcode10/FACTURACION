// backend/src/routes/clientes.js
import { Router } from "express";
import { getPoolCbmedic, sql } from "../util/db.js";

const router = Router();

// Mapea sufijo de Nro a nombre de sede
function mapSedeFromNro(nroRaw) {
  if (!nroRaw) return { sedeCodigo: null, sedeNombre: null };
  const parts = String(nroRaw).split("_");
  const sedeCodigo = parts.length > 1 ? parts[1] : null;
  let sedeNombre = null;
  switch (sedeCodigo) {
    case "11": sedeNombre = "INTEGRAMEDICA - MEGA PLAZA"; break;
    case "3":  sedeNombre = "EMO - MEGA PLAZA"; break;
    case "10": sedeNombre = "EMO - GUARDIA"; break;
    default:   sedeNombre = null;
  }
  return { sedeCodigo, sedeNombre };
}

router.get("/process", async (req, res) => {
  const { from, to, condicionPago } = req.query;
  const spName = process.env.CBMEDIC_LIQ_SP || "dbo.pa_liq_clientes_rango"; // <- NOMBRE DEL SP
  try {
    if (!from || !to) {
      return res.status(400).json({ ok:false, message:"Debe indicar fecha desde (from) y hasta (to)." });
    }

    const pool = await getPoolCbmedic();
    console.log("▶ Ejecutando SP:", spName, "desde:", from, "hasta:", to);

    // Llamada al SP
    const result = await pool
      .request()
      .input("FechaDesde", sql.Date, from)
      .input("FechaHasta", sql.Date, to)
      .execute(spName); // <- usa execute para SP

    const rows = result?.recordset || [];
    console.log(`✔ SP ok. Filas: ${rows.length}`);

    // Filtrar por condición de pago si corresponde
    let filtered = rows;
    if (condicionPago && condicionPago !== "TODAS") {
      const condUp = condicionPago.toString().trim().toUpperCase();
      filtered = rows.filter(r => (r["Condicion de Pago"] || "").toString().trim().toUpperCase() === condUp);
    }

    // Si vacío
    if (!filtered.length) {
      return res.json({
        ok: true,
        groups: [],
        detailsByGroupId: {},
        filters: { clientes: [], tipos: [], sedes: [] },
      });
    }

    // Normalizar detalles
    const details = filtered.map(r => {
      const { sedeCodigo, sedeNombre } = mapSedeFromNro(r.Nro);
      return {
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
        precioCb: Number(r["Precio CB"] || 0),
        estadoPrestacion: r["Estado Prestacion"],
        sedeCodigo, sedeNombre,
      };
    });

    // Agrupar por (Cliente + Unidad + TipoEvaluacion)
    const groupMap = new Map();
    for (const row of details) {
      const key = `${row.cliente || ""}||${row.unidadProduccion || ""}||${row.tipoEvaluacion || ""}`;
      let grp = groupMap.get(key);
      if (!grp) {
        grp = {
          id: `g_${groupMap.size + 1}`,
          fechaInicioMin: row.fechaInicio,
          cliente: row.cliente,
          unidadProduccion: row.unidadProduccion,
          tipoEvaluacion: row.tipoEvaluacion,
          importe: 0,
          rows: [],
        };
        groupMap.set(key, grp);
      }
      if (row.fechaInicio && (!grp.fechaInicioMin || new Date(row.fechaInicio) < new Date(grp.fechaInicioMin))) {
        grp.fechaInicioMin = row.fechaInicio;
      }
      grp.importe += row.precioCb || 0;
      grp.rows.push(row);
    }

    const groups = [];
    const detailsByGroupId = {};
    for (const [, grp] of groupMap.entries()) {
      const { id, rows: grpRows, ...summary } = grp;
      groups.push({ id, ...summary });
      detailsByGroupId[id] = grpRows;
    }

    groups.sort((a, b) => {
      const c = (a.cliente || "").localeCompare(b.cliente || "");
      if (c !== 0) return c;
      const u = (a.unidadProduccion || "").localeCompare(b.unidadProduccion || "");
      if (u !== 0) return u;
      return (a.tipoEvaluacion || "").localeCompare(b.tipoEvaluacion || "");
    });

    // Filtros
    const clientes = new Set(), tipos = new Set(), sedes = new Set();
    details.forEach(d => {
      if (d.cliente) clientes.add(d.cliente);
      if (d.tipoEvaluacion) tipos.add(d.tipoEvaluacion);
      if (d.sedeNombre) sedes.add(d.sedeNombre);
    });

    return res.json({
      ok: true,
      groups,
      detailsByGroupId,
      filters: {
        clientes: Array.from(clientes).sort(),
        tipos: Array.from(tipos).sort(),
        sedes: Array.from(sedes).sort(),
      },
    });
  } catch (err) {
    console.error("❌ Error en GET /api/clientes/process:");
    console.error("   Mensaje:", err.message);
    console.error("   Código  :", err.code);
    console.error("   Pila    :", err.stack);
    return res.status(500).json({
      ok: false,
      message: "Error al procesar liquidación de clientes.",
      debug: err.message, // el frontend lo mostrará si lo necesitas
    });
  }
});

export default router;
