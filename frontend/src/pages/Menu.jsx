// frontend/src/pages/Menu.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import Clientes from "./Clientes.jsx";
import Hhmm from "./Hhmm.jsx";
import Auditorias from "./Auditorias.jsx";
import Mantenimiento from "./Mantenimiento.jsx";
import Valorizar from "./Valorizar.jsx";
import Usuarios from "./Usuarios.jsx";
import LiquidacionesClientes from "./LiquidacionesClientes.jsx";
const MODULES = [
  {
    id: "clientes",
    title: "Liquidación",
    iconClass: "lc",
    // Eliminamos subtitle
  },
  {
    id: "hhmm",
    title: "Honorarios Médicos",
    iconClass: "hhmm",
  },
  {
    id: "auditorias",
    title: "Auditorías",
    iconClass: "aud",
  },
  {
    id: "mantenimiento",
    title: "Mantenimiento",
    iconClass: "mant",
  },
  {
    id: "valorizar",
    title: "Valorizar",
    iconClass: "val",
  },
  {
    id: "usuarios",
    title: "Usuarios y Accesos",
    iconClass: "rc",
  },
  {
    id: "liq_hist",
    title: "Histórico",
    iconClass: "hist"
  },
];

// Qué módulos ve cada rol
function modulesForRole(rol) {
  switch (rol) {
    case "FACT1":
      // solo Liquidación de Clientes y Valorizar
      return MODULES.filter((m) => ["clientes", "valorizar"].includes(m.id));

    case "FACT2":
      // HHMM, Auditorías y Mantenimiento
      return MODULES.filter((m) =>
        ["hhmm", "auditorias", "mantenimiento"].includes(m.id)
      );

    case "READONLY":
      // Todo menos Mantenimiento y Usuarios
      return MODULES.filter(
        (m) => !["mantenimiento", "usuarios"].includes(m.id)
      );

    case "ADMIN":
    default:
      // Admin ve todo
      return MODULES;
  }
}

function getRolLabel(rol) {
  switch (rol) {
    case "ADMIN":
      return "Administrador";
    case "FACT1":
      return "Facturación 1";
    case "FACT2":
      return "Facturación 2";
    case "READONLY":
      return "Solo lectura";
    default:
      return rol || "Sin rol";
  }
}

export default function Menu({ user, onLogout }) {
  const [selectedModule, setSelectedModule] = useState("clientes");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();

  const displayName = user?.nombre || user?.email || "Usuario";
  const rolLabel = getRolLabel(user?.rol);
  const initials = (displayName || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // módulos visibles según rol
  const visibleModules = modulesForRole(user?.rol);

  // si cambia el rol o la lista de módulos, asegurar módulo seleccionado válido
  useEffect(() => {
    if (!visibleModules.length) {
      setSelectedModule(null);
      return;
    }
    if (!visibleModules.find((m) => m.id === selectedModule)) {
      setSelectedModule(visibleModules[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.rol, JSON.stringify(visibleModules)]);

  const handleLogoutClick = () => {
    localStorage.removeItem("authUser");
    if (typeof onLogout === "function") {
      onLogout();
    }
    navigate("/login", { replace: true });
  };

  const renderModuleContent = () => {
    switch (selectedModule) {
      case "clientes":
        return <Clientes user={user} />;
      case "hhmm":
        return <Hhmm user={user} />;
      case "auditorias":
        return <Auditorias user={user} />;
      case "mantenimiento":
        return <Mantenimiento user={user} />;
      case "valorizar":
        return <Valorizar user={user} />;
      case "usuarios":
        return <Usuarios user={user} />;
      case "liq_hist":
        return <LiquidacionesClientes user={user}/>;
      default:
        return <div>Selecciona un módulo en la izquierda.</div>;
    }
  };

  return (
    <div className="app-shell">
      {/* HEADER SUPERIOR */}
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo-circle">SFO</div>
          <div>
            <div className="app-header-title">
              Sistema de Facturación Ocupacional
            </div>
            <div className="app-header-subtitle">
              Facturación - SO
            </div>
          </div>
        </div>

        <div className="app-header-right">
          <div className="user-menu">
            <button
              type="button"
              className="user-chip"
              onClick={() => setUserMenuOpen((prev) => !prev)}
            >
              <div className="user-avatar">{initials}</div>
              <div className="user-info">
                <div className="user-name">{displayName}</div>
                <div className="user-role">{rolLabel}</div>
              </div>
              <span className="user-chevron">▾</span>
            </button>

            {userMenuOpen && (
              <div className="user-dropdown">
                <button
                  type="button"
                  className="user-dropdown-item"
                  onClick={handleLogoutClick}
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* CUERPO: SIDEBAR + CONTENIDO */}
      <main className="app-main">
        {/* Sidebar de módulos */}
        <aside className="modules-sidebar">
          <div className="modules-card">
            <h2 className="modules-title">Módulos</h2>
            <p className="modules-subtitle">
              
            </p>                                                                                                                                                                                                           

            <div className="module-list">
              {visibleModules.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={
                    "module-card" +
                    (selectedModule === m.id ? " selected" : "")
                  }
                  onClick={() => setSelectedModule(m.id)}
                >
                  <div className={`module-icon ${m.iconClass}`}>
                    {/* Dejamos vacío, el icono se muestra con ::before */}
                  </div>
                  <div className="module-info-title">{m.title}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Contenido del módulo seleccionado */}
        <section className="module-content">{renderModuleContent()}</section>
      </main>
    </div>
  );
  
}
