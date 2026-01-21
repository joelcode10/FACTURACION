import { Router } from "express";
import { getPoolCbmedic, getPool, sql } from "../util/db.js"; // Asegúrate de tener estos imports
import ExcelJS from "exceljs";
import crypto from "crypto";

const router = Router();

// ==========================================
// 1. GET /process: Procesar Auditoría con Costos
// ==========================================
router.get("/process", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ message: "Faltan fechas" });

    // A) Obtener datos crudos del SP (CBMedic)
    const pool = await getPoolCbmedic();
    const result = await pool.request()
      .input("fecha_desde", sql.Date, from)
      .input("fecha_hasta", sql.Date, to)
      .query("EXEC dbo.pa_sabana_atencion_rango_resumen @fecha_desde, @fecha_hasta");
    
    const rawRows = result.recordset || [];

    // B) Obtener Costos Configurados (Facturacion)
    // Usamos un try/catch interno por si la tabla no existe o falla, para no tumbar todo el proceso
    let costosMap = {};
    try {
        const poolFact = await getPool();
        const costosRes = await poolFact.request().query("SELECT TipoExamen, Costo FROM dbo.ConfiguracionCostosAuditoria");
        
        costosRes.recordset.forEach(c => {
            if (c.TipoExamen) {
                costosMap[c.TipoExamen.toUpperCase().trim()] = Number(c.Costo || 0);
            }
        });
    } catch (errConfig) {
        console.warn("Advertencia: No se pudieron cargar los costos configurados (Usando 0.00)", errConfig.message);
    }

    // C) Obtener lo que ya está liquidado (Facturacion)
    const poolFact = await getPool();
    const liqResult = await poolFact.request().query(`
      SELECT d.Documento, d.FechaExamen, c.Codigo
      FROM dbo.LiquidacionAuditoriasDet d
      INNER JOIN dbo.LiquidacionAuditoriasCab c ON d.IdLiquidacion = c.IdLiquidacion
      WHERE c.Estado = 'VIGENTE'
    `);
    
    const liquidadosMap = new Map();
    liqResult.recordset.forEach(r => {
        // Clave única: Documento + Fecha (YYYY-MM-DD)
        const fechaStr = new Date(r.FechaExamen).toISOString().slice(0,10);
        const k = `${r.Documento}-${fechaStr}`;
        liquidadosMap.set(k, r.Codigo);
    });

    // D) Procesar y Cruzar Datos
    const rows = rawRows.map(r => {
       const fechaStr = r.FECHA_DE_EXAMEN ? new Date(r.FECHA_DE_EXAMEN).toISOString().slice(0,10) : "";
       const key = `${r.DOCUMENTO_DE_IDENTIDAD}-${fechaStr}`;
       const codigoLiq = liquidadosMap.get(key);

       // Detectar el tipo y asignar el costo de la configuración
       // Usamos String() para evitar crash si viene null
       const tipoRaw = r.TIPO_DE_EXAMEN || r.tipoExamen || "";
       const tipoKey = String(tipoRaw).toUpperCase().trim();
       
       // Si existe en config usamos ese, sino usamos el que venía del SP (que es 0)
       const costoFinal = (costosMap[tipoKey] !== undefined) ? costosMap[tipoKey] : Number(r.COSTO || 0);

       return {
           ...r,
           AUDITADO_POR: r.AUDITADO_POR || "SIN AUDITOR",
           ID_ESTABLECIMIENTO: r.ID_ESTABLECIMIENTO,
           
           // AQUI INYECTAMOS EL PRECIO
           COSTO: costoFinal,
           
           estaLiquidado: !!codigoLiq,
           codigo: codigoLiq || null,
           estado: !!codigoLiq ? "LIQUIDADO" : "NO LIQUIDADO"
       };
    });

    res.json({ ok: true, rows });

  } catch (e) {
    console.error("Error en process auditorias:", e); // Esto saldrá en tu terminal de VSCode
    res.status(500).json({ message: "Error en process auditorias", debug: e.message });
  }
});

// ==========================================
// 2. POST /liquidar: Guardar Liquidación
// ==========================================
router.post("/liquidar", async (req, res) => {
  try {
    const { from, to, rows } = req.body;
    if (!rows || !rows.length) return res.status(400).json({ message: "Sin filas" });

    const pool = await getPool(); 
    
    // Generar Código
    const codeRes = await pool.request().query("SELECT MAX(Codigo) as Ultimo FROM dbo.LiquidacionAuditoriasCab");
    const ultimo = codeRes.recordset[0].Ultimo || "LA-00000";
    const correlativo = parseInt(ultimo.split("-")[1]) + 1;
    const nuevoCodigo = `LA-${String(correlativo).padStart(5, "0")}`;

    // Totales
    const subtotal = rows.reduce((acc, r) => acc + Number(r.COSTO || r.costo || 0), 0);
    const igv = subtotal * 0.18;
    const total = subtotal + igv;
    const idLiquidacion = crypto.randomUUID();

    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
        await new sql.Request(tx)
            .input("Id", sql.UniqueIdentifier, idLiquidacion)
            .input("Cod", sql.NVarChar, nuevoCodigo)
            .input("Desde", sql.Date, from)
            .input("Hasta", sql.Date, to)
            .input("Sub", sql.Decimal(18,2), subtotal)
            .input("Igv", sql.Decimal(18,2), igv)
            .input("Tot", sql.Decimal(18,2), total)
            .input("Regs", sql.Int, rows.length)
            .query(`
                INSERT INTO dbo.LiquidacionAuditoriasCab 
                (IdLiquidacion, Codigo, Desde, Hasta, Subtotal, IGV, Total, Registros, Usuario)
                VALUES (@Id, @Cod, @Desde, @Hasta, @Sub, @Igv, @Tot, @Regs, 'admin')
            `);

        for (const r of rows) {
            await new sql.Request(tx)
                .input("IdLiq", sql.UniqueIdentifier, idLiquidacion)
                .input("Doc", sql.NVarChar, r.DOCUMENTO_DE_IDENTIDAD || r.documento)
                .input("Pac", sql.NVarChar, r.NOMBRE_COMPLETO || r.paciente)
                .input("Emp", sql.NVarChar, r.EMPRESA_EVALUADA || r.empresa)
                .input("Tipo", sql.NVarChar, r.TIPO_DE_EXAMEN || r.tipoExamen)
                .input("Fec", sql.Date, r.FECHA_DE_EXAMEN || r.fechaExamen)
                .input("Cost", sql.Decimal(18,2), Number(r.COSTO || r.costo || 0))
                .input("Aud", sql.NVarChar, r.AUDITADO_POR || r.auditor)
                .input("Sed", sql.NVarChar, String(r.ID_ESTABLECIMIENTO || r.sede || r.sedeNombre))
                .input("FecAud", sql.NVarChar, r.FECHA_AUDITOR || r.fechaAuditoria || "")
                .query(`
                    INSERT INTO dbo.LiquidacionAuditoriasDet
                    (IdLiquidacion, Documento, Paciente, Empresa, TipoExamen, FechaExamen, Costo, Auditor, Sede, FechaAuditoria)
                    VALUES (@IdLiq, @Doc, @Pac, @Emp, @Tipo, @Fec, @Cost, @Aud, @Sed, @FecAud)
                `);
        }

        await tx.commit();
        res.json({ ok: true, codigo: nuevoCodigo });

    } catch (errTx) {
        if(!tx._aborted) await tx.rollback();
        throw errTx;
    }

  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al liquidar" });
  }
});

// ==========================================
// 3. POST /export: Excel con Estilos
// ==========================================
router.post("/export", async (req, res) => {
    try {
        const { rows, from, to } = req.body;
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet("Auditorias");
        
        ws.mergeCells('A1:I1');
        const titleCell = ws.getCell('A1');
        titleCell.value = `REPORTE DE AUDITORÍAS (${from} al ${to})`;
        titleCell.font = { name: 'Arial', size: 14, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        ws.addRow([]); 

        const headerData = [
            "Fecha Examen", "Paciente", "Documento", "Empresa", "Tipo Examen", "Costo", "Auditor", "Sede", "Fecha Auditoría"
        ];
        
        const headerRow = ws.addRow(headerData);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '203764' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });

        ws.columns = [
            { width: 14 }, { width: 35 }, { width: 15 }, { width: 35 }, { width: 25 }, { width: 15 }, { width: 30 }, { width: 25 }, { width: 18 }
        ];

        let subtotal = 0;

        rows.forEach(r => {
            const costo = Number(r.COSTO || r.costo || r.importe || 0);
            subtotal += costo;

            const row = ws.addRow([
                r.FECHA_DE_EXAMEN || r.fechaExamen,
                r.NOMBRE_COMPLETO || r.paciente,
                r.DOCUMENTO_DE_IDENTIDAD || r.documento,
                r.EMPRESA_EVALUADA || r.empresa,
                r.TIPO_DE_EXAMEN || r.tipoExamen,
                costo,
                r.AUDITADO_POR || r.auditor,
                r.sedeNombre || r.ID_ESTABLECIMIENTO || r.sede,
                r.FECHA_AUDITOR || r.fechaAuditoria
            ]);

            row.eachCell((cell) => {
                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                cell.alignment = { vertical: 'middle' };
            });

            row.getCell(6).numFmt = '"S/"#,##0.00';
        });

        const igv = subtotal * 0.18;
        const total = subtotal + igv;

        ws.addRow([]); 
        
        const addTotalRow = (label, val, isTotal = false) => {
            const r = ws.addRow(["", "", "", "", label, val]);
            r.getCell(5).font = { bold: true };
            r.getCell(5).alignment = { horizontal: 'right' };
            r.getCell(6).numFmt = '"S/"#,##0.00';
            r.getCell(6).font = { bold: true, size: isTotal ? 12 : 11 };
            if(isTotal) {
                 r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
                 r.getCell(6).border = { top: {style:'medium'}, left: {style:'medium'}, bottom: {style:'medium'}, right: {style:'medium'} };
            }
        };

        addTotalRow("SUB TOTAL", subtotal);
        addTotalRow("IGV (18%)", igv);
        addTotalRow("TOTAL", total, true);

        const buffer = await workbook.xlsx.writeBuffer();
        res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(Buffer.from(buffer));

    } catch (e) {
        console.error(e);
        res.status(500).send("Error excel");
    }
});

export default router;