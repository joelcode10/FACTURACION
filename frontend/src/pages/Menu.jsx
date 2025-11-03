// src/pages/Menu.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

// Importa los módulos reales
import Clientes from "./Clientes.jsx";
import Hhmm from "./Hhmm.jsx";
import Cierre from "./Cierre.jsx";

const MODULES = [
  {
    id: "clientes",
    short: "L",
    iconClass: "lc",
    title: "Liquidación de Clientes",
    subtitle: "Procesar, filtrar y exportar liquidaciones.",
  },
  {
    id: "hhmm",
    short: "H",
    iconClass: "hhmm",
    title: "Honorarios Médicos",
    subtitle: "Cálculo y consolidado de HH.MM.",
  },
  {
    id: "auditorias",
    short: "A",
    iconClass: "aud",
    title: "Auditorías",
    subtitle: "Control y liquidación por auditor.",
  },
  {
    id: "mantenimiento",
    short: "M",
    iconClass: "mant",
    title: "Mantenimiento HHMM",
    subtitle: "Configurar costos y paquetes.",
  },
  {
    id: "valorizar",
    short: "V",
    iconClass: "val",
    title: "Valorizar",
    subtitle: "Asignar comprobantes y exportar.",
  },
  {
    id: "cierre",
    short: "RC",
    iconClass: "rc",
    title: "Reporte de Cierre",
    subtitle: "Consolida estado diario con comprobantes.",
  },
];

export default function Menu() {
  const [activeModule, setActiveModule] = useState("clientes");
  const navigate = useNavigate();

  const handleLogout = () => {
    // Por ahora solo regresamos al login
    navigate("/");
  };

  const renderContent = () => {
    switch (activeModule) {
      case "clientes":
        return <Clientes />;
      case "hhmm":
        return <Hhmm />;
      case "cierre":
        return <Cierre />;
      case "auditorias":
        return (
          <>
            <h1>Auditorías</h1>
            <p className="lead">
              Módulo de auditorías (en construcción).
            </p>
          </>
        );
      case "mantenimiento":
        return (
          <>
            <h1>Mantenimiento HHMM</h1>
            <p className="lead">
              Configuración de costos y paquetes para honorarios médicos
              (en construcción).
            </p>
          </>
        );
      case "valorizar":
        return (
          <>
            <h1>Valorizar</h1>
            <p className="lead">
              Asignación de comprobantes a liquidaciones procesadas
              (en construcción).
            </p>
          </>
        );
      default:
        return (
          <>
            <h1>Módulo no encontrado</h1>
            <p className="lead">Selecciona un módulo de la barra izquierda.</p>
          </>
        );
    }
  };

  return (
    <div className="app-shell">
      {/* HEADER SUPERIOR */}
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo-circle">CB</div>
          <div>
            <div className="app-header-title">
              Sistema de Liquidación para Facturación
            </div>
            <div className="app-header-subtitle">
              CBMEDIC · Control y gestión
            </div>
          </div>
        </div>
        <div className="app-header-right">
          <button type="button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* CUERPO: SIDEBAR + CONTENIDO */}
      <main className="app-main">
        {/* SIDEBAR DE MÓDULOS */}
        <aside className="modules-sidebar">
          <div className="modules-card">
            <h2 className="modules-title">Módulos</h2>
            <p className="modules-subtitle">
              Selecciona un módulo para trabajar.  
              El contenido se mostrará a la derecha.
            </p>

            <div className="module-list">
              {MODULES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={
                    "module-card" +
                    (activeModule === m.id ? " selected" : "")
                  }
                  onClick={() => setActiveModule(m.id)}
                >
                  <div className={`module-icon ${m.iconClass}`}>
                    {m.short}
                  </div>
                  <div>
                    <div className="module-info-title">{m.title}</div>
                    <div className="module-info-subtitle">
                      {m.subtitle}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* CONTENIDO DEL MÓDULO SELECCIONADO */}
        <section className="module-content">{renderContent()}</section>
      </main>
    </div>
  );
}
