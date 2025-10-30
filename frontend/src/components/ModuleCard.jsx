export default function ModuleCard({ title, description, onClick }) {
  return (
    <button className="module-card" onClick={onClick}>
      <div className="module-icon">📄</div>
      <div className="module-body">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="module-arrow">→</div>
    </button>
  );
}
