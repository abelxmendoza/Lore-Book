import { fetchJson } from '../lib/api';

const orchestrator = {
  summary: () => fetchJson('/api/orchestrator/summary'),
  timeline: () => fetchJson('/api/orchestrator/timeline'),
  identity: () => fetchJson('/api/orchestrator/identity'),
  continuity: () => fetchJson('/api/orchestrator/continuity'),
  saga: () => fetchJson('/api/orchestrator/saga')
};

const api = { orchestrator };

export default api;
