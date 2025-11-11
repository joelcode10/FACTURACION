// frontend/src/App.jsx
import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login.jsx";
import Menu from "./pages/Menu.jsx";
import InviteAccept from "./pages/InviteAccept.jsx";
import Usuarios from "./pages/Usuarios.jsx";
// import Cierre from "./pages/Cierre.jsx"; // si lo usas

function App() {
  // 🔹 Hidratamos el usuario directamente desde localStorage en el primer render
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("authUser");
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Puedes ajustar esta validación si tu objeto user tiene otras propiedades
      if (parsed && parsed.email) {
        return parsed;
      }
      return null;
    } catch (e) {
      console.error("Error leyendo authUser de localStorage:", e);
      return null;
    }
  });

  const handleLogin = (u) => {
    setUser(u);
    localStorage.setItem("authUser", JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("authUser");
  };

  const isAuthenticated = !!user;

  return (
    <Routes>
      {/* Redirección por defecto */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Login */}
      <Route path="/login" element={<Login onLogin={handleLogin} />} />

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

      {/* Completar invitación */}
      <Route path="/invitar/:token" element={<InviteAccept />} />

      {/* Ejemplo Cierre, si lo sigues usando */}
      {/*
      <Route
        path="/cierre"
        element={
          isAuthenticated ? (
            <Cierre user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      */}

      {/* Cualquier otra ruta -> login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
