import { Router } from "express";
import { getPool, getPoolCbmedic, sql } from "../util/db.js";

const router = Router();

// ====================================================================
// 1. OBTENER MAESTRO DE PRESTACIONES (BÚSQUEDA CRUZADA)
// ====================================================================
router.get("/master-prestaciones", async (req, res) => {
  try {
    // 1. Conectamos a la BD Principal (FacturacionCBMedic)
    const pool = await getPool(); 

    // 2. Traemos TODAS las prestaciones históricas desde la OTRA BD [cbmedic]
    // Usamos UNION para juntar Pruebas, Submódulos y Módulos
    const resultHist = await pool.request().query(`
      SELECT DISTINCT Nombre FROM (
          -- Pruebas de Laboratorio / Exámenes
          SELECT vp_denominacion as Nombre 
          FROM [cbmedic].[dbo].[val_atencion_prueba] 
          WHERE vp_denominacion IS NOT NULL
          
          UNION
          
          -- Submódulos (Procedimientos intermedios)
          SELECT vsm_smodulod as Nombre 
          FROM [cbmedic].[dbo].[val_atencion_smodulo] 
          WHERE vsm_smodulod IS NOT NULL
          
          UNION
          
          -- Módulos (Servicios generales)
          SELECT vm_modulod as Nombre 
          FROM [cbmedic].[dbo].[val_atencion_modulo] 
          WHERE vm_modulod IS NOT NULL
      ) as T 
      WHERE LEN(Nombre) > 2 -- Filtramos basura o vacíos
      ORDER BY Nombre
    `);
    
    // Lista limpia de nombres históricos
    const historico = resultHist.recordset.map(r => r.Nombre);

    // 3. Traemos lo que YA está configurado en TU BD [FacturacionCBMedic]
    const resultConfig = await pool.request().query(`
      SELECT IdTarifa, DescripcionPrestacion, EvaluadorNombre, CompaniaNombre, TipoPago, Valor, Estado
      FROM dbo.TarifarioHHMM WHERE Estado=1
    `);
    const configurados = resultConfig.recordset;

    // 4. Mezclamos (Merge Inteligente)
    const masterMap = new Map();
    
    // A) Llenamos primero con el historial (Costo 0 por defecto)
    historico.forEach(nombre => {
      masterMap.set(nombre, {
        descripcion: nombre,
        asignadoA: "Sin asignar", 
        tipoPago: "-",
        valor: 0,
        configs: [] // Array para guardar las reglas
      });
    });

    // B) Sobreescribimos/Agregamos la configuración guardada
    configurados.forEach(conf => {
      const nombre = conf.DescripcionPrestacion;
      
      // Si configuraste una prestación que NO estaba en el histórico (ej. nueva), la creamos
      if (!masterMap.has(nombre)) {
        masterMap.set(nombre, { 
            descripcion: nombre, 
            asignadoA: "Sin asignar", 
            tipoPago: "-", 
            valor: 0, 
            configs: [] 
        });
      }
      
      const item = masterMap.get(nombre);
      
      // Definimos texto amigable
      let quien = "Genérico";
      if (conf.EvaluadorNombre) quien = conf.EvaluadorNombre;
      else if (conf.CompaniaNombre) quien = conf.CompaniaNombre;
      else quien = "Tarifa Base";
      
      // Agregamos a la lista de reglas de este ítem
      item.configs.push({
        id: conf.IdTarifa,
        quien,
        tipoPago: conf.TipoPago || 'MONTO',
        valor: conf.Valor
      });
      
      // Actualizamos la vista previa de la tabla (Mostramos la primera regla o "Varios")
      if (item.configs.length === 1) {
          item.asignadoA = quien;
          item.tipoPago = conf.TipoPago || 'MONTO';
          item.valor = conf.Valor;
      } else {
          item.asignadoA = "Múltiples Reglas";
          item.tipoPago = "Varios";
          // Dejamos el valor visual en 0 o indicativo cuando hay múltiples reglas
      }
    });

    // C) Convertimos a array y ordenamos alfabéticamente
    const listaFinal = Array.from(masterMap.values()).sort((a,b) => a.descripcion.localeCompare(b.descripcion));

    res.json({ ok: true, data: listaFinal });

  } catch (err) {
    console.error("Error en master-prestaciones:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});
// ====================================================================
// 2. BUSCADOR DE EVALUADORES (SOLUCIÓN DEFINITIVA: ESTADO 'A')
// ====================================================================
router.get("/buscar-evaluadores", async (req, res) => {
  try {
    const { q } = req.query; 
    console.log(`🔎 Buscando evaluador: "${q}"`); // <--- VERIFICA ESTO EN TU CONSOLA NEGRA

    if (!q || q.length < 1) return res.json([]);

    const pool = await getPool(); // Conexión a Facturacion
    
    // NOTA IMPORTANTE:
    // 1. Usamos [cbmedic].[dbo].[evaluador] para ir a la otra BD.
    // 2. Usamos eval_estado = 'A' porque tu BD usa letras, no números.
    const result = await pool.request()
      .input("Q", sql.VarChar, `%${q.trim()}%`) 
      .query(`
        SELECT TOP 20 
           Id = eval_id,
           Nombre = UPPER(LTRIM(RTRIM(ISNULL(eval_apellidos,'') + ', ' + ISNULL(eval_nombres,''))))
        FROM [cbmedic].[dbo].[evaluador]
        WHERE eval_estado = 'A'  -- <--- ESTO ES LO QUE ARREGLA EL ERROR
        AND (
             UPPER(eval_apellidos) LIKE @Q 
             OR UPPER(eval_nombres) LIKE @Q
             OR (eval_apellidos + ' ' + eval_nombres) LIKE @Q
        )
        ORDER BY Nombre
      `);
      
    console.log(`✅ Encontrados: ${result.recordset.length} resultados`); // <--- TE DIRÁ CUÁNTOS ENCONTRÓ
    res.json(result.recordset);

  } catch (e) { 
    console.error("❌ Error CRÍTICO buscando evaluador:", e.message);
    res.status(500).json([]); 
  }
});
// ====================================================================
// 3. GUARDAR TARIFA (MODIFICADO: Devuelve el ID creado)
// ====================================================================
router.post("/tarifas", async (req, res) => {
  try {
    const { descripcion, evaluadorNombre, companiaNombre, tipoPago, valor } = req.body;
    const pool = await getPool();

    // Usamos OUTPUT INSERTED.IdTarifa para obtener el ID generado
    const result = await pool.request()
      .input("Desc", sql.NVarChar, descripcion)
      .input("Eva", sql.NVarChar, evaluadorNombre || null)
      .input("Cia", sql.NVarChar, companiaNombre || null)
      .input("Tipo", sql.VarChar, tipoPago || 'MONTO')
      .input("Val", sql.Decimal(18,2), valor)
      .query(`
        INSERT INTO dbo.TarifarioHHMM (DescripcionPrestacion, EvaluadorNombre, CompaniaNombre, TipoPago, Valor, Estado)
        OUTPUT INSERTED.IdTarifa
        VALUES (@Desc, @Eva, @Cia, @Tipo, @Val, 1)
      `);
    
    // Devolvemos el ID
    res.json({ ok: true, id: result.recordset[0].IdTarifa });

  } catch (e) { res.status(500).json({ ok:false, message: e.message }); }
});
// (Mantén la ruta de /delete/tarifas/:id si la tenías)
router.delete("/tarifas/:id", async (req, res) => {
    try {
      const pool = await getPool();
      await pool.request().input("Id", sql.Int, req.params.id).query("UPDATE dbo.TarifarioHHMM SET Estado=0 WHERE IdTarifa=@Id");
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// GET /api/config/costos-auditoria
router.get("/costos-auditoria", async (req, res) => {
  try {
    const pool = await getPool(); // Facturación (donde creaste la tabla)
    const result = await pool.request().query("SELECT TipoExamen, Costo FROM dbo.ConfiguracionCostosAuditoria");
    res.json(result.recordset);
  } catch (e) {
    res.status(500).send("Error al leer costos");
  }
});

// POST /api/config/costos-auditoria
router.post("/costos-auditoria", async (req, res) => {
  try {
    const { items } = req.body; // Array [{ TipoExamen, Costo }]
    const pool = await getPool();
    
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        for (const item of items) {
            await new sql.Request(tx)
                .input("Tipo", sql.NVarChar, item.TipoExamen)
                .input("Costo", sql.Decimal(18, 2), item.Costo)
                .query("UPDATE dbo.ConfiguracionCostosAuditoria SET Costo = @Costo, UpdatedAt = GETDATE() WHERE TipoExamen = @Tipo");
        }
        await tx.commit();
        res.json({ ok: true, message: "Costos actualizados" });
    } catch (err) {
        await tx.rollback();
        throw err;
    }
  } catch (e) {
    res.status(500).send("Error al guardar costos");
  }
});

export default router;