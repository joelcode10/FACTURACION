// src/pages/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [user, setUser] = useState("admin@botinteligent.local");
  const [pass, setPass] = useState("123456");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // Por ahora sin validación real
    navigate("/menu");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Encabezado */}
        <div className="login-header">
          <div className="login-logo">CBMEDIC</div>
          <div>
            <h1 className="login-title">Sistema de Liquidación para Facturación</h1>
            <div className="login-subtitle">Control y gestión de facturación y honorarios</div>
          </div>
        </div>

        {/* Formulario */}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">Usuario</label>
            <input
              className="login-input"
              type="email"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="usuario@empresa.com"
            />
          </div>

          <div className="login-field">
            <label className="login-label">Contraseña</label>
            <input
              className="login-input"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="********"
            />
          </div>

          <div className="login-actions">
            <button type="submit" className="btn-primary" style={{ width: "100%" }}>
              Ingresar
            </button>
          </div>

          <div className="login-footer">
            ¿Olvidaste tu contraseña? <a href="#">Recuperar</a>
          </div>
        </form>
      </div>
    </div>
  );
}
