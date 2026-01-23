// frontend/src/pages/Menu.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

// Importaciones de tus módulos (Mantenemos tus rutas originales)
import Clientes from "./Clientes.jsx";

import Auditorias from "./Auditorias.jsx";
import Valorizar from "./Valorizar.jsx";
import Usuarios from "./Usuarios.jsx";
import LiquidacionesClientes from "./LiquidacionesClientes.jsx"; // Si usas este

// === CONSTANTES Y LÓGICA DE ROLES (INTACTA) ===
const MODULES = [
  { id: "clientes", title: "Liquidación", iconClass: "lc" },,
  { id: "auditorias", title: "Auditorías", iconClass: "aud" },
  { id: "valorizar", title: "Valorizar", iconClass: "val" },
  { id: "usuarios", title: "Usuarios", iconClass: "rc" },
  { id: "liq_hist", title: "Histórico", iconClass: "hist" },
];

function modulesForRole(rol) {
  switch (rol) {
    case "FACT1": return MODULES.filter((m) => ["clientes", "valorizar", "liq_hist"].includes(m.id));
    case "FACT2": return MODULES.filter((m) => ["auditorias"].includes(m.id));
    case "READONLY": return MODULES.filter((m) => !["mantenimiento", "usuarios"].includes(m.id));
    case "ADMIN":
    default: return MODULES;
  }
}

function getRolLabel(rol) {
  switch (rol) {
    case "ADMIN": return "Administrador";
    case "FACT1": return "Facturación 1";
    case "FACT2": return "Facturación 2";
    case "READONLY": return "Solo lectura";
    default: return rol || "Sin rol";
  }
}

export default function Menu({ user, onLogout }) {
  const [selectedModule, setSelectedModule] = useState("clientes");
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const displayName = user?.nombre || user?.email || "Usuario";
  const rolLabel = getRolLabel(user?.rol);

  // Determinar módulos visibles según rol
  const initials = (displayName || "U").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const visibleModules = modulesForRole(user?.rol);

  // Efecto para asegurar que si cambia el rol, no nos quedemos en un módulo prohibido
  useEffect(() => {
    if (!visibleModules.length) { setSelectedModule(null); return; }
    if (!visibleModules.find((m) => m.id === selectedModule)) {
      setSelectedModule(visibleModules[0].id);
    }
  }, [user?.rol]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogoutClick = () => {
    localStorage.removeItem("authUser");
    if (typeof onLogout === "function") {
      onLogout();
    }
    navigate("/login", { replace: true });
  };

  const renderModuleContent = () => {
    switch (selectedModule) {
      case "clientes": return <Clientes user={user} />;
      case "auditorias": return <Auditorias user={user} />;
      case "valorizar": return <Valorizar user={user} />;
      case "usuarios": return <Usuarios user={user} />;
      case "liq_hist": return <LiquidacionesClientes user={user} />;
      default: return <div style={{padding:20}}>Selecciona un módulo arriba.</div>;
    }
  };

  return (
    <div className="app-shell">
      
      {/* NAVBAR */}
      <nav className="navbar">
        {/* Izquierda */}
        <div className="navbar-left">
          <div className="navbar-logo">SISFO</div>
        </div>

        {/* Centro (Módulos Píldora) */}
        <div className="navbar-center">
          {visibleModules.map((m) => (
            <div
              key={m.id}
              className={`nav-item ${selectedModule === m.id ? "active" : ""}`}
              onClick={() => setSelectedModule(m.id)}
            >
              {m.title}
            </div>
          ))}
        </div>

        {/* Derecha (Menú Desplegable) */}
        <div className="navbar-right" ref={menuRef}>
          <div className="user-menu-container">
            {/* Gatillo del Menú */}
            <div className="user-trigger" onClick={() => setMenuOpen(!menuOpen)}>
              <div className="user-details">
                <span className="user-name">{displayName}</span>
                <span className="user-role">{rolLabel}</span>
              </div>
              <div className="user-avatar">{initials}</div>
              <span style={{fontSize: '10px', color:'#94A3B8'}}>▼</span>
            </div>

            {/* Menú Flotante */}
            {menuOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-item danger" onClick={handleLogoutClick}>
                  🚪 Cerrar Sesión
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* CONTENIDO */}
      <main className="main-content-full">
        <section className="module-content" style={{padding:0, background:'transparent', boxShadow:'none'}}>
            {renderModuleContent()}
        </section>
      </main>

    </div>
  );
}