// src/App.jsx
import { Routes, Route, Link, Navigate } from "react-router-dom";
import ClientesPage from "./pages/Clientes.jsx";

function Home() {
  return (
    <div className="container">
      <h1>Sistema de Liquidaciones</h1>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Link to="/clientes" className="card">Liquidación de Clientes →</Link>
        <div className="card" style={{ opacity: 0.6 }}>HHMM (próx.)</div>
        <div className="card" style={{ opacity: 0.6 }}>Auditorías (próx.)</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/clientes" element={<ClientesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
