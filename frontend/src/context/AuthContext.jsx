// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { loginApi } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // { id, username, email, roles }
  const [token, setToken] = useState(null);      // JWT
  const [loading, setLoading] = useState(true);  // cargando inicial
  const [error, setError] = useState(null);

  // Al cargar la app, recuperar sesión desde localStorage (si existe)
  useEffect(() => {
    const saved = localStorage.getItem("cbmedic_auth");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed.user || null);
        setToken(parsed.token || null);
      } catch {
        // si falla el parse, ignoramos
      }
    }
    setLoading(false);
  }, []);

  async function login(username, password) {
    setError(null);
    try {
      const data = await loginApi(username, password);
      if (!data.ok) {
        throw new Error(data.message || "Credenciales inválidas");
      }

      const { user, token } = data;
      setUser(user);
      setToken(token);
      localStorage.setItem("cbmedic_auth", JSON.stringify({ user, token }));
      return true;
    } catch (err) {
      console.error("Error en login:", err);
      setError(err.message || "Error al iniciar sesión");
      return false;
    }
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("cbmedic_auth");
  }

  const value = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    loading,
    error,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
