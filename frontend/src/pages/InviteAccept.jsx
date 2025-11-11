// frontend/src/pages/InviteAccept.jsx
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { completeInvite } from "../lib/api";

export default function InviteAccept() {
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
      setError("Debes ingresar y confirmar la contraseña.");
      return;
    }

    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    try {
      setLoading(true);
      const resp = await completeInvite({ token, password });

      if (!resp.ok) {
        throw new Error(resp.message || "No se pudo activar el usuario.");
      }

      setSuccessMsg(
        resp.message ||
          "Contraseña creada y usuario activado. Ya puedes iniciar sesión."
      );
    } catch (err) {
      setError(err.message || "Error al completar la invitación.");
    } finally {
      setLoading(false);
    }
  };

  const irAlLogin = () => {
    navigate("/login");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Encabezado */}
        <div className="login-header">
          <div className="login-logo">IntegraMédica</div>
          <div>
            <h1 className="login-title">Activar cuenta</h1>
          </div>
        </div>

        {/* Formulario */}
        {successMsg ? (
          <>
            <p style={{ fontSize: "0.95rem", marginTop: "1rem" }}>
              {successMsg}
            </p>
            <div className="login-actions" style={{ marginTop: "1.5rem" }}>
              <button
                type="button"
                className="btn-primary"
                style={{ width: "100%" }}
                onClick={irAlLogin}
              >
                Ir al login
              </button>
            </div>
          </>
        ) : (
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
              <label className="login-label">Repite la contraseña</label>
              <input
                className="login-input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="********"
              />
            </div>

            {error && (
              <div
                style={{
                  color: "#b91c1c",
                  fontSize: "0.85rem",
                  marginTop: "0.25rem",
                }}
              >
                {error}
              </div>
            )}

            <div className="login-actions">
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
        )}
      </div>
    </div>
  );
}
