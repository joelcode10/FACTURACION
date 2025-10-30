export default function FilterBar({ value, onChange, onSubmit }) {
  const v = value || {};
  return (
    <div className="card row">
      <div className="row">
        <div className="row">
          <label>Desde</label>
          <input
            type="date"
            className="input"
            value={v.dateFrom || ''}
            onChange={(e) => onChange({ ...v, dateFrom: e.target.value })}
          />
        </div>
        <div className="row">
          <label>Hasta</label>
          <input
            type="date"
            className="input"
            value={v.dateTo || ''}
            onChange={(e) => onChange({ ...v, dateTo: e.target.value })}
          />
        </div>
        <div className="row">
          <label>Sede</label>
          <input
            placeholder="(Opcional)"
            className="input"
            value={v.sede || ''}
            onChange={(e) => onChange({ ...v, sede: e.target.value })}
          />
        </div>
        <div className="row">
          <label>Cliente</label>
          <input
            placeholder="(Opcional)"
            className="input"
            value={v.cliente || ''}
            onChange={(e) => onChange({ ...v, cliente: e.target.value })}
          />
        </div>
        <div className="row">
          <label>Condición</label>
          <select
            className="select"
            value={v.condicionPago || ''}
            onChange={(e) => onChange({ ...v, condicionPago: e.target.value })}
          >
            <option value="">(Todas)</option>
            <option value="CREDITO">Crédito</option>
            <option value="CONTADO">Contado</option>
          </select>
        </div>
        <div className="row">
          <label>Valorización</label>
          <select
            className="select"
            value={v.estadoVal || 'ALL'}
            onChange={(e) => onChange({ ...v, estadoVal: e.target.value })}
          >
            <option value="ALL">Todos</option>
            <option value="VAL">Valorizado</option>
            <option value="NOVAL">No valorizado</option>
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={onSubmit}>Filtrar</button>
      </div>
    </div>
  );
}
