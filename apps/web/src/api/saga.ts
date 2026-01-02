import { fetchJson } from '../lib/api';

export type SagaChapter = { id: string; title: string; summary: string; turningPoint?: boolean };

export type SagaOverview = {
  era: string;
  arcs: { id: string; label: string; intensity: number }[];
  chapters: SagaChapter[];
};

export const fetchSaga = async () => {
  try {
    const [sagaResponse, chaptersResponse] = await Promise.all([
      fetchJson<{ title?: string; arcs?: string[]; seasons?: any }>('/api/orchestrator/saga'),
      fetchJson<{ chapters?: Array<{ id: string; title: string; summary?: string; start_date?: string; end_date?: string }> }>('/api/chapters').catch(() => ({ chapters: [] }))
    ]);
    
    // Transform backend format to frontend format
    const saga: SagaOverview = {
      era: sagaResponse.title || 'Current Era',
      arcs: (sagaResponse.arcs || []).map((arc, idx) => ({
        id: arc,
        label: arc,
        intensity: Math.max(0.3, 0.7 - (idx * 0.1)) // Decreasing intensity, min 0.3
      })),
      chapters: (chaptersResponse.chapters || []).map(ch => ({
        id: ch.id,
        title: ch.title,
        summary: ch.summary || '',
        turningPoint: false
      }))
    };
    return { saga };
  } catch (error) {
    // Return default saga on error
    return {
      saga: {
        era: 'Current Era',
        arcs: [],
        chapters: []
      }
    };
  }
};
