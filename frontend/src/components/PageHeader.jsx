export default function PageHeader({ title, children }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <div className="row">{children}</div>
    </div>
  );
}
