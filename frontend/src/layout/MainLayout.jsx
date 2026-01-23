import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

// === CORRECCIÓN DE RUTAS (Según tu imagen) ===
import ClientesPage from "../pages/Clientes.jsx";

import AuditoriaPage from "../pages/Auditorias.jsx"; // En tu imagen es plural

import ValorizarPage from "../pages/Valorizar.jsx";
import UsuariosPage from "../pages/Usuarios.jsx";
import LiquidacionesClientes from "../pages/LiquidacionesClientes.jsx";
// Si tienes histórico, impórtalo, si no, usaremos un placeholder.

function MainLayout() {
  const { user, logout } = useAuth();
  const [selectedModule, setSelectedModule] = useState("clientes");

  function renderModule() {
    switch (selectedModule) {
      case "clientes": return <ClientesPage />;
      case "auditoria": return <AuditoriaPage />;
      case "valorizar": return <ValorizarPage />;
      case "usuarios": return <UsuariosPage />;
      case "historico": return <LiquidacionesClientes/>;
      default: return <ClientesPage />;
    }
  }

  // Clase para resaltar el botón activo
  const navClass = (name) => `nav-item ${selectedModule === name ? "active" : ""}`;

  return (
    <div className="app-shell">
      
      {/* === BARRA SUPERIOR (NAVBAR) === */}
      <nav className="navbar">
        {/* Izquierda: Logo */}
        <div className="navbar-left">
          <div className="navbar-logo">CB</div>
          <span className="navbar-title">Sistema Liquidaciones</span>
        </div>

        {/* Centro: Menú Horizontal */}
        <div className="navbar-center">
          <div className={navClass("clientes")} onClick={() => setSelectedModule("clientes")}>Liquidación</div>
          <div className={navClass("auditoria")} onClick={() => setSelectedModule("auditoria")}>Auditorías</div>
          <div className={navClass("valorizar")} onClick={() => setSelectedModule("valorizar")}>Valorizar</div>
          <div className={navClass("usuarios")} onClick={() => setSelectedModule("usuarios")}>Usuarios</div>
          <div className={navClass("historico")} onClick={() => setSelectedModule("historico")}>Histórico</div>
        </div>

        {/* Derecha: Usuario */}
        <div className="navbar-right">
          <div className="user-info">
            <span className="user-name">{user?.username || "Admin"}</span>
            <span className="user-role">Conectado</span>
          </div>
          <button className="btn-logout" onClick={logout}>Salir</button>
        </div>
      </nav>

      {/* === CONTENIDO (ANCHO COMPLETO) === */}
      <main className="main-content-full">
        {renderModule()}
      </main>

    </div>
  );
}

export default MainLayout;