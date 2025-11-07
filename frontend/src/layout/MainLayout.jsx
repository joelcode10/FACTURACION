// frontend/src/layout/MainLayout.jsx
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import ModulesSidebar from "../components/ModulesSidebar.jsx";
import ClientesPage from "../modules/Clientes.jsx";
import HHMMPage from "../modules/HHMM.jsx";
import AuditoriaPage from "../modules/Auditoria.jsx";
import MantenimientoHHMMPage from "../modules/MantenimientoHHMM.jsx";
import ValorizarPage from "../modules/Valorizar.jsx";

function MainLayout() {
  const { user, logout } = useAuth();
  const [selectedModule, setSelectedModule] = useState("clientes");

  function renderModule() {
    switch (selectedModule) {
      case "clientes":
        return <ClientesPage />;
      case "hhmm":
        return <HHMMPage />;
      case "auditoria":
        return <AuditoriaPage />;
      case "mantenimiento":
        return <MantenimientoHHMMPage />;
      case "valorizar":
        return <ValorizarPage />;
      default:
        return <ClientesPage />;
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo-circle">CB</div>
          <div>
            <div className="app-header-title">Sistema de Liquidaciones</div>
            <div className="app-header-subtitle">
              Módulo: {selectedModule.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="app-header-right">
          <span style={{ marginRight: "0.75rem", fontSize: "0.85rem" }}>
            {user?.username}
          </span>
          <button onClick={logout}>Cerrar sesión</button>
        </div>
      </header>

      <main className="app-main">
        <aside className="modules-sidebar">
          <div className="modules-card">
            <h2 className="modules-title">Módulos</h2>
            <p className="modules-subtitle">Selecciona el módulo a trabajar</p>
            <div className="module-list">
              {/* aquí las tarjetas de módulos que ya tenías */}
              <div
                className={
                  "module-card" + (selectedModule === "clientes" ? " selected" : "")
                }
                onClick={() => setSelectedModule("clientes")}
              >
                <div className="module-icon lc">LC</div>
                <div>
                  <div className="module-info-title">Liquidación Clientes</div>
                  <div className="module-info-subtitle">
                    Procesar y exportar liquidaciones.
                  </div>
                </div>
              </div>

              {/* ... resto de módulos hhmm, auditoría, mantenimiento, valorizar ... */}
            </div>
          </div>
        </aside>

        <section className="module-content">{renderModule()}</section>
      </main>
    </div>
  );
}

export default MainLayout;
