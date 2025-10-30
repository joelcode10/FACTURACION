import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import { fetchCierre, postLog } from '../lib/api.js';
import * as XLSX from 'xlsx';

export default function Cierre() {
  return (
    <div className="container">
      <h2 className="section-title">Reporte de Cierre</h2>

      <div className="card">
        <div className="filters">
          <div>
            <label className="label">Desde</label>
            <input type="date" className="input date" />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" className="input date" />
          </div>
          <div>
            <label className="label">Sede (opcional)</label>
            <input className="input" placeholder="Ej. Megaplaza" />
          </div>
          <div>
            <label className="label">Cliente (opcional)</label>
            <input className="input" placeholder="Nombre cliente" />
          </div>
          <div>
            <label className="label">Condición</label>
            <select className="input">
              <option>Todas</option>
              <option>Crédito</option>
              <option>Contado</option>
            </select>
          </div>
          <div className="actions">
            <button className="btn primary">Filtrar</button>
            <button className="btn">Exportar</button>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Unidad Producción</th>
              <th>Tipo Evaluación</th>
              <th>Sede</th>
              <th className="cell-right">Bruto</th>
              <th className="cell-right">IGV</th>
              <th className="cell-right">Total</th>
              <th>Facturado</th>
              <th>Comprobante</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan="9" style={{textAlign:'center', color:'#64748b'}}>Sin resultados</td></tr>
          </tbody>
        </table>

        <div className="totals-bar">
          <button className="btn">Exportar</button>
          <span className="stat">Seleccionados: 0</span>
          <span className="stat">Sub Total: 0.00</span>
          <span className="stat">IGV: 0.00</span>
          <span className="stat">Total: 0.00</span>
        </div>
      </div>
    </div>
  );
}
