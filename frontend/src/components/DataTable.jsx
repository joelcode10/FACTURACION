export default function DataTable({ rows }) {
  return (
    <div className="card" style={{ overflow: 'auto', maxHeight: '60vh' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Unidad Producción</th>
            <th>Tipo Evaluación</th>
            <th>Sede</th>
            <th>Bruto</th>
            <th>IGV</th>
            <th>Total</th>
            <th>Facturado</th>
            <th>Comprobante</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.CLIENTE}</td>
              <td>{r.UNIDAD_PRODUCCION || '-'}</td>
              <td>{r.TIPO_EVALUACION}</td>
              <td>{r.SEDE}</td>
              <td>{Number(r.BRUTO || 0).toFixed(2)}</td>
              <td>{Number(r.IGV || 0).toFixed(2)}</td>
              <td>{Number(r.TOTAL || 0).toFixed(2)}</td>
              <td>{(typeof r.FACTURADO === 'boolean' ? (r.FACTURADO ? 'Sí' : 'No') : (String(r.FACTURADO).toUpperCase() === 'SI' ? 'Sí' : 'No'))}</td>
              <td>
                {r.COMP_TIPO
                  ? `${r.COMP_TIPO} ${r.COMP_SERIE || ''}-${r.COMP_NUMERO || ''}`
                  : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 16 }}>Sin resultados</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
