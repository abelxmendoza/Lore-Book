import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EmotionType } from './emotionInferenceTypes';

export type EmotionalArcState = Record<string, EmotionType[]>;

function arcKeyFromPerson(personName: string): string {
  return normalizeNameKey(personName);
}

export function extractArcPersonKey(text: string): string | null {
  const m = text.match(/\b([A-Z][a-z]+)\b/);
  if (!m) return null;
  const skip = new Set(['i', 'the', 'my', 'we', 'after', 'when', 'today']);
  if (skip.has(m[1].toLowerCase())) {
    const next = text.match(/\b(?:with|from|when)\s+([A-Z][a-z]+)\b/);
    return next ? arcKeyFromPerson(next[1]) : null;
  }
  return arcKeyFromPerson(m[1]);
}

export function appendArcPhase(
  priorArcPhases: EmotionalArcState,
  personKey: string,
  emotionType: EmotionType,
): { arcPhase: string; updatedArc: EmotionalArcState } {
  const existing = priorArcPhases[personKey] ?? [];
  if (existing.includes(emotionType)) {
    return {
      arcPhase: `${personKey}:${existing.join(' → ')}`,
      updatedArc: priorArcPhases,
    };
  }
  const next = [...existing, emotionType];
  return {
    arcPhase: `${personKey}:${next.join(' → ')}`,
    updatedArc: { ...priorArcPhases, [personKey]: next },
  };
}

export function mergeArcStates(base: EmotionalArcState, incoming: EmotionalArcState): EmotionalArcState {
  const merged = { ...base };
  for (const [key, phases] of Object.entries(incoming)) {
    const existing = merged[key] ?? [];
    merged[key] = [...new Set([...existing, ...phases])];
  }
  return merged;
}
