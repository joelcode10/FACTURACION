import { useNavigate } from "react-router-dom";

export default function Menu() {
  const navigate = useNavigate();

  const items = [
    {
      key: "clientes",
      title: "Liquidación de Clientes",
      desc: "Procesar, filtrar y exportar liquidaciones.",
      color: "icon-blue",
      onClick: () => navigate("/clientes"),
    },
    {
      key: "hhmm",
      title: "Honorarios Médicos",
      desc: "Cálculo y consolidado de HH.MM.",
      color: "icon-green",
      onClick: () => alert("Próximo paso: /hhmm"),
    },
    {
      key: "auditorias",
      title: "Auditorías",
      desc: "Control y liquidación por auditor.",
      color: "icon-amber",
      onClick: () => alert("Próximo paso: /auditorias"),
    },
    {
      key: "mantenimiento",
      title: "Mantenimiento HHMM",
      desc: "Configurar costos y paquetes.",
      color: "icon-purple",
      onClick: () => alert("Próximo paso: /mantenimiento"),
    },
    {
      key: "valorizar",
      title: "Valorizar",
      desc: "Asignar comprobantes y exportar.",
      color: "icon-rose",
      onClick: () => alert("Próximo paso: /valorizar"),
    },
  ];

  const cerrarSesion = () => navigate("/login");

  return (
    <div className="page">
      <div className="card modules-card">
        <div className="toolbar">
          <h1 className="title" style={{ margin: 0 }}>Módulos</h1>
          <div className="header-actions">
            <button className="btn" onClick={cerrarSesion}>Cerrar sesión</button>
          </div>
        </div>

        <div className="modules-grid">
          {items.map((it) => (
            <div key={it.key} className="module-card" onClick={it.onClick}>
              <div className={`module-icon ${it.color}`}>{it.title[0]}</div>
              <div className="module-title">{it.title}</div>
              <div className="module-desc">{it.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
