import { Router } from "express";
import { getPool, sql } from "../util/db.js"; 
import crypto from "crypto";

const router = Router();

// ==========================================
// 1. GET /process: Traer liquidaciones (CORREGIDO POR PERIODO)
// ==========================================
router.get("/process", async (req, res) => {
  try {
    const { from, to, condicion } = req.query;

    console.log(`--> Valorización Process: Periodo del ${from} al ${to}`);

    const pool = await getPool();
    
    const result = await pool.request()
      .input("Desde", sql.Date, from)
      .input("Hasta", sql.Date, to)
      .query(`
        SELECT 
            lc.IdLiquidacion,
            lc.Codigo AS CodigoLiquidacion,
            
            ISNULL((SELECT TOP 1 d.Cliente FROM dbo.LiquidacionClientesDet d WHERE d.IdLiquidacion = lc.IdLiquidacion), 'Cliente Desconocido') AS ClienteNombre,
            ISNULL((SELECT TOP 1 d.UnidadProduccion FROM dbo.LiquidacionClientesDet d WHERE d.IdLiquidacion = lc.IdLiquidacion), '-') AS UnidadNegocio,
            ISNULL((SELECT TOP 1 d.TipoEvaluacion FROM dbo.LiquidacionClientesDet d WHERE d.IdLiquidacion = lc.IdLiquidacion), '-') AS TipoEvaluacion,

            lc.Total AS Importe,
            lc.FechaLiquidacion, -- Mantenemos esta visualmente
            lc.CondicionPago,

            vc.IdValorizacion,
            vc.Codigo AS CodigoFacturacion, 
            vc.NroFactura AS NroComprobante, 
            vc.Estado AS EstadoFactura,
            
            CASE 
                WHEN lc.IdValorizacion IS NOT NULL THEN 'FACTURADO'
                ELSE 'NO FACTURADO' 
            END AS EstadoProceso

        FROM dbo.LiquidacionClientesCab lc
        LEFT JOIN dbo.ValorizacionesCab vc ON lc.IdValorizacion = vc.IdValorizacion
        WHERE 
            -- CAMBIO CLAVE: AHORA FILTRAMOS POR EL PERIODO DE ATENCIÓN, NO POR FECHA DE CREACIÓN
            lc.Desde >= @Desde 
            AND lc.Hasta <= @Hasta
            AND lc.Estado = 'VIGENTE'
      `);

    console.log(`   > Filas encontradas: ${result.recordset.length}`);
    res.json({ ok: true, rows: result.recordset });

  } catch (e) {
    console.error("!!! ERROR EN VALORIZACION PROCESS !!!");
    console.error(e); 
    res.status(500).json({ message: "Error al cargar liquidaciones", error: e.message });
  }
});
// ==========================================
// 2. POST /facturar (Misma lógica anterior)
// ==========================================
router.post("/facturar", async (req, res) => {
  try {
    const { ids, nroFacturaManual } = req.body; 
    if (!ids || !ids.length) return res.status(400).json({ message: "Seleccione registros" });
    if (!nroFacturaManual) return res.status(400).json({ message: "Ingrese N° Factura" });

    const pool = await getPool();

    // Generar Correlativo F-XXXXX
    const codeRes = await pool.request().query("SELECT MAX(Codigo) as Ultimo FROM dbo.ValorizacionesCab");
    const ultimo = codeRes.recordset[0].Ultimo || "F-00000";
    const correlativo = parseInt(ultimo.split("-")[1]) + 1;
    const nuevoCodigo = `F-${String(correlativo).padStart(5, "0")}`;

    const idValorizacion = crypto.randomUUID();

    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
        await new sql.Request(tx)
            .input("Id", sql.UniqueIdentifier, idValorizacion)
            .input("Cod", sql.NVarChar, nuevoCodigo)
            .input("Nro", sql.NVarChar, nroFacturaManual)
            .query(`
                INSERT INTO dbo.ValorizacionesCab (IdValorizacion, Codigo, NroFactura, Total, Usuario)
                VALUES (@Id, @Cod, @Nro, 0, 'admin') 
            `);

        for (const idLiq of ids) {
            await new sql.Request(tx)
                .input("IdVal", sql.UniqueIdentifier, idValorizacion)
                .input("IdLiq", sql.UniqueIdentifier, idLiq)
                .query(`
                    UPDATE dbo.LiquidacionClientesCab 
                    SET IdValorizacion = @IdVal
                    WHERE IdLiquidacion = @IdLiq
                `);
        }

        await tx.commit();
        res.json({ ok: true, message: "Valorizado correctamente", codigo: nuevoCodigo });

    } catch (err) {
        if (!tx._aborted) await tx.rollback();
        throw err;
    }

  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al facturar" });
  }
});

// ==========================================
// 3. POST /anular (Misma lógica anterior)
// ==========================================
router.post("/anular", async (req, res) => {
    try {
      const { idValorizacion, notaCredito } = req.body;
      if (!idValorizacion) return res.status(400).json({ message: "Falta ID" });
      if (!notaCredito) return res.status(400).json({ message: "Debe ingresar Nota de Crédito" });
  
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin();
  
      try {
          await new sql.Request(tx)
              .input("Id", sql.UniqueIdentifier, idValorizacion)
              .input("NC", sql.NVarChar, notaCredito)
              .query(`
                  UPDATE dbo.ValorizacionesCab 
                  SET Estado = 'ANULADO', NotaCredito = @NC 
                  WHERE IdValorizacion = @Id
              `);
          
          await new sql.Request(tx)
              .input("Id", sql.UniqueIdentifier, idValorizacion)
              .query(`
                  UPDATE dbo.LiquidacionClientesCab
                  SET IdValorizacion = NULL
                  WHERE IdValorizacion = @Id
              `);
  
          await tx.commit();
          res.json({ ok: true, message: "Anulación correcta" });
  
      } catch (err) {
          if (!tx._aborted) await tx.rollback();
          throw err;
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Error al anular" });
    }
});

export default router;