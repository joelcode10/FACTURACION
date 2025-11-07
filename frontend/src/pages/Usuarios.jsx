// frontend/src/pages/Usuarios.jsx
import React, { useEffect, useState, useMemo } from "react";
import {
  fetchUsers,
  inviteUser,
  cancelInvite,
  deleteUser,
} from "../lib/api.js";

const ROLES_OPTIONS = [
  { value: "ADMIN", label: "Administrador" },
  { value: "FACT1", label: "Facturación 1" },
  { value: "FACT2", label: "Facturación 2" },
  { value: "READONLY", label: "Solo lectura" },
];

function getEstadoBadge(estado, invitePending) {
  // Solo para mostrar colores
  if (estado === "ACTIVO") {
    return { label: "Activo", className: "users-badge users-badge--activo" };
  }
  if (estado === "INVITADO" && invitePending) {
    return {
      label: "Pendiente",
      className: "users-badge users-badge--pendiente",
    };
  }
  if (estado === "INVITACION_CANCELADA") {
    return {
      label: "Cancelada",
      className: "users-badge users-badge--cancelado",
    };
  }
  return { label: estado || "Sin estado", className: "users-badge" };
}

export default function Usuarios({ user, onLogout }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState("");

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rolSel, setRolSel] = useState("");
  const [search, setSearch] = useState("");

  const canManage = user?.rol === "ADMIN";

  // Carga inicial
  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchUsers();
      if (data.ok) {
        setList(data.users || []);
      } else {
        setError(data.message || "Error al listar usuarios.");
      }
    } catch (err) {
      setError(err.message || "Error al listar usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!canManage) return;

    if (!nombre.trim() || !email.trim() || !rolSel) {
      setError("Completa nombre, correo y rol.");
      return;
    }

    setInviteLoading(true);
    setError("");
    try {
      await inviteUser({ nombre: nombre.trim(), email: email.trim(), rol: rolSel });
      setNombre("");
      setEmail("");
      setRolSel("");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Error al invitar usuario.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCancelInvite = async (id) => {
    if (!canManage) return;
    if (!window.confirm("¿Cancelar la invitación de este usuario?")) return;

    try {
      await cancelInvite(id);
      await loadUsers();
    } catch (err) {
      alert(err.message || "Error al cancelar invitación.");
    }
  };

  const handleDelete = async (id) => {
    if (!canManage) return;
    if (!window.confirm("¿Eliminar esta cuenta de usuario?")) return;

    try {
      await deleteUser(id);
      await loadUsers();
    } catch (err) {
      alert(err.message || "Error al eliminar usuario.");
    }
  };

  const filteredList = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (u) =>
        (u.nombre && u.nombre.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.rol && u.rol.toLowerCase().includes(q))
    );
  }, [list, search]);

  return (
    <div className="module-content">
      <h1>Módulo de Usuarios y Accesos</h1>
      <p className="lead">
        Administra los usuarios del sistema, sus roles y el estado de sus
        invitaciones.
      </p>

      <div className="users-page">
        {/* Bloque de invitar nuevo miembro */}
        {canManage && (
          <div className="users-card users-card--invite">
            <div className="users-card-header">
              <div className="users-card-title-row">
                <div className="users-icon users-icon--blue">👥</div>
                <div>
                  <h2 className="users-title">Invitar nuevo miembro</h2>
                  <p className="users-subtitle">
                    Añade nuevos miembros con los permisos apropiados.
                  </p>
                </div>
              </div>
            </div>

            <form className="users-invite-form" onSubmit={handleInvite}>
              <input
                className="users-input"
                type="text"
                placeholder="Nombre completo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <input
                className="users-input"
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <select
                className="users-select"
                value={rolSel}
                onChange={(e) => setRolSel(e.target.value)}
              >
                <option value="">Seleccionar rol</option>
                {ROLES_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                className="btn-primary users-invite-btn"
                type="submit"
                disabled={inviteLoading}
              >
                {inviteLoading ? "Enviando..." : "Invitar"}
              </button>
            </form>
          </div>
        )}

        {/* Lista de miembros del equipo */}
        <div className="users-card users-card--list">
          <div className="users-card-header users-card-header--list">
            <div className="users-card-title-row">
              <div className="users-icon users-icon--outline">👤</div>
              <div>
                <h2 className="users-title">Miembros del equipo</h2>
                <p className="users-subtitle">
                  {list.length} miembro(s) en el workspace.
                </p>
              </div>
            </div>

            <div className="users-search-wrapper">
              <input
                className="users-search"
                type="text"
                placeholder="Buscar miembro…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="text-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div className="table-wrapper">
            <table className="simple-table users-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Invitación</th>
                  {canManage && <th style={{ width: 140 }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="table-empty">
                      Cargando usuarios…
                    </td>
                  </tr>
                ) : filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="table-empty">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((u) => {
                    const initials =
                      (u.nombre || u.email || "?")
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase();
                    const estadoInfo = getEstadoBadge(u.estado, u.invitePending);

                    let invLabel = "";
                    if (u.estado === "INVITADO" && u.invitePending) {
                      invLabel = "Pendiente";
                    } else if (u.estado === "ACTIVO") {
                      invLabel = "Aceptada";
                    } else if (u.estado === "INVITACION_CANCELADA") {
                      invLabel = "Cancelada";
                    } else {
                      invLabel = "-";
                    }

                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="users-user-cell">
                            <div className="users-avatar">{initials}</div>
                            <div className="users-user-info">
                              <div className="users-user-name">
                                {u.nombre || "(sin nombre)"}
                              </div>
                              <div className="users-user-email">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{u.rol}</td>
                        <td>
                          <span className={estadoInfo.className}>
                            <span className="users-badge-dot"></span>
                            {estadoInfo.label}
                          </span>
                        </td>
                        <td>{invLabel}</td>
                        {canManage && (
                          <td>
                            <div className="users-actions">
                              {u.estado === "INVITADO" && u.invitePending && (
                                <button
                                  type="button"
                                  className="users-action-link"
                                  onClick={() => handleCancelInvite(u.id)}
                                >
                                  Cancelar invitación
                                </button>
                              )}
                              <button
                                type="button"
                                className="users-action-link users-action-link--danger"
                                onClick={() => handleDelete(u.id)}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
