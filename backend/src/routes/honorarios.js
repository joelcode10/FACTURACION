// backend/src/routes/honorarios.js
import { Router } from "express";
import { getPoolCbmedic, getPool, sql } from "../util/db.js";
import ExcelJS from "exceljs";
import crypto from "crypto";

const router = Router();

// Helper simple para sedes
function mapSedeFromNro(nroRaw) {
  if (!nroRaw) return { sedeNombre: null };
  const parts = String(nroRaw).split("_");
  const sedeCodigo = parts.length > 1 ? parts[1] : null;
  let sedeNombre = null;
  switch (sedeCodigo) {
    case "3": sedeNombre = "EMO - MEGA PLAZA"; break;
    case "8": sedeNombre = "IN HOUSE OCUPACIONAL"; break;
    case "10": sedeNombre = "EMO - GUARDIA"; break;
    case "11": sedeNombre = "INTEGRAMEDICA (MEGA PLAZA)"; break;
    default: sedeNombre = null;
  }
  return { sedeNombre };
}

// =====================================================================
// GET /process (Procesar Honorarios)
// Agrupa por: Evaluador -> Compañía -> Sede
// =====================================================================
router.get("/process", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, message: "Faltan fechas." });

    const poolCb = await getPoolCbmedic();
    const poolFact = await getPool(); 

    // 1. Obtener Data del SP Optimizado
    const result = await poolCb.request()
      .input("FechaDesde", sql.Date, from)
      .input("FechaHasta", sql.Date, to)
      .query(`EXEC dbo.pa_honorarios_medicos_rango @FechaDesde, @FechaHasta`);
    
    const rows = result.recordset || [];

    // 2. Obtener Pendientes (Honorarios)
    const pendResult = await poolFact.request()
      .input("DesdeActual", sql.Date, from)
      .input("HastaActual", sql.Date, to)
      .query(`
        SELECT Nro, Documento, Evaluador, Compania, Sede, FechaInicio, Importe, Desde, Hasta, Estado
        FROM dbo.LiquidacionHonorariosPendientes
        WHERE Estado IN ('PENDIENTE', 'REACTIVADO')
          AND ((Desde = @DesdeActual AND Hasta = @HastaActual) OR (Hasta < @HastaActual))
      `);
    const pendientesExtra = pendResult.recordset || [];

    // Set de bloqueados para este mes
    const pendientesSet = new Set(
      pendientesExtra
        .filter(p => {
           if ((p.Estado||"").toUpperCase() !== "PENDIENTE") return false;
           const d = new Date(p.Desde).toISOString().slice(0,10);
           const h = new Date(p.Hasta).toISOString().slice(0,10);
           return d === from && h === to;
        })
        .map(p => `${(p.Nro||"").trim()}||${(p.Documento||"").trim()}`)
    );

    // 3. Obtener Liquidados (Histórico LH)
    const liqResult = await poolFact.request().query(`
      SELECT d.Nro, d.Documento 
      FROM dbo.LiquidacionHonorariosDet d
      INNER JOIN dbo.LiquidacionHonorariosCab c ON d.IdLiquidacion = c.IdLiquidacion
      WHERE c.Estado IS NULL OR c.Estado = 'VIGENTE'
    `);
    const liquidadosSet = new Set(
      (liqResult.recordset || []).map(r => `${(r.Nro||"").trim()}||${(r.Documento||"").trim()}`)
    );

    // 4. Códigos de liquidación por grupo (LH-xxxxx)
    const codigosResult = await poolFact.request()
      .input("Desde", sql.Date, from)
      .input("Hasta", sql.Date, to)
      .query(`
        SELECT c.Codigo, d.Evaluador, d.Compania, d.Sede
        FROM dbo.LiquidacionHonorariosDet d
        INNER JOIN dbo.LiquidacionHonorariosCab c ON d.IdLiquidacion = c.IdLiquidacion
        WHERE (c.Estado IS NULL OR c.Estado = 'VIGENTE') AND c.Desde = @Desde AND c.Hasta = @Hasta
      `);
    
    const codigosPorGrupo = new Map();
    (codigosResult.recordset || []).forEach(r => {
       const k = `${(r.Evaluador||"").trim()}||${(r.Compania||"").trim()}||${(r.Sede||"").trim()}`.toUpperCase();
       if (!codigosPorGrupo.has(k)) codigosPorGrupo.set(k, r.Codigo);
    });

    // 5. Normalizar y Unificar
    const details = [];

    // a) Filas del SP
    for (const r of rows) {
      const nro = (r.Nro||"").trim();
      const doc = (r["N° Documento"]||"").trim();
      const key = `${nro}||${doc}`;
      
      details.push({
        nro, documento: doc,
        fechaInicio: r["Fecha Inicio"],
        evaluador: r["Evaluador"] || "SIN FIRMA",
        especialidad: r["Especialidad"] || "",
        compania: r["Compañia Médica"] || "",
        sedeNombre: r["Sede"] || "",
        paciente: r["Paciente"] || "",
        descripcionPrestacion: r["Descripción de la Prestación"] || "",
        importe: Number(r["Costo CB"] || 0), 
        razonSocial: r["RAZÓN SOCIAL"] || "",
        estadoPrestacion: r["Estado Prestacion"] || "",
        tipoEvaluacion: r["Tipo de Examen"] || "",
        
        isPendiente: pendientesSet.has(key),
        estaLiquidado: liquidadosSet.has(key),
        origenPendiente: false
      });
    }

    // b) Pendientes Arrastrados
    for (const p of pendientesExtra) {
      const nro = (p.Nro||"").trim();
      const doc = (p.Documento||"").trim();
      const key = `${nro}||${doc}`;

      if (details.some(d => `${d.nro}||${d.documento}` === key)) continue;

      const estaLiquidado = liquidadosSet.has(key);
      const isPendiente = !estaLiquidado && (p.Estado === 'PENDIENTE');
      
      let sNombre = p.Sede || "";
      if (!sNombre && nro) sNombre = mapSedeFromNro(nro).sedeNombre;

      details.push({
        nro, documento: doc,
        fechaInicio: p.FechaInicio || p.Desde,
        evaluador: p.Evaluador || "SIN FIRMA",
        especialidad: "", 
        compania: p.Compania || "",
        sedeNombre: sNombre,
        paciente: "", 
        descripcionPrestacion: "(Pendiente arrastrado)",
        importe: Number(p.Importe??0),
        razonSocial: "",
        estadoPrestacion: "PENDIENTE",
        tipoEvaluacion: "",
        
        isPendiente: isPendiente && pendientesSet.has(key),
        estaLiquidado: estaLiquidado,
        origenPendiente: !estaLiquidado
      });
    }

    // 6. Agrupar (Evaluador -> Compañía -> Sede)
    const groupMap = new Map();
    for (const row of details) {
      const k = `${row.evaluador}||${row.compania}||${row.sedeNombre}`;
      let grp = groupMap.get(k);
      if (!grp) {
        grp = {
          id: k,
          evaluador: row.evaluador,
          compania: row.compania,
          sedeNombre: row.sedeNombre,
          fechaInicioMin: row.fechaInicio,
          importeTotal: 0,
          importeDisponible: 0,
          importeLiquidado: 0,
          rows: [],
          tienePendientes: false,
          tieneLiquidados: false
        };
        groupMap.set(k, grp);
      }

      if (row.isPendiente) grp.tienePendientes = true;
      if (row.estaLiquidado) grp.tieneLiquidados = true;
      
      const monto = Number(row.importe||0);
      grp.importeTotal += monto;
      
      if (row.estaLiquidado) grp.importeLiquidado += monto;
      else if (!row.isPendiente) grp.importeDisponible += monto;

      grp.rows.push(row);
      if (row.fechaInicio && (!grp.fechaInicioMin || new Date(row.fechaInicio) < new Date(grp.fechaInicioMin))) {
        grp.fechaInicioMin = row.fechaInicio;
      }
    }

    // 7. Calcular Estados y Códigos
    for (const grp of groupMap.values()) {
      if (grp.tieneLiquidados) {
        if (grp.importeDisponible > 0) grp.estadoLiquidado = "PARCIAL";
        else if (grp.tienePendientes) grp.estadoLiquidado = "PARCIAL";
        else grp.estadoLiquidado = "LIQUIDADO";
      } else {
        grp.estadoLiquidado = "NO";
      }

      if (grp.estadoLiquidado === "LIQUIDADO") grp.importe = grp.importeTotal;
      else if (grp.estadoLiquidado === "PARCIAL") grp.importe = grp.importeLiquidado;
      else grp.importe = grp.importeDisponible;

      const kCod = `${grp.evaluador}||${grp.compania}||${grp.sedeNombre}`.toUpperCase().trim();
      grp.codigo = codigosPorGrupo.get(kCod) || null;
    }

    const groups = Array.from(groupMap.values()).sort((a,b) => (a.evaluador||"").localeCompare(b.evaluador||""));
    const detailsByGroupId = {};
    groups.forEach(g => {
       detailsByGroupId[g.id] = g.rows;
       delete g.rows; 
    });

    const evaluadoresSet = new Set(details.map(d=>d.evaluador));
    const companiasSet = new Set(details.map(d=>d.compania));
    const sedesSet = new Set(details.map(d=>d.sedeNombre));

    return res.json({
      ok: true,
      groups,
      detailsByGroupId,
      filters: {
        evaluadores: Array.from(evaluadoresSet).sort(),
        companias: Array.from(companiasSet).sort(),
        sedes: Array.from(sedesSet).sort(),
      }
    });

  } catch (err) {
    console.error("Error honorarios process:", err);
    return res.status(500).json({ ok: false, message: "Error al procesar honorarios." });
  }
});

