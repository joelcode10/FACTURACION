// frontend/src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/Login.jsx";
import MenuPage from "./pages/Menu.jsx";
import ClientesPage from "./pages/Clientes.jsx";
import CierrePage from "./pages/Cierre.jsx";
import HhmmPage from "./pages/Hhmm.jsx"; // <--- nuevo

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/hhmm" element={<HhmmPage />} /> {/* nuevo módulo */}
        <Route path="/cierre" element={<CierrePage />} />
        {/* redirección por defecto */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}
