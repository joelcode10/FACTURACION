// backend/src/routes/clientes.js
import { Router } from "express";
import { getPoolCbmedic, getPool, sql } from "../util/db.js";
import ExcelJS from "exceljs";
import crypto from "crypto";
const router = Router();

/**
 * Helper: mapea el sufijo del Nro (_3, _8, _10, _11) a nombre de sede.
 */
function mapTipoEvaluacion(raw) {
  if (!raw) return "PRE OCUPACIONAL"; 
  const t = raw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.includes("PERIOD")) return "PERIODICO";
  if (t.includes("POST") || t.includes("RETIRO")) return "POST OCUPACIONAL";
  if (t.includes("OCUPAC") || t.includes("INGRESO") || t.includes("PRE")) return "PRE OCUPACIONAL";
  return "PRE OCUPACIONAL";
}
function mapSedeFromNro(nroRaw) {
  if (!nroRaw) return { sedeCodigo: null, sedeNombre: null };
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

// ===============================
//  POST /api/clientes/exclusions (CORREGIDO: SECUENCIAL + TRANSACCIÓN SEGURA)
// ===============================
router.post("/exclusions", async (req, res) => {
  try {
    const { from, to, condicionPago, items } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, message: "Sin items." });
    }

    const pool = await getPool(); 
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      // Usamos un bucle for...of para asegurar que las peticiones 
      // entren UNA POR UNA en la transacción y evitar bloqueos.
      for (const it of items) {
        const nro = (it.nro || "").trim();
        // Si no hay número, saltamos
        if (!nro) continue; 

        const documento = (it.documento || "").trim();
        const exclude = !!it.exclude;
        
        // Creamos el Request atado a la transacción actual
        const rq = new sql.Request(tx); 
        
        // Parámetros comunes
        rq.input("Desde", sql.Date, from)
          .input("Hasta", sql.Date, to)
          .input("Nro", sql.NVarChar, nro)
          .input("Documento", sql.NVarChar, documento);

        if (exclude) {
          // -------------------------------------------------------
          // CASO 1: MARCAR COMO "NO LIQUIDAR" (INSERT / PENDIENTE)
          // -------------------------------------------------------
          
          // Validar fecha segura para evitar error
          let fechaInicio = null;
          if (it.fechaInicio) {
             const d = new Date(it.fechaInicio);
             if (!isNaN(d.getTime())) fechaInicio = d;
          }
          
          await rq
            .input("CondicionPago", sql.NVarChar, condicionPago || "TODAS")
            .input("Paciente", sql.NVarChar, it.paciente || "")
            .input("Cliente", sql.NVarChar, it.cliente || "")
            .input("UnidadProduccion", sql.NVarChar, it.unidadProduccion || "")
            .input("TipoEvaluacion", sql.NVarChar, it.tipoEvaluacion || "")
            .input("Sede", sql.NVarChar, it.sedeNombre || "")
            .input("FechaInicio", sql.Date, fechaInicio)
            .input("Importe", sql.Decimal(18, 2), Number(it.importe || 0))
            .input("Usuario", sql.NVarChar, it.createdBy || "")
            .query(`
              IF NOT EXISTS (
                  SELECT 1 FROM dbo.LiquidacionClientesPendientes 
                  WHERE Nro = @Nro 
                    AND ISNULL(Documento,'') = ISNULL(@Documento,'') 
                    AND Desde = @Desde 
                    AND Hasta = @Hasta 
                    AND Estado = 'PENDIENTE'
              )
              BEGIN
                INSERT INTO dbo.LiquidacionClientesPendientes 
                (
                  IdPendiente, Desde, Hasta, CondicionPago, Nro, Documento, Paciente, Cliente, 
                  UnidadProduccion, TipoEvaluacion, Sede, FechaInicio, Importe, Usuario, Estado, CreatedAt
                )
                VALUES 
                (
                  NEWID(), @Desde, @Hasta, @CondicionPago, @Nro, @Documento, @Paciente, @Cliente, 
                  @UnidadProduccion, @TipoEvaluacion, @Sede, @FechaInicio, @Importe, @Usuario, 'PENDIENTE', SYSDATETIME()
                )
              END
            `);
        } else {
          // -------------------------------------------------------
          // CASO 2: REACTIVAR (QUITAR EXCLUSIÓN)
          // -------------------------------------------------------
          await rq.query(`
            UPDATE dbo.LiquidacionClientesPendientes
            SET Estado = 'REACTIVADO', 
                UpdatedAt = SYSDATETIME()
            WHERE Nro = @Nro 
              AND ISNULL(Documento,'') = ISNULL(@Documento,'')
              AND Desde = @Desde 
              AND Hasta = @Hasta 
              AND Estado = 'PENDIENTE'
          `);
        }
      } // Fin del bucle for

      await tx.commit();

      return res.json({ ok: true, message: "Pendientes actualizados." });

    } catch (errTx) {
      // Si falla algo, el rollback funcionará porque no hay peticiones paralelas
      if (!tx._aborted) {
        await tx.rollback();
      }
      console.error("Error en transacción exclusions:", errTx);
      return res.status(500).json({ ok: false, message: "Error al procesar transacción." });
    }

  } catch (err) {
    console.error("Error general exclusions:", err);
    return res.status(500).json({ ok: false, message: "Error interno al guardar." });
  }
});

