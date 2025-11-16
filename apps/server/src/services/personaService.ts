import { v4 as uuidv4 } from 'uuid';

import type { PersonaHistory, PersonaSnapshot } from '../types';

const defaultSnapshot: PersonaSnapshot = {
  version: 'Origin Persona',
  motifs: ['curiosity', 'stability', 'growth'],
  toneProfile: { tone: 'observant', cadence: 'steady' },
  behavioralBiases: { journaling_rhythm: 'steady' },
  emotionalVector: { trend: 'stable', overall_slope: 0 },
  description: 'Baseline persona awaiting more signals.',
  lastUpdated: new Date().toISOString()
};

class PersonaService {
  private store: Map<string, PersonaHistory> = new Map();

  getPersona(userId: string): PersonaSnapshot {
    const history = this.store.get(userId);
    if (!history || !history.snapshots.length) {
      this.store.set(userId, { snapshots: [defaultSnapshot] });
      return defaultSnapshot;
    }
    return history.snapshots[history.snapshots.length - 1];
  }

  updatePersona(userId: string, payload: Partial<PersonaSnapshot>): PersonaSnapshot {
    const history = this.store.get(userId) ?? { snapshots: [defaultSnapshot] };
    const current = { ...history.snapshots[history.snapshots.length - 1] };
    const merged: PersonaSnapshot = {
      ...current,
      ...payload,
      lastUpdated: new Date().toISOString(),
      description:
        payload.description ||
        payload.version ||
        `Persona update ${uuidv4().slice(0, 8)}` ||
        current.description,
    };
    history.snapshots.push(merged);
    this.store.set(userId, history);
    return merged;
  }

  history(userId: string): PersonaHistory {
    return this.store.get(userId) ?? { snapshots: [defaultSnapshot] };
  }
}

export const personaService = new PersonaService();