// =====================================================================
// POST /liquidar (Honorarios) - Batch Insert
// =====================================================================
router.post("/liquidar", async (req, res) => {
  try {
    const { from, to, rows, usuario } = req.body;
    if (!rows || !rows.length) return res.status(400).json({ ok: false, message: "Sin datos." });

    let subtotal = 0;
    const pacientesUnique = new Set();
    const gruposUnique = new Set();

    for (const r of rows) {
      subtotal += Number(r.importe || 0);
      pacientesUnique.add(`${(r.nro || "").trim()}||${(r.documento || "").trim()}`);
      gruposUnique.add(`${r.evaluador}||${r.compania}||${r.sedeNombre}`);
    }

    const igv = subtotal * 0.18;
    const total = subtotal + igv;
    const grupos = gruposUnique.size;
    const pacientes = pacientesUnique.size;

    const pool = await getPool(); 
    
    // Generar Código LH-XXXXX
    const codeResult = await pool.request().query(`
      SELECT MAX(CAST(SUBSTRING(Codigo, 4, 10) AS INT)) AS lastNum
      FROM dbo.LiquidacionHonorariosCab WHERE Codigo LIKE 'LH-%'
    `);
    const lastNum = codeResult.recordset?.[0]?.lastNum || 0;
    const codigo = `LH-${String(lastNum + 1).padStart(5, "0")}`;

    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      const IdLiquidacion = crypto.randomUUID();

      await new sql.Request(tx)
        .input("Id", sql.UniqueIdentifier, IdLiquidacion)
        .input("Desde", sql.Date, from)
        .input("Hasta", sql.Date, to)
        .input("User", sql.NVarChar, usuario || "")
        .input("Sub", sql.Decimal(18,2), subtotal)
        .input("IGV", sql.Decimal(18,2), igv)
        .input("Tot", sql.Decimal(18,2), total)
        .input("Gr", sql.Int, grupos)
        .input("Pac", sql.Int, pacientes)
        .input("Cod", sql.NVarChar, codigo)
        .query(`
          INSERT INTO dbo.LiquidacionHonorariosCab 
          (IdLiquidacion, FechaLiquidacion, Desde, Hasta, Usuario, Subtotal, IGV, Total, Grupos, Pacientes, Codigo, Estado)
          VALUES (@Id, SYSDATETIME(), @Desde, @Hasta, @User, @Sub, @IGV, @Tot, @Gr, @Pac, @Cod, 'VIGENTE')
        `);

      const BATCH_SIZE = 50;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const reqBatch = new sql.Request(tx);
        const valueStrings = [];

        chunk.forEach((row, idx) => {
          let fecha = null;
          if (row.fechaInicio) {
             const d = new Date(row.fechaInicio);
             if (!isNaN(d.getTime())) fecha = d; 
          }

          reqBatch.input(`Id_${idx}`, sql.UniqueIdentifier, IdLiquidacion);
          reqBatch.input(`Nr_${idx}`, sql.NVarChar, row.nro || "");
          reqBatch.input(`Doc_${idx}`, sql.NVarChar, row.documento || "");
          reqBatch.input(`Pac_${idx}`, sql.NVarChar, row.paciente || "");
          reqBatch.input(`Eva_${idx}`, sql.NVarChar, row.evaluador || "");
          reqBatch.input(`Esp_${idx}`, sql.NVarChar, row.especialidad || "");
          reqBatch.input(`Cia_${idx}`, sql.NVarChar, row.compania || "");
          reqBatch.input(`Sed_${idx}`, sql.NVarChar, row.sedeNombre || "");
          reqBatch.input(`Fec_${idx}`, sql.Date, fecha);
          reqBatch.input(`Des_${idx}`, sql.NVarChar, row.descripcionPrestacion || "");
          reqBatch.input(`Imp_${idx}`, sql.Decimal(18, 2), Number(row.importe || 0));
          reqBatch.input(`Raz_${idx}`, sql.NVarChar, row.razonSocial || "");
          reqBatch.input(`Est_${idx}`, sql.NVarChar, row.estadoPrestacion || "");
          reqBatch.input(`Tip_${idx}`, sql.NVarChar, row.tipoEvaluacion || "");

          valueStrings.push(`(
            @Id_${idx}, @Nr_${idx}, @Doc_${idx}, @Pac_${idx}, @Eva_${idx}, 
            @Esp_${idx}, @Cia_${idx}, @Sed_${idx}, @Fec_${idx}, @Des_${idx}, 
            @Imp_${idx}, @Raz_${idx}, @Est_${idx}, @Tip_${idx}
          )`);
        });

        await reqBatch.query(`
          INSERT INTO dbo.LiquidacionHonorariosDet 
          (IdLiquidacion, Nro, Documento, Paciente, Evaluador, Especialidad, Compania, Sede, 
           FechaInicio, DescripcionPrestacion, Importe, RazonSocial, EstadoPrestacion, TipoEvaluacion)
          VALUES ${valueStrings.join(", ")}
        `);
      }

      await tx.commit();
      return res.json({ ok: true, codigo });
    } catch (errTx) {
      if (!tx._aborted) await tx.rollback();
      throw errTx;
    }
  } catch (err) {
    console.error("Error liquidar honorarios:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// =====================================================================
// POST /exclusions (Honorarios)
// =====================================================================
router.post("/exclusions", async (req, res) => {
  try {
    const { from, to, items } = req.body;
    if (!items || !items.length) return res.status(400).json({ ok: false });

    const pool = await getPool(); 
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      for (const it of items) {
        const nro = (it.nro||"").trim();
        const doc = (it.documento||"").trim();
        if(!nro) continue;

        const rq = new sql.Request(tx);
        rq.input("Desde", sql.Date, from).input("Hasta", sql.Date, to).input("Nro", sql.NVarChar, nro).input("Doc", sql.NVarChar, doc);

        if (it.exclude) {
           let fecha = null;
           if(it.fechaInicio) { const d = new Date(it.fechaInicio); if(!isNaN(d.getTime())) fecha = d; }
           
           await rq.input("Pac", sql.NVarChar, it.paciente||"")
             .input("Eva", sql.NVarChar, it.evaluador||"")
             .input("Cia", sql.NVarChar, it.compania||"")
             .input("Sed", sql.NVarChar, it.sedeNombre||"")
             .input("Fec", sql.Date, fecha)
             .input("Imp", sql.Decimal(18,2), Number(it.importe||0))
             .input("Usu", sql.NVarChar, it.createdBy||"")
             .query(`
               IF NOT EXISTS (SELECT 1 FROM dbo.LiquidacionHonorariosPendientes WHERE Nro=@Nro AND Documento=@Doc AND Desde=@Desde AND Hasta=@Hasta AND Estado='PENDIENTE')
               BEGIN
                 INSERT INTO dbo.LiquidacionHonorariosPendientes (Desde, Hasta, Nro, Documento, Paciente, Evaluador, Compania, Sede, FechaInicio, Importe, Usuario)
                 VALUES (@Desde, @Hasta, @Nro, @Doc, @Pac, @Eva, @Cia, @Sed, @Fec, @Imp, @Usu)
               END
             `);
        } else {
           await rq.query(`UPDATE dbo.LiquidacionHonorariosPendientes SET Estado='REACTIVADO' WHERE Nro=@Nro AND Documento=@Doc AND Desde=@Desde AND Hasta=@Hasta AND Estado='PENDIENTE'`);
        }
      }
      await tx.commit();
      return res.json({ ok: true });
    } catch (errTx) {
      if (!tx._aborted) await tx.rollback();
      throw errTx;
    }
  } catch (err) {
    console.error("Error exclusions hon:", err);
    return res.status(500).json({ ok: false });
  }
});

// =====================================================================
// POST /export (Honorarios - DIRECTO DESDE DATA FRONTEND)
// =====================================================================
router.post("/export", async (req, res) => {
  try {
    const { rows } = req.body; // Ahora recibimos las filas ya procesadas
    if (!rows || !Array.isArray(rows) || !rows.length) return res.status(400).send("Sin datos.");

    // 1. Agrupar por Evaluador -> Compañía (Usando los datos recibidos)
    const groupMap = new Map();

    rows.forEach(r => {
        // Usamos los campos que vienen del frontend
        // Mapeo seguro de campos (frontend name -> excel needs)
        const evaluador = r.evaluador || "SIN FIRMA";
        const compania = r.compania || "";
        const importe = Number(r.importe || 0);

        const key = `${evaluador}||${compania}`;
        
        if(!groupMap.has(key)) {
            groupMap.set(key, { 
              evaluador, 
              compania, 
              rows: [], 
              importeTotal: 0 
            });
        }
        const g = groupMap.get(key);
        g.rows.push(r);
        g.importeTotal += importe;
    });

    // 2. Generar Excel
    const workbook = new ExcelJS.Workbook();
    const usedSheetNames = new Set();
    let index = 1;

    // Ordenar grupos alfabéticamente por evaluador
    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => a.evaluador.localeCompare(b.evaluador));

    for (const grp of sortedGroups) {
       // Nombre de hoja limpio
       let baseName = `${grp.evaluador.split(',')[0]} - ${grp.compania}`.substring(0, 30).replace(/[\\/?*[\]]/g, "");
       if (!baseName.trim()) baseName = `Grupo ${index}`;
       
       let sheetName = baseName;
       let suffix = 2;
       while (usedSheetNames.has(sheetName)) sheetName = `${baseName} (${suffix++})`;
       usedSheetNames.add(sheetName);
       
       const ws = workbook.addWorksheet(sheetName);

       // Cabecera
       const headerRow = ws.addRow([
         "Fecha Inicio", "Tipo de Examen", "N° Documento", "Paciente", "Descripción de la Prestación", 
         "Evaluador", "Especialidad", "Compañia Médica", "Costo CB", "RAZÓN SOCIAL", "Estado Prestacion", "Sede"
       ]);
       
       headerRow.font = { bold: true };
       headerRow.eachCell(cell => {
           cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } }; // Azul claro
           cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
       });

       // Filas
       grp.rows.forEach(r => {
           // Formatear fecha si viene completa
           let fechaStr = r.fechaInicio || "";
           if (fechaStr && fechaStr.length > 10) fechaStr = fechaStr.slice(0, 10);

           ws.addRow([
               fechaStr,
               r.tipoEvaluacion || "", // En front se llama 'tipoEvaluacion'
               r.documento || "",
               r.paciente || "",
               r.descripcionPrestacion || "",
               grp.evaluador, // Usamos el del grupo para uniformidad
               r.especialidad || "",
               grp.compania,  // Usamos el del grupo
               Number(r.importe || 0), // En front se llama 'importe' -> va a Costo CB
               r.razonSocial || "",
               r.estadoPrestacion || "",
               r.sedeNombre || ""
           ]);
       });

       // Totales al final
       ws.addRow([]); // Espacio
       const sub = grp.importeTotal;
       const igv = sub * 0.18;
       const tot = sub + igv;
       
       ws.addRow(["", "", "", "", "", "", "", "SUBTOTAL", sub]).font = { bold: true };
       ws.addRow(["", "", "", "", "", "", "", "IGV (18%)", igv]).font = { bold: true };
       const rowTot = ws.addRow(["", "", "", "", "", "", "", "TOTAL", tot]);
       rowTot.font = { bold: true };
       rowTot.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } }; // Amarillo

       // Ancho de columnas
       ws.columns.forEach(col => { col.width = 20; });
       index++;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Disposition", `attachment; filename="honorarios.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error("Error export hon:", err);
    return res.status(500).send("Error interno al exportar.");
  }
});

// =====================================================================
// ¡NO OLVIDES ESTA LÍNEA AL FINAL!
// =====================================================================
export default router;