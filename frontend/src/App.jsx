// frontend/src/App.jsx
import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login.jsx";
import Menu from "./pages/Menu.jsx";
import InviteAccept from "./pages/InviteAccept.jsx";
import Usuarios from "./pages/Usuarios.jsx";

function App() {
  const [user, setUser] = useState(null);

  const handleLogin = (u) => {
    setUser(u);
  };

  const handleLogout = () => {
    setUser(null);
  };

  const isAuthenticated = !!user;

  return (
    <Routes>
      {/* Redirección por defecto:
          - Si está logueado => /menu
          - Si no => /login */}
      <Route
        path="/"
        element={
          <Navigate
            to={isAuthenticated ? "/menu" : "/login"}
            replace
          />
        }
      />

      {/* Login */}
      <Route
        path="/login"
        element={<Login onLogin={handleLogin} />}
      />

      {/* Menú principal (layout con módulos) */}
      <Route
        path="/menu"
        element={
          isAuthenticated ? (
            <Menu user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Usuarios y accesos */}
      <Route
        path="/usuarios"
        element={
          isAuthenticated ? (
            <Usuarios user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Pantalla para completar invitación: /invitar/:token */}
      <Route path="/invitar/:token" element={<InviteAccept />} />

      {/* Cualquier otra ruta -> login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