// =====================================================================
// POST /export (CORREGIDO: Una hoja por Cliente + Importes Exactos)
// =====================================================================
router.post("/export", async (req, res) => {
  try {
    // 1. Recibimos 'rows' directas del frontend (ya filtradas y calculadas)
    // Si el frontend envía 'nros' (versión vieja), mantenemos compatibilidad o forzamos rows.
    // Asumiremos que aplicaste el cambio del frontend y vienen 'rows'.
    let { rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        // Fallback: Si por alguna razón llegan nros, tendríamos que consultar BD, 
        // pero para arreglar el monto exacto, es MEJOR obligar al frontend a mandar rows.
        return res.status(400).send("No se recibieron datos para exportar.");
    }

    // 2. Agrupar por CLIENTE (Para que todo salga en una sola hoja)
    const clientMap = new Map();

    rows.forEach(r => {
        // Clave de agrupación: Solo el Nombre del Cliente
        const clienteName = (r.cliente || r.Cliente || "VARIOS").toUpperCase();
        
        if (!clientMap.has(clienteName)) {
            clientMap.set(clienteName, {
                name: clienteName,
                rows: [],
                totalImporte: 0
            });
        }
        
        const grp = clientMap.get(clienteName);
        grp.rows.push(r);
        grp.totalImporte += Number(r.importe || r.precioCb || r.PrecioCB || 0);
    });

    // 3. Generar Excel
    const workbook = new ExcelJS.Workbook();
    
    // Iteramos por cada CLIENTE (una hoja por cliente)
    for (const clientData of clientMap.values()) {
        // Nombre de hoja seguro (max 31 chars)
        let sheetName = clientData.name.replace(/[\\/?*[\]]/g, "").substring(0, 30);
        // Evitar duplicados de nombre de hoja (raro si agrupamos por cliente, pero por seguridad)
        let uniqueName = sheetName;
        let counter = 1;
        while (workbook.getWorksheet(uniqueName)) {
            uniqueName = `${sheetName.substring(0,25)} ${counter++}`;
        }

        const ws = workbook.addWorksheet(uniqueName);

        // Encabezados
        const headerRow = ws.addRow([
            "Fecha Inicio", 
            "Protocolo", 
            "Cliente", 
            "Tipo Evaluación", 
            "Sede",              // Agregamos Sede aquí ya que estarán mezcladas
            "Unidad Producción", // Agregamos Unidad
            "Documento", 
            "Paciente", 
            "Descripción Prestación", // Si tienes este dato
            "Importe", 
            "Condición Pago",
            "Estado"
        ]);

        // Estilos Encabezado
        headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
        headerRow.eachCell(cell => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "203764" } };
            cell.alignment = { horizontal: "center" };
        });
        const formatFechaUTC = (dateStr) => {
            if (!dateStr) return "-";
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return "-";
            // Usamos getUTC para evitar que reste 5 horas y cambie de día
            const day = String(d.getUTCDate()).padStart(2, '0');
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const year = d.getUTCFullYear();
            return `${day}/${month}/${year}`;
        };
        // Filas
        clientData.rows.sort((a,b) => (a.paciente||"").localeCompare(b.paciente||"")); // Ordenar por paciente

        clientData.rows.forEach(r => {
            ws.addRow([
                formatFechaUTC(r.fechaInicio),
                r.protocolo || r.Protocolo || "",
                r.cliente || "",
                r.tipoEvaluacion || "",
                r.sedeNombre || r.Sede || "",
                r.unidadProduccion || "",
                r.documento || "",
                r.paciente || "",
                r.descripcionPrestacion || "", // Asegúrate que el front mande esto si lo quieres
                Number(r.importe || 0),
                r.condicionPago || "",
                r.estadoPrestacion || ""
            ]);
        });
          
        // Totales al final de la hoja
        ws.addRow([]);
        
        const subtotal = clientData.totalImporte;
        const igv = subtotal * 0.18;
        const total = subtotal + igv;

        // Fila Subtotal
        const rSub = ws.addRow(["", "", "", "", "", "", "", "", "SUBTOTAL", subtotal]);
        rSub.getCell(9).font = { bold: true };
        rSub.getCell(10).numFmt = '"S/"#,##0.00';

        // Fila IGV
        const rIgv = ws.addRow(["", "", "", "", "", "", "", "", "IGV (18%)", igv]);
        rIgv.getCell(9).font = { bold: true };
        rIgv.getCell(10).numFmt = '"S/"#,##0.00';

        // Fila Total
        const rTot = ws.addRow(["", "", "", "", "", "", "", "", "TOTAL", total]);
        rTot.getCell(9).font = { bold: true, size: 12 };
        rTot.getCell(10).font = { bold: true, size: 12 };
        rTot.getCell(10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF00" } };
        rTot.getCell(10).numFmt = '"S/"#,##0.00';

        // Ajustar anchos
        ws.columns.forEach(col => { col.width = 15; });
        ws.getColumn(3).width = 30; // Cliente
        ws.getColumn(8).width = 30; // Paciente
        ws.getColumn(9).width = 30; // Descripcion
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Disposition", `attachment; filename="export_clientes.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error("Error export:", err);
    return res.status(500).send("Error interno al exportar.");
  }
});
// =====================================================================
// POST /liquidar (CORREGIDO: GENERACIÓN DE LLAVES ROBUSTA)
// =====================================================================
router.post("/liquidar", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());
  try {
    const { from, to, condicionPago, rows, groupsMetadata, usuario } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ ok: false, message: "No se recibieron datos." });
    }

    let subtotal = 0;
    const pacientesUnique = new Set();
    const groupsMap = new Map();

    // HELPER BLINDADO: Convierte todo a String, quita espacios y mayúsculas
    const makeKey = (cli, uni, tip, sed) => {
        const c = String(cli || "").trim().toUpperCase();
        const u = String(uni || "").trim().toUpperCase();
        const t = String(tip || "").trim().toUpperCase();
        const s = String(sed || "").trim().toUpperCase();
        return `${c}||${u}||${t}||${s}`;
    };

    const findGroupState = (keyBuscada) => {
        if (!groupsMetadata || !Array.isArray(groupsMetadata)) return 'LIQUIDADO';
        const meta = groupsMetadata.find(m => 
            makeKey(m.cliente, m.unidad, m.tipo, m.sede) === keyBuscada
        );
        return meta ? meta.estado : 'LIQUIDADO';
    };

    const cleanRows = rows.map(r => {
        const importe = Number(r.importe || 0);
        subtotal += importe;
        
        pacientesUnique.add(`${(r.nro || "").trim()}||${(r.documento || "").trim()}`);
        
        // Usamos la llave blindada
        const groupKey = makeKey(r.cliente, r.unidadProduccion, r.tipoEvaluacion, r.sedeNombre);
        
        if (!groupsMap.has(groupKey)) {
            const estadoReal = findGroupState(groupKey);
            groupsMap.set(groupKey, {
                // Guardamos los textos limpios para evitar basura en la BD
                cliente: String(r.cliente || "").trim(),
                unidad: String(r.unidadProduccion || "").trim(),
                tipo: String(r.tipoEvaluacion || "").trim(),
                sede: String(r.sedeNombre || "").trim(),
                importe: 0,
                estado: estadoReal 
            });
        }
        groupsMap.get(groupKey).importe += importe;

        return {
            ...r,
            fechaInicio: r.fechaInicio ? new Date(r.fechaInicio).toISOString() : null,
            importe: importe,
            nro: (r.nro || "").trim(),
            documento: (r.documento || "").trim(),
            idPendiente: r.idPendiente || null 
        };
    });

    const cleanGroups = Array.from(groupsMap.values());
    const jsonGroups = JSON.stringify(cleanGroups);
    const jsonRows = JSON.stringify(cleanRows);

    const igv = subtotal * 0.18;
    const total = subtotal + igv;
    const gruposCount = groupsMap.size;
    const pacientesCount = pacientesUnique.size;

    const poolFact = await getPool();
    const codeResult = await poolFact.request().query(`SELECT MAX(CAST(SUBSTRING(Codigo, 4, 10) AS INT)) AS lastNum FROM dbo.LiquidacionClientesCab WHERE Codigo LIKE 'LQ-%'`);
    const lastNum = codeResult.recordset?.[0]?.lastNum || 0;
    const codigo = `LQ-${String(lastNum + 1).padStart(5, "0")}`;

    await transaction.begin();
    const IdLiquidacion = crypto.randomUUID();

    await new sql.Request(transaction)
      .input("IdLiquidacion", sql.UniqueIdentifier, IdLiquidacion)
      .input("Desde", sql.Date, from)
      .input("Hasta", sql.Date, to)
      .input("CondicionPago", sql.NVarChar, condicionPago || "TODAS")
      .input("Usuario", sql.NVarChar, usuario || "")
      .input("Subtotal", sql.Decimal(18, 2), subtotal)
      .input("IGV", sql.Decimal(18, 2), igv)
      .input("Total", sql.Decimal(18, 2), total)
      .input("Grupos", sql.Int, gruposCount)
      .input("Pacientes", sql.Int, pacientesCount)
      .input("Codigo", sql.NVarChar, codigo)
      .query(`INSERT INTO dbo.LiquidacionClientesCab (IdLiquidacion, FechaLiquidacion, Desde, Hasta, CondicionPago, Usuario, Subtotal, IGV, Total, Grupos, Pacientes, Codigo, Estado) VALUES (@IdLiquidacion, SYSDATETIME(), @Desde, @Hasta, @CondicionPago, @Usuario, @Subtotal, @IGV, @Total, @Grupos, @Pacientes, @Codigo, 'VIGENTE')`);

    const reqBulk = new sql.Request(transaction);
    await reqBulk
        .input("IdLiq", sql.UniqueIdentifier, IdLiquidacion)
        .input("JsonRows", sql.NVarChar(sql.MAX), jsonRows)
        .input("JsonGroups", sql.NVarChar(sql.MAX), jsonGroups)
        .query(`
            INSERT INTO dbo.LiquidacionClientesGrupos (IdLiquidacion, Cliente, UnidadProduccion, TipoEvaluacion, Sede, Importe, Estado)
            SELECT @IdLiq, Cliente, Unidad, Tipo, Sede, Importe, Estado
            FROM OPENJSON(@JsonGroups) WITH (Cliente NVARCHAR(200) '$.cliente', Unidad NVARCHAR(200) '$.unidad', Tipo NVARCHAR(200) '$.tipo', Sede NVARCHAR(100) '$.sede', Importe DECIMAL(18,2) '$.importe', Estado NVARCHAR(20) '$.estado');

            INSERT INTO dbo.LiquidacionClientesDet (IdLiquidacion, Nro, Documento, Paciente, Cliente, UnidadProduccion, TipoEvaluacion, Sede, Protocolo, FechaInicio, DescripcionPrestacion, Importe, CondicionPago, RucCliente, RazonSocial, Evaluador)
            SELECT @IdLiq, Nro, Documento, Paciente, Cliente, UnidadProduccion, TipoEvaluacion, Sede, Protocolo, FechaInicio, DescripcionPrestacion, Importe, CondicionPago, RucCliente, RazonSocial, Evaluador
            FROM OPENJSON(@JsonRows) WITH (Nro NVARCHAR(50) '$.nro', Documento NVARCHAR(20) '$.documento', Paciente NVARCHAR(200) '$.paciente', Cliente NVARCHAR(200) '$.cliente', UnidadProduccion NVARCHAR(200) '$.unidadProduccion', TipoEvaluacion NVARCHAR(200) '$.tipoEvaluacion', Sede NVARCHAR(100) '$.sedeNombre', Protocolo NVARCHAR(200) '$.protocolo', FechaInicio DATE '$.fechaInicio', DescripcionPrestacion NVARCHAR(300) '$.descripcionPrestacion', Importe DECIMAL(18,2) '$.importe', CondicionPago NVARCHAR(50) '$.condicionPago', RucCliente NVARCHAR(20) '$.rucCliente', RazonSocial NVARCHAR(200) '$.razonSocial', Evaluador NVARCHAR(200) '$.evaluador');

            UPDATE P SET Estado = 'LIQUIDADO', UpdatedAt = SYSDATETIME()
            FROM dbo.LiquidacionClientesPendientes P
            INNER JOIN OPENJSON(@JsonRows) WITH (IdPendiente UNIQUEIDENTIFIER '$.idPendiente', Nro NVARCHAR(50) '$.nro', Documento NVARCHAR(20) '$.documento') J 
            ON ((J.IdPendiente IS NOT NULL AND P.IdPendiente = J.IdPendiente) OR (J.IdPendiente IS NULL AND LTRIM(RTRIM(P.Nro)) = LTRIM(RTRIM(J.Nro)) AND LTRIM(RTRIM(ISNULL(P.Documento, ''))) = LTRIM(RTRIM(ISNULL(J.Documento, '')))))
            WHERE P.Estado = 'PENDIENTE';
        `);

    await transaction.commit();
    return res.json({ ok: true, message: "Liquidación exitosa.", codigo });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("Error liquidar:", err);
    return res.status(500).json({ ok: false, message: "Error al procesar la liquidación." });
  }
});
// =====================================================================
// GET /process (CORREGIDO: MATCHING PERFECTO PARA RECUPERAR IMPORTES)
// =====================================================================
router.get("/process", async (req, res) => {
  try {
    const { from, to, condicionPago } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, message: "Faltan fechas." });

    const poolCb = await getPoolCbmedic();
    const poolFact = await getPool(); 

    // HELPER BLINDADO: Idéntico al del POST
    const makeKey = (cli, uni, tip, sed) => {
        const c = String(cli || "").trim().toUpperCase();
        const u = String(uni || "").trim().toUpperCase();
        const t = String(tip || "").trim().toUpperCase();
        const s = String(sed || "").trim().toUpperCase();
        return `${c}||${u}||${t}||${s}`;
    };

    // 1. SP PRINCIPAL
    const resultSP = await poolCb.request()
      .input("FechaDesde", sql.Date, from)
      .input("FechaHasta", sql.Date, to)
      .input("CondicionPago", sql.VarChar(20), condicionPago || "TODAS")
      .query(`EXEC dbo.pa_liq_clientes_rango_export @FechaDesde, @FechaHasta, @CondicionPago`);
    let rowsFromSP = (resultSP.recordset || []).map(r => ({ ...r, _isRescue: false }));

    // 2. RESCATE
    const year = new Date(from).getFullYear();
    const startOfYear = `${year}-01-01`;
    let rowsRescue = [];
    if (from > startOfYear) {
        const rescueQuery = `
          SELECT 
            Nro = CONVERT(VARCHAR(20), v.val_aten_codigo) + '_' + CONVERT(VARCHAR(20), v.val_aten_estab),
            [Fecha Inicio] = ia.aten_fecha_evaluacion,
            [Protocolo] = pa.plan_denominacion,
            [Tipo de Evaluación] = CASE WHEN UPPER(ISNULL(mte.tipexam_denominacion, '')) LIKE '%PRE%' THEN 'PRE OCUPACIONAL' WHEN UPPER(ISNULL(mte.tipexam_denominacion, '')) LIKE '%POST%' THEN 'POST OCUPACIONAL' WHEN UPPER(ISNULL(mte.tipexam_denominacion, '')) LIKE '%PERIOD%' THEN 'PERIODICO' ELSE 'PRE OCUPACIONAL' END,
            [Documento] = p.paci_documento_identidad,
            [Paciente] = p.paci_ap_paterno + ' ' + p.paci_ap_materno + ', ' + p.paci_nombres,
            [Importe] = ISNULL(vap.vp_precio_plan, ISNULL(vsm.vsm_precio_plan, vam.vm_precio_plan)),
            [Condición de Pago] = ISNULL(emp.empresa_fax, ''), 
            [Cliente] = emp.empresa_razon_social,
            [Unidad de Producción] = up.unidad_denominacion,
            [Sede] = CASE CONVERT(VARCHAR(10), v.val_aten_estab) WHEN '3' THEN 'EMO - MEGA PLAZA' WHEN '8' THEN 'IN HOUSE OCUPACIONAL' WHEN '10' THEN 'EMO - GUARDIA' WHEN '11' THEN 'INTEGRAMEDICA (MEGA PLAZA)' ELSE NULL END,
            [Descripción de la Prestación] = ISNULL(vap.vp_denominacion, ISNULL(vsm.vsm_smodulod, vam.vm_modulod)),
            [Estado de la Prestación] = 'ATENDIDO',
            [EstadoRescate] = lcp.Estado, [IdPendiente] = lcp.IdPendiente
          FROM valorizacion v
          INNER JOIN ind_atencion ia ON ia.aten_numero = v.val_aten_codigo AND ia.aten_establecimiento = v.val_aten_estab
          INNER JOIN plan_atencion pa ON v.val_plan = pa.plan_id
          INNER JOIN mae_tipo_examen mte ON v.val_tipo = mte.tipexam_codigo
          INNER JOIN paciente p ON v.val_paciente = p.paci_id
          INNER JOIN val_atencion_modulo vam ON vam.vm_vestab = v.val_estab AND vam.vm_vnumero = v.val_codigo
          LEFT JOIN val_atencion_smodulo vsm ON vsm.vsm_vestab = vam.vm_vestab AND vsm.vsm_vnumero = vam.vm_vnumero AND vsm.vsm_modulo = vam.vm_modulo AND vsm.vsm_modulo IN (6,4,15,5)
          LEFT JOIN val_atencion_prueba vap ON vap.vp_vestab = vsm.vsm_vestab AND vap.vp_vnumero = vsm.vsm_vnumero AND vap.vp_modulo = vsm.vsm_modulo AND vap.vp_submod = vsm.vsm_smodulo 
          INNER JOIN ubicacion_trabajo ut ON ut.ubicacion_id = v.val_ubicacion
          INNER JOIN empresa emp ON ut.ubicacion_empresa_id = emp.empresa_id
          INNER JOIN unidad_produccion up ON ut.ubicacion_unidad_id = up.unidad_id
          INNER JOIN FacturacionCBMedic.dbo.LiquidacionClientesPendientes lcp ON LTRIM(RTRIM(lcp.Nro)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(CONVERT(VARCHAR(20), v.val_aten_codigo) + '_' + CONVERT(VARCHAR(20), v.val_aten_estab))) COLLATE DATABASE_DEFAULT AND LTRIM(RTRIM(ISNULL(lcp.Documento, ''))) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(ISNULL(p.paci_documento_identidad, ''))) COLLATE DATABASE_DEFAULT
          WHERE v.val_anulado = 'N' AND vam.vm_eliminado = 'N' AND v.val_aten_estab IN (3, 8, 10, 11) AND NOT (vam.vm_modulo <> 1 AND vsm.vsm_smodulo IS NULL) AND lcp.Estado IN ('PENDIENTE', 'LIQUIDADO') AND ia.aten_fecha_evaluacion >= @StartOfYear AND ia.aten_fecha_evaluacion < @FechaDesde
        `;
        try {
            const resRescue = await poolCb.request().input("StartOfYear", sql.Date, startOfYear).input("FechaDesde", sql.Date, from).query(rescueQuery);
            rowsRescue = (resRescue.recordset || []).map(r => ({ ...r, _isRescue: true }));
        } catch(e) { rowsRescue = []; }
    }

    // 3. LIQUIDADOS
    const liqQuery = `SELECT d.Nro, d.Documento, d.FechaInicio, d.Protocolo, d.Cliente, d.UnidadProduccion, d.TipoEvaluacion, d.Sede, d.Paciente, d.Importe, d.CondicionPago, [Descripción de la Prestación] = d.DescripcionPrestacion, [Estado de la Prestación] = 'ATENDIDO' FROM dbo.LiquidacionClientesDet d INNER JOIN dbo.LiquidacionClientesCab c ON d.IdLiquidacion = c.IdLiquidacion WHERE c.Estado = 'VIGENTE' AND d.FechaInicio >= @From AND d.FechaInicio <= @To`;
    const resLiq = await poolFact.request().input("From", sql.Date, from).input("To", sql.Date, to).query(liqQuery);
    let rowsLiquidated = (resLiq.recordset || []).map(r => ({ ...r, _source: 'LIQ' }));

    // 4. PENDIENTES
    const pendResult = await poolFact.request().input("Desde", sql.Date, startOfYear).input("Hasta", sql.Date, to).query(`SELECT Nro, Documento FROM dbo.LiquidacionClientesPendientes WHERE Estado='PENDIENTE'`);
    const pendientesSet = new Set(pendResult.recordset.map(p => `${(p.Nro||"").trim()}||${(p.Documento||"").trim()}`));

    // 5. CÓDIGOS Y ESTADOS REALES (Usando Helper Key)
    const codigosResult = await poolFact.request().input("Desde", sql.Date, from).input("Hasta", sql.Date, to).query(`
        SELECT c.Codigo, c.FechaLiquidacion, g.Cliente, g.UnidadProduccion, g.TipoEvaluacion, g.Sede, g.Estado, g.Importe 
        FROM dbo.LiquidacionClientesGrupos g
        JOIN dbo.LiquidacionClientesCab c ON g.IdLiquidacion = c.IdLiquidacion 
        WHERE c.Estado = 'VIGENTE' AND ((c.Desde <= @Hasta AND c.Hasta >= @Desde))
        ORDER BY c.FechaLiquidacion ASC, c.Codigo ASC
    `);
    const groupsDbMap = new Map();
    (codigosResult.recordset || []).forEach(r => {
       const tipo = mapTipoEvaluacion(r.TipoEvaluacion || "");
       const k = makeKey(r.Cliente, r.UnidadProduccion, tipo, r.Sede);
       if (!groupsDbMap.has(k)) groupsDbMap.set(k, { codigo: r.Codigo, estado: r.Estado, importeTotal: 0 });
       const g = groupsDbMap.get(k);
       g.importeTotal += Number(r.Importe || 0);
       g.codigo = r.Codigo; g.estado = r.Estado; 
    });

    // 6. MERGE Y DETALLES
    const mergedMap = new Map();
    const getUniqueKey = (r) => {
        const nro = (r.Nro||"").trim();
        const doc = (r["Documento"]||r["N° Documento"]||"").trim();
        const rawDesc = (r["Descripción de la Prestación"] || r["DescripcionPrestacion"] || "GENERICO");
        const desc = String(rawDesc).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, ""); 
        return `${nro}|${doc}|${desc}`; 
    };
    [...rowsRescue, ...rowsFromSP].forEach(r => { const key = getUniqueKey(r); mergedMap.set(key, { ...r, _isLiquidado: false }); });
    rowsLiquidated.forEach(r => { const key = getUniqueKey(r); if (mergedMap.has(key)) mergedMap.set(key, { ...mergedMap.get(key), _forceLiquidated: true }); else mergedMap.set(key, { ...r, _isLiquidado: true }); });

    const details = [];
    for (const r of mergedMap.values()) {
      if (condicionPago && condicionPago !== "TODAS") {
         const cp = (r["Condición de Pago"] || "").toUpperCase();
         if (cp !== condicionPago) continue;
      }
      const nro = (r.Nro||"").trim(); const doc = (r["Documento"]||r["N° Documento"]||"").trim(); const keyShort = `${nro}||${doc}`;
      let estaLiquidado = !!r._forceLiquidated || !!r._isLiquidado;
      if (r._isRescue && r["EstadoRescate"] === 'LIQUIDADO') estaLiquidado = true;
      const esRescate = r._isRescue === true;
      const esPendienteManual = pendientesSet.has(keyShort);
      const isPendienteFinal = estaLiquidado ? false : (esRescate ? false : esPendienteManual);

      details.push({
        nro, documento: doc, 
        fechaInicio: r["Fecha Inicio"], 
        cliente: r["Cliente"] || r["RAZÓN SOCIAL"] || "", 
        unidadProduccion: r["Unidad de Producción"] || "", 
        tipoEvaluacion: mapTipoEvaluacion(r["Tipo de Evaluación"]||""), 
        condicionPago: r["Condición de Pago"] || "", 
        paciente: r["Paciente"] || "", 
        descripcionPrestacion: r["Descripción de la Prestación"] || r["DescripcionPrestacion"] || "", 
        precioCb: Number(r["Importe"] || r["Precio CB"] || 0), 
        sedeNombre: r["Sede"] ? r["Sede"] : mapSedeFromNro(r.Nro).sedeNombre, 
        estadoPrestacion: r["Estado de la Prestación"] || "ATENDIDO", 
        protocolo: r["Protocolo"] || "",
        isPendiente: isPendienteFinal, 
        estaLiquidado: estaLiquidado, 
        origenPendiente: esRescate && !estaLiquidado, 
        idPendiente: r["IdPendiente"] || null
      });
    }

    // 7. AGRUPAMIENTO FINAL
    const groupMap = new Map();
    for (const row of details) {
      const k = makeKey(row.cliente, row.unidadProduccion, row.tipoEvaluacion, row.sedeNombre);
      let grp = groupMap.get(k);
      if (!grp) { grp = { id: k, cliente: row.cliente, unidadProduccion: row.unidadProduccion, tipoEvaluacion: row.tipoEvaluacion, sedeNombre: row.sedeNombre, importeTotal: 0, importeLiquidado: 0, importeDisponible: 0, rows: [] }; groupMap.set(k, grp); }
      const monto = Number(row.precioCb||0); grp.importeTotal += monto;
      if (row.estaLiquidado) grp.importeLiquidado += monto; else if (row.isPendiente) {} else grp.importeDisponible += monto;
      grp.rows.push(row);
    }

    for (const grp of groupMap.values()) {
        grp.estadoLiquidado = "NO";
        if (groupsDbMap.has(grp.id)) {
            const dbInfo = groupsDbMap.get(grp.id);
            grp.codigo = dbInfo.codigo;
            
            // Prioridad: Si BD dice PARCIAL o hay disponible nuevo -> PARCIAL
            if (dbInfo.estado === "PARCIAL" || grp.importeDisponible > 0.50) {
                 grp.estadoLiquidado = "PARCIAL";
                 grp.importe = dbInfo.importeTotal + grp.importeDisponible;
            } else {
                 grp.estadoLiquidado = "LIQUIDADO";
                 grp.importe = dbInfo.importeTotal;
            }
        } else {
            grp.importe = grp.importeDisponible;
        }
    }

    const groups = Array.from(groupMap.values()).sort((a,b) => (a.cliente||"").localeCompare(b.cliente||""));
    const detailsByGroupId = {};
    groups.forEach(g => { detailsByGroupId[g.id] = g.rows; delete g.rows; });
    const clientesSet = new Set(details.map(d=>d.cliente)); const tiposSet = new Set(details.map(d=>d.tipoEvaluacion)); const sedesSet = new Set(details.map(d=>d.sedeNombre));
    return res.json({ ok: true, groups, detailsByGroupId, filters: { clientes: Array.from(clientesSet).sort(), tipos: Array.from(tiposSet).sort(), sedes: Array.from(sedesSet).sort(), estadosPrestacion: [] } });
  } catch (err) {
    console.error("Error process:", err);
    return res.status(500).json({ ok: false, message: "Error al procesar." });
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
// =====================================================================
// GET /detalle-con-pendientes (CORREGIDO: CAMPOS PARA EXCEL + ID)
// =====================================================================
router.get("/detalle-con-pendientes", async (req, res) => {
  try {
    const { from, to, cliente, unidad, tipo, sede } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, message: "Faltan datos." });

    const poolCb = await getPoolCbmedic();
    const poolFact = await getPool();

    // 1. CARGA ACTUAL
    const dataSP = await poolCb.request().input("FechaDesde", sql.Date, from).input("FechaHasta", sql.Date, to).query(`EXEC dbo.pa_liq_clientes_rango_export @FechaDesde, @FechaHasta, 'TODAS'`);
    let rowsAll = (dataSP.recordset || []).map(r => ({ ...r, _isRescue: false }));

    // 2. RESCATE
    const year = new Date(from).getFullYear();
    const startOfYear = `${year}-01-01`;
    if (from > startOfYear) {
        const rescueQuery = `
          SELECT 
            Nro = CONVERT(VARCHAR(20), v.val_aten_codigo) + '_' + CONVERT(VARCHAR(20), v.val_aten_estab),
            [Fecha Inicio] = ia.aten_fecha_evaluacion,
            [Protocolo] = pa.plan_denominacion,
            [Tipo de Evaluación] = 'PRE OCUPACIONAL',
            [Documento] = p.paci_documento_identidad,
            [Paciente] = p.paci_ap_paterno + ' ' + p.paci_ap_materno + ', ' + p.paci_nombres,
            [Importe] = ISNULL(vap.vp_precio_plan, ISNULL(vsm.vsm_precio_plan, vam.vm_precio_plan)),
            [Condición de Pago] = ISNULL(emp.empresa_fax, ''), 
            [Cliente] = emp.empresa_razon_social,
            [Unidad de Producción] = up.unidad_denominacion,
            [Sede] = CASE CONVERT(VARCHAR(10), v.val_aten_estab) WHEN '3' THEN 'EMO - MEGA PLAZA' WHEN '8' THEN 'IN HOUSE OCUPACIONAL' WHEN '10' THEN 'EMO - GUARDIA' WHEN '11' THEN 'INTEGRAMEDICA (MEGA PLAZA)' ELSE NULL END,
            [Descripción de la Prestación] = ISNULL(vap.vp_denominacion, ISNULL(vsm.vsm_smodulod, vam.vm_modulod)),
            [Estado de la Prestación] = 'ATENDIDO',
            [EstadoRescate] = lcp.Estado,
            [IdPendiente] = lcp.IdPendiente
          FROM valorizacion v
          INNER JOIN ind_atencion ia ON ia.aten_numero = v.val_aten_codigo AND ia.aten_establecimiento = v.val_aten_estab
          INNER JOIN plan_atencion pa ON v.val_plan = pa.plan_id
          INNER JOIN mae_tipo_examen mte ON v.val_tipo = mte.tipexam_codigo
          INNER JOIN paciente p ON v.val_paciente = p.paci_id
          INNER JOIN val_atencion_modulo vam ON vam.vm_vestab = v.val_estab AND vam.vm_vnumero = v.val_codigo
          LEFT  JOIN val_atencion_smodulo vsm ON vsm.vsm_vestab = vam.vm_vestab AND vsm.vsm_vnumero = vam.vm_vnumero AND vsm.vsm_modulo = vam.vm_modulo AND vsm.vsm_modulo IN (6,4,15,5)
          LEFT  JOIN val_atencion_prueba vap ON vap.vp_vestab = vsm.vsm_vestab AND vap.vp_vnumero = vsm.vsm_vnumero AND vap.vp_modulo = vsm.vsm_modulo AND vap.vp_submod = vsm.vsm_smodulo 
          INNER JOIN ubicacion_trabajo ut ON ut.ubicacion_id = v.val_ubicacion
          INNER JOIN empresa emp ON ut.ubicacion_empresa_id = emp.empresa_id
          INNER JOIN unidad_produccion up ON ut.ubicacion_unidad_id = up.unidad_id
          INNER JOIN FacturacionCBMedic.dbo.LiquidacionClientesPendientes lcp ON lcp.Nro COLLATE DATABASE_DEFAULT = (CONVERT(VARCHAR(20), v.val_aten_codigo) + '_' + CONVERT(VARCHAR(20), v.val_aten_estab)) COLLATE DATABASE_DEFAULT AND lcp.Documento COLLATE DATABASE_DEFAULT = p.paci_documento_identidad COLLATE DATABASE_DEFAULT
          INNER JOIN plan_atencion pa2 ON v.val_plan = pa2.plan_id
          WHERE v.val_anulado = 'N' AND vam.vm_eliminado = 'N' AND v.val_aten_estab IN (3, 8, 10, 11) AND NOT (vam.vm_modulo <> 1 AND vsm.vsm_smodulo IS NULL) 
          AND lcp.Estado IN ('PENDIENTE', 'LIQUIDADO') 
          AND ia.aten_fecha_evaluacion >= @StartOfYear AND ia.aten_fecha_evaluacion < @FechaDesde
        `;
        try {
            const resRescue = await poolCb.request().input("StartOfYear", sql.Date, startOfYear).input("FechaDesde", sql.Date, from).query(rescueQuery);
            const rescued = (resRescue.recordset || []).map(r => ({ ...r, _isRescue: true }));
            rowsAll = [...rescued, ...rowsAll];
        } catch(e) {}
    }

    // 3. RECUPERAR ESTADO REAL
    const liqQuery = `SELECT Nro, Documento FROM dbo.LiquidacionClientesDet d JOIN dbo.LiquidacionClientesCab c ON d.IdLiquidacion=c.IdLiquidacion WHERE c.Estado='VIGENTE'`;
    const resLiq = await poolFact.request().query(liqQuery);
    const liquidadosSet = new Set((resLiq.recordset||[]).map(r => `${(r.Nro||"").trim()}||${(r.Documento||"").trim()}`));

    const pendResult = await poolFact.request().query(`SELECT Nro, Documento FROM dbo.LiquidacionClientesPendientes WHERE Estado='PENDIENTE'`);
    const pendientesSet = new Set(pendResult.recordset.map(p => `${(p.Nro||"").trim()}||${(p.Documento||"").trim()}`));

    const rowsNormales = [];
    
    for (const r of rowsAll) {
       const rCliente = r["Cliente"] || r["RAZÓN SOCIAL"];
       const rUnidad = r["Unidad de Producción"];
       const rTipo = mapTipoEvaluacion(r["Tipo de Evaluación"] || "");
       const { sedeNombre } = r["Sede"] ? { sedeNombre: r["Sede"] } : mapSedeFromNro(r.Nro);

       if (rCliente !== cliente || rUnidad !== unidad || rTipo !== tipo || sedeNombre !== sede) continue;

       const nro = (r.Nro||"").trim();
       const doc = (r["Documento"]||r["N° Documento"]||"").trim();
       const key = `${nro}||${doc}`;
       
       let estaLiquidado = liquidadosSet.has(key);
       if (r._isRescue && r["EstadoRescate"] === 'LIQUIDADO') {
          estaLiquidado = true;
       }

       const esRescate = r._isRescue === true;
       const esPendienteManual = pendientesSet.has(key);
       const isPendienteFinal = esRescate ? false : esPendienteManual;

       // === CORRECCIÓN DE NOMBRES PARA EXCEL ===
       // Usamos nombres de propiedades estándar (camelCase) que espera la función de exportación
       rowsNormales.push({
          nro: nro,
          documento: doc,
          fechaInicio: r["Fecha Inicio"],
          cliente: rCliente,
          unidadProduccion: rUnidad,
          tipoEvaluacion: rTipo,
          condicionPago: r["Condición de Pago"] || "", // <-- Corregido
          paciente: r["Paciente"],
          precioCb: Number(r["Importe"] || r["Precio CB"] || 0),
          importe: Number(r["Importe"] || r["Precio CB"] || 0), // Duplicado por seguridad
          sedeNombre: sedeNombre,
          estadoPrestacion: r["Estado de la Prestación"] || "ATENDIDO", // <-- Corregido
          descripcionPrestacion: r["Descripción de la Prestación"] || r["DescripcionPrestacion"] || "", // <-- Corregido y Agregado
          protocolo: r["Protocolo"] || "", // <-- Agregado
          
          estaLiquidado: estaLiquidado,
          isPendiente: isPendienteFinal, 
          origenPendiente: esRescate,
          idPendiente: r["IdPendiente"] || null
       });
    }

    return res.json({ ok: true, rowsNormales, rowsPendientes: [] }); 
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: "Error detalle." });
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
// ==========================================
// GET /history: Histórico Unificado
// ==========================================
router.get("/history", async (req, res) => {
  try {
    const { type, from, to } = req.query;
    if (!from || !to) return res.status(400).json({ message: "Faltan fechas" });

    const pool = await getPool();
    let tableName = "";
    
    switch (type) {
        case "HHMM": tableName = "dbo.LiquidacionHonorariosCab"; break;
        case "AUDITORIAS": tableName = "dbo.LiquidacionAuditoriasCab"; break;
        default: tableName = "dbo.LiquidacionClientesCab"; break; 
    }

    const result = await pool.request()
      .input("Desde", sql.Date, from)
      .input("Hasta", sql.Date, to)
      .query(`
        SELECT 
            IdLiquidacion,
            Codigo,
            FechaLiquidacion,
            Desde, 
            Hasta, 
            CondicionPago,
            Subtotal,
            IGV,
            Total,
            Grupos,
            Pacientes,
            Estado,
            UsuarioAnula,
            FechaAnulacion,
            Usuario as UsuarioCreador
        FROM ${tableName}
        WHERE 
            -- LOGICA DE INTERSECCION: Muestra si el periodo se solapa con el filtro
            (Desde <= @Hasta AND Hasta >= @Desde)
        ORDER BY Codigo DESC
      `);

    res.json({ ok: true, rows: result.recordset });

  } catch (e) {
    console.error("Error history:", e);
    res.status(500).json({ message: "Error al cargar histórico" });
  }
});
export default router;