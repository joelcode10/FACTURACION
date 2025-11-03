// frontend/src/components/ModuleCard.jsx
export default function ModuleCard({ title, description, icon, iconClass, onClick }) {
  return (
    <div className="module-card" onClick={onClick}>
      <div className={`module-icon ${iconClass || ""}`}>{icon}</div>
      <div className="module-body">
        <h3 className="module-title">{title}</h3>
        <p className="module-desc">{description}</p>
      </div>
    </div>
  );
}
