// frontend/src/pages/InviteComplete.jsx
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { completeInvite } from "../lib/api";

export default function InviteComplete() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!password || !confirm) {
      setError("Completa ambos campos de contraseña.");
      return;
    }

    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const resp = await completeInvite({ token, password });
      if (!resp.ok) {
        throw new Error(resp.message || "No se pudo completar la invitación.");
      }
      setSuccessMsg(
        resp.message || "Contraseña creada. Ya puedes iniciar sesión."
      );
      // Opcional: redirigir al login después de unos segundos
      setTimeout(() => navigate("/"), 2500);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al completar la invitación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">IntegraMédica</div>
          <div>
            <h1 className="login-title">Activar cuenta</h1>
            <div className="login-subtitle">
              Crea tu contraseña para ingresar al sistema.
            </div>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">Nueva contraseña</label>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
            />
          </div>

          <div className="login-field">
            <label className="login-label">Confirmar contraseña</label>
            <input
              className="login-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="********"
            />
          </div>

          {error && (
            <div style={{ color: "#b91c1c", fontSize: "0.85rem", marginTop: 4 }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div style={{ color: "#16a34a", fontSize: "0.85rem", marginTop: 4 }}>
              {successMsg}
            </div>
          )}

          <div className="login-actions" style={{ marginTop: "1.2rem" }}>
            <button
              type="submit"
              className="btn-primary"
              style={{ width: "100%" }}
              disabled={loading}
            >
              {loading ? "Guardando..." : "Guardar contraseña"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
