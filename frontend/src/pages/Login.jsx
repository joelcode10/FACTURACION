// frontend/src/pages/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginApi } from "../lib/api.js";

export default function Login({ onLogin }) {
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!user || !pass) {
      setError("Por favor ingresa usuario y contraseña.");
      return;
    }

    try {
      setLoading(true);
      const resp = await loginApi(user, pass); // llama a /api/auth/login

      if (!resp.ok) {
        setError(resp.message || "Error al iniciar sesión.");
        return;
      }

      if (onLogin) {
        onLogin(resp.user);
      }

      navigate("/menu");
    } catch (err) {
      console.error("Error en login:", err);
      setError(err.message || "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Marca superior */}
        <div className="login-header">
          <h2 className="brand">
            <span className="brand-main">IntegraMédica</span>
          </h2>
        </div>

        {/* Título del sistema */}
        <div className="login-system">
          <h1 className="login-title">SISTEMA DE FACTURACIÓN OCUPACIONAL</h1>
        </div>

        {/* Formulario centrado */}
        <form className="login-form centered-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">Usuario</label>
            <input
              className="login-input"
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="admin"
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

          {error && <div className="login-error">{error}</div>}

          <div className="login-actions">
            <button
              type="submit"
              className="btn-primary"
              style={{ width: "100%" }}
              disabled={loading}
            >
              {loading ? "Ingresando..." : "Ingresar"}
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
