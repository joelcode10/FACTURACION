import { Router } from "express";
import { getPool, sql } from "../util/db.js"; // Ajusta "../util/db.js" según donde tengas tu conexión

const router = Router();

// GET: Leer los costos actuales
router.get("/costos-auditoria", async (req, res) => {
  try {
    const pool = await getPool(); // Conecta a la BD de facturación
    const result = await pool.request().query("SELECT TipoExamen, Costo FROM dbo.ConfiguracionCostosAuditoria");
    res.json(result.recordset);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al leer costos" });
  }
});

// POST: Guardar/Actualizar costos
router.post("/costos-auditoria", async (req, res) => {
  try {
    const { items } = req.body; // Espera un array: [{ TipoExamen: '...', Costo: 10 }]
    
    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ message: "Datos inválidos" });
    }

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
        for (const item of items) {
            await new sql.Request(tx)
                .input("Tipo", sql.NVarChar, item.TipoExamen)
                .input("Costo", sql.Decimal(18, 2), item.Costo)
                .query(`
                   UPDATE dbo.ConfiguracionCostosAuditoria 
                   SET Costo = @Costo, UpdatedAt = GETDATE() 
                   WHERE TipoExamen = @Tipo
                `);
        }
        await tx.commit();
        res.json({ ok: true, message: "Costos actualizados" });

    } catch (errTx) {
        if (!tx._aborted) await tx.rollback();
        throw errTx;
    }

  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al guardar costos" });
  }
});

export default router;