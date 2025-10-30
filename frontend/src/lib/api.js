import axios from 'axios';

// Ajusta si backend corre en otra IP/puerto
export const API = axios.create({
  baseURL: 'http://localhost:4000/api',
  timeout: 30000
});

export async function fetchCierre(params) {
  const { data } = await API.get('/cierre', { params });
  return data;
}

export async function postLog(body) {
  try { await API.post('/logs', body); } catch { /* noop */ }
}
