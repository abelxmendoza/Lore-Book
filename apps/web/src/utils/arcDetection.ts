import { fetchJson } from '../lib/api';

export type ArcSuggestion = {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
};

export const findLocalArcThemes = (text: string): ArcSuggestion[] => {
  const themes: ArcSuggestion[] = [];
  const normalized = text.toLowerCase();

  if (/startup|founder|pitch|investor/.test(normalized)) {
    themes.push({
      id: 'startup_transition',
      title: 'Startup Transition',
      rationale: 'You are describing founder or pitch energy.',
      confidence: 0.7
    });
  }

  if (/training|fight|spar|gym|dojo|competition/.test(normalized)) {
    themes.push({
      id: 'training_arc',
      title: 'Training Grind',
      rationale: 'Mentions of sparring and structured practice.',
      confidence: 0.6
    });
  }

  if (/heartbreak|grief|loss|healing/.test(normalized)) {
    themes.push({
      id: 'recovery_arc',
      title: 'Heartbreak Recovery',
      rationale: 'Emotional healing thread detected.',
      confidence: 0.52
    });
  }

  return themes;
};

export const fetchArcSuggestions = async (text: string): Promise<ArcSuggestion[]> => {
  if (!text.trim()) return [];
  try {
    const params = new URLSearchParams({ text });
    const { arcs } = await fetchJson<{ arcs: ArcSuggestion[] }>(`/api/arcs/suggestions?${params.toString()}`);
    return arcs;
  } catch {
    return findLocalArcThemes(text);
  }
};
