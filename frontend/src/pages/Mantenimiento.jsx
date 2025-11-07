// src/pages/Mantenimiento.jsx
import React, { useMemo, useState } from "react";

function createMockPrestaciones() {
  return [
    {
      id: "P1",
      codigo: "LAB-001",
      descripcion: "Perfil lipídico completo",
    },
    {
      id: "P2",
      codigo: "LAB-002",
      descripcion: "Hemograma completo",
    },
    {
      id: "P3",
      codigo: "LAB-003",
      descripcion: "Panel 5 drogas",
    },
    {
      id: "P4",
      codigo: "LAB-004",
      descripcion: "Glucosa en sangre",
    },
  ];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Mantenimiento() {
  const [tab, setTab] = useState("costos"); // "costos" | "paquetes"

  // ---------- Prestaciones (mock local) ----------
  const [prestaciones] = useState(createMockPrestaciones);
  const [buscarPrestacion, setBuscarPrestacion] = useState("");
  const [selectedPrestacionId, setSelectedPrestacionId] = useState(null);

  // Config guardada por prestación (en memoria)
  const [configPorPrestacion, setConfigPorPrestacion] = useState({});

  // Estado del formulario de configuración
  const selectedConfig = configPorPrestacion[selectedPrestacionId] || {
    aplicaA: "MEDICO", // MEDICO | PROVEEDOR
    sujeto: "",
    tipoCosto: "MONTO", // MONTO | PORCENTAJE
    valor: "",
    actualizado: null,
  };

  const [formConfig, setFormConfig] = useState(selectedConfig);

  // Cada vez que cambie de prestación seleccionada, sincronizamos el form
  React.useEffect(() => {
    const cfg = configPorPrestacion[selectedPrestacionId] || {
      aplicaA: "MEDICO",
      sujeto: "",
      tipoCosto: "MONTO",
      valor: "",
      actualizado: null,
    };
    setFormConfig(cfg);
  }, [selectedPrestacionId, configPorPrestacion]);

  const prestacionesFiltradas = useMemo(() => {
    const q = buscarPrestacion.trim().toLowerCase();
    if (!q) return prestaciones;
    return prestaciones.filter((p) =>
      p.descripcion.toLowerCase().includes(q)
    );
  }, [prestaciones, buscarPrestacion]);

  const selectedPrestacion = prestaciones.find(
    (p) => p.id === selectedPrestacionId
  );

  const handleGuardarConfig = (e) => {
    e.preventDefault();
    if (!selectedPrestacion) {
      alert("Primero selecciona una prestación de la lista.");
      return;
    }
    if (!formConfig.sujeto) {
      alert("Indica el médico o proveedor al que aplica.");
      return;
    }
    if (!formConfig.valor || Number(formConfig.valor) <= 0) {
      alert("Ingresa un valor mayor a 0.");
      return;
    }

    const actualizado = todayISO();

    setConfigPorPrestacion((prev) => ({
      ...prev,
      [selectedPrestacionId]: {
        ...formConfig,
        valor: Number(formConfig.valor),
        actualizado,
      },
    }));

    alert(
      `Configuración guardada para "${selectedPrestacion.descripcion}". (Por ahora solo en memoria del navegador)`
    );
  };

  // ---------- Paquetes (mock local) ----------
  const [paquetes, setPaquetes] = useState([]);
  const [paqNombre, setPaqNombre] = useState("");
  const [paqPrecio, setPaqPrecio] = useState("");
  const [paqPrestacionesIds, setPaqPrestacionesIds] = useState([]);

  const handleAgregarPrestacionAlPaquete = (p) => {
    if (!p) return;
    setPaqPrestacionesIds((prev) =>
      prev.includes(p.id) ? prev : [...prev, p.id]
    );
  };

  const prestacionesEnPaquete = useMemo(
    () =>
      paqPrestacionesIds
        .map((id) => prestaciones.find((p) => p.id === id))
        .filter(Boolean),
    [paqPrestacionesIds, prestaciones]
  );

  const handleQuitarPrestacionDelPaquete = (id) => {
    setPaqPrestacionesIds((prev) => prev.filter((x) => x !== id));
  };

  const handleGuardarPaquete = (e) => {
    e.preventDefault();
    if (!paqNombre.trim()) {
      alert("Ingresa un nombre de paquete.");
      return;
    }
    if (!paqPrecio || Number(paqPrecio) <= 0) {
      alert("Ingresa un precio de paquete mayor a 0.");
      return;
    }
    if (paqPrestacionesIds.length === 0) {
      alert("Agrega al menos una prestación al paquete.");
      return;
    }

    const nuevo = {
      id: `PAQ-${Date.now()}`,
      nombre: paqNombre.trim(),
      precio: Number(paqPrecio),
      prestacionesIds: [...paqPrestacionesIds],
      creado: todayISO(),
    };

    setPaquetes((prev) => [...prev, nuevo]);

    // reset form
    setPaqNombre("");
    setPaqPrecio("");
    setPaqPrestacionesIds([]);

    alert(
      "Paquete guardado (simulado). Más adelante se persistirá en base de datos."
    );
  };

  // Para el buscador de prestación en la sección de paquetes
  const [buscarPrestacionPaquete, setBuscarPrestacionPaquete] = useState("");
  const prestacionesSugeridasPaquete = useMemo(() => {
    const q = buscarPrestacionPaquete.trim().toLowerCase();
    if (!q) return [];
    return prestaciones
      .filter((p) => p.descripcion.toLowerCase().includes(q))
      .slice(0, 8);
  }, [prestaciones, buscarPrestacionPaquete]);

  return (
    <div className="module-page">
      

      {/* Tabs simples */}
      <div className="section-card" style={{ paddingBottom: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn-primary"
            style={{
              background: tab === "costos" ? "#2563eb" : "#e5e7eb",
              color: tab === "costos" ? "#ffffff" : "#111827",
              boxShadow: tab === "costos" ? undefined : "none",
            }}
            onClick={() => setTab("costos")}
          >
            Configuración de costos
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{
              background: tab === "paquetes" ? "#2563eb" : "#e5e7eb",
              color: tab === "paquetes" ? "#ffffff" : "#111827",
              boxShadow: tab === "paquetes" ? undefined : "none",
            }}
            onClick={() => setTab("paquetes")}
          >
            Paquetes
          </button>
        </div>
      </div>

      {/* CONTENIDO SEGÚN TAB */}
      {tab === "costos" ? (
        <section className="section-card">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Configuración por prestación</h2>
              <p className="section-subtitle">
                Busca una prestación, selecciona si aplica a un médico o
                proveedor, indica el tipo de cálculo (monto / porcentaje) y
                guarda. Esta configuración luego se utilizará en el módulo de
                Honorarios Médicos.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)",
              gap: 24,
              marginTop: 4,
            }}
          >
            {/* Columna izquierda: buscador + lista */}
            <div>
              <div className="form-field">
                <label className="form-label" htmlFor="buscar-prest">
                  Buscar prestación
                </label>
                <input
                  id="buscar-prest"
                  className="form-input"
                  placeholder="Escribe al menos 2 caracteres..."
                  value={buscarPrestacion}
                  onChange={(e) => setBuscarPrestacion(e.target.value)}
                />
              </div>

              <div className="table-wrapper" style={{ marginTop: 12 }}>
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {prestacionesFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="table-empty">
                          No hay prestaciones que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      prestacionesFiltradas.map((p) => (
                        <tr key={p.id}>
                          <td>{p.codigo}</td>
                          <td>{p.descripcion}</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn-primary"
                              style={{
                                padding: "0.25rem 0.8rem",
                                fontSize: "0.8rem",
                                boxShadow: "none",
                              }}
                              onClick={() => setSelectedPrestacionId(p.id)}
                            >
                              Configurar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Columna derecha: formulario de configuración */}
            <div>
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontSize: "1.05rem",
                }}
              >
                Detalle de configuración
              </h3>
              {selectedPrestacion ? (
                <>
                  <p
                    style={{
                      margin: 0,
                      marginBottom: 12,
                      fontSize: "0.9rem",
                    }}
                  >
                    <strong>Prestación: </strong>
                    {selectedPrestacion.descripcion}
                    <br />
                    <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>
                      Código: {selectedPrestacion.codigo}
                    </span>
                    {selectedConfig.actualizado && (
                      <>
                        <br />
                        <span
                          style={{
                            color: "#059669",
                            fontSize: "0.8rem",
                          }}
                        >
                          Última actualización: {selectedConfig.actualizado}
                        </span>
                      </>
                    )}
                  </p>

                  <form
                    onSubmit={handleGuardarConfig}
                    className="form-grid"
                    style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
                  >
                    <div className="form-field">
                      <label className="form-label">Aplica a</label>
                      <select
                        className="form-select"
                        value={formConfig.aplicaA}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            aplicaA: e.target.value,
                            sujeto: "",
                          }))
                        }
                      >
                        <option value="MEDICO">Médico</option>
                        <option value="PROVEEDOR">Proveedor</option>
                      </select>
                    </div>

                    <div className="form-field">
                      <label className="form-label">
                        {formConfig.aplicaA === "MEDICO"
                          ? "Médico (evaluador)"
                          : "Proveedor (compañía médica)"}
                      </label>
                      <input
                        className="form-input"
                        placeholder={
                          formConfig.aplicaA === "MEDICO"
                            ? "Escribe el nombre del médico..."
                            : "Escribe el nombre del proveedor..."
                        }
                        value={formConfig.sujeto || ""}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            sujeto: e.target.value,
                          }))
                        }
                      />
                      <small style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        Más adelante este campo se conectará con los nombres
                        reales de CBMEDIC (excluyendo ANGLOLAB para médicos).
                      </small>
                    </div>

                    <div className="form-field">
                      <label className="form-label">Tipo de costo</label>
                      <select
                        className="form-select"
                        value={formConfig.tipoCosto}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            tipoCosto: e.target.value,
                          }))
                        }
                      >
                        <option value="MONTO">Monto fijo</option>
                        <option value="PORCENTAJE">
                          Porcentaje sobre precio base
                        </option>
                      </select>
                    </div>

                    <div className="form-field">
                      <label className="form-label">
                        {formConfig.tipoCosto === "MONTO"
                          ? "Monto"
                          : "Porcentaje (%)"}
                      </label>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formConfig.valor}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            valor: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="mt-3" style={{ gridColumn: "1 / span 2" }}>
                      <button type="submit" className="btn-primary">
                        Guardar configuración
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <p
                  style={{
                    fontSize: "0.9rem",
                    color: "#6b7280",
                    marginTop: 4,
                  }}
                >
                  Selecciona una prestación de la lista de la izquierda para
                  configurar su costo.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : (
        // ==================== TAB PAQUETES ====================
        <section className="section-card">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Paquetes de prestaciones</h2>
              <p className="section-subtitle">
                Define paquetes de prestaciones con un precio cerrado. Si un
                paciente completa todas las prestaciones del paquete, el monto
                se prorrateará; si no, se usarán los costos individuales
                configurados.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
              gap: 24,
              marginTop: 4,
            }}
          >
            {/* Columna izquierda: formulario de paquete */}
            <div>
              <form onSubmit={handleGuardarPaquete}>
                <div className="form-field">
                  <label className="form-label" htmlFor="paq-nombre">
                    Nombre del paquete
                  </label>
                  <input
                    id="paq-nombre"
                    className="form-input"
                    placeholder="Ej. Lipídico 1"
                    value={paqNombre}
                    onChange={(e) => setPaqNombre(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="paq-precio">
                    Precio del paquete
                  </label>
                  <input
                    id="paq-precio"
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paqPrecio}
                    onChange={(e) => setPaqPrecio(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label
                    className="form-label"
                    htmlFor="buscar-prest-paquete"
                  >
                    Buscar y agregar prestaciones
                  </label>
                  <input
                    id="buscar-prest-paquete"
                    className="form-input"
                    placeholder="Escribe para buscar prestaciones..."
                    value={buscarPrestacionPaquete}
                    onChange={(e) =>
                      setBuscarPrestacionPaquete(e.target.value)
                    }
                  />
                  {prestacionesSugeridasPaquete.length > 0 && (
                    <div
                      className="table-wrapper"
                      style={{
                        marginTop: 8,
                        maxHeight: 180,
                      }}
                    >
                      <table className="simple-table">
                        <tbody>
                          {prestacionesSugeridasPaquete.map((p) => (
                            <tr key={p.id}>
                              <td>{p.codigo}</td>
                              <td>{p.descripcion}</td>
                              <td style={{ textAlign: "right" }}>
                                <button
                                  type="button"
                                  className="btn-primary"
                                  style={{
                                    padding: "0.25rem 0.7rem",
                                    fontSize: "0.75rem",
                                    boxShadow: "none",
                                  }}
                                  onClick={() =>
                                    handleAgregarPrestacionAlPaquete(p)
                                  }
                                >
                                  Agregar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: 0, marginBottom: 8, fontSize: "0.95rem" }}>
                    Prestaciones del paquete
                  </h4>
                  <div className="table-wrapper">
                    <table className="simple-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Descripción</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {prestacionesEnPaquete.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="table-empty">
                              Aún no hay prestaciones en este paquete.
                            </td>
                          </tr>
                        ) : (
                          prestacionesEnPaquete.map((p) => (
                            <tr key={p.id}>
                              <td>{p.codigo}</td>
                              <td>{p.descripcion}</td>
                              <td style={{ textAlign: "right" }}>
                                <button
                                  type="button"
                                  className="btn-primary"
                                  style={{
                                    padding: "0.25rem 0.7rem",
                                    fontSize: "0.75rem",
                                    boxShadow: "none",
                                    background: "#ef4444",
                                  }}
                                  onClick={() =>
                                    handleQuitarPrestacionDelPaquete(p.id)
                                  }
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-3">
                  <button type="submit" className="btn-primary">
                    Guardar paquete
                  </button>
                </div>
              </form>
            </div>

            {/* Columna derecha: lista de paquetes ya configurados */}
            <div>
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontSize: "1.05rem",
                }}
              >
                Paquetes configurados (solo en memoria)
              </h3>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: 10,
                  fontSize: "0.85rem",
                  color: "#6b7280",
                }}
              >
                Aquí se muestran los paquetes que has creado durante esta
                sesión. Más adelante se guardarán en base de datos y podrán ser
                usados por el módulo de HHMM.
              </p>
              <div className="table-wrapper">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Precio</th>
                      <th># Prestaciones</th>
                      <th>Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paquetes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="table-empty">
                          Aún no has creado paquetes.
                        </td>
                      </tr>
                    ) : (
                      paquetes.map((paq) => (
                        <tr key={paq.id}>
                          <td>{paq.nombre}</td>
                          <td>
                            {paq.precio.toLocaleString("es-PE", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td>{paq.prestacionesIds.length}</td>
                          <td>{paq.creado}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
