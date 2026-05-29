import { fetchJson } from '../lib/api';

export type SagaChapter = { id: string; title: string; summary: string; turningPoint?: boolean };

export type SagaOverview = {
  era: string;
  arcs: { id: string; label: string; intensity: number }[];
  chapters: SagaChapter[];
};

type LifeArc = {
  id: string;
  title: string;
  arc_type: string;
  is_active: boolean;
  confidence: number;
  summary: string | null;
  start_date: string | null;
  end_date: string | null;
};

export const fetchSaga = async (): Promise<{ saga: SagaOverview }> => {
  try {
    const [arcsResponse, chaptersResponse] = await Promise.all([
      fetchJson<{ success: boolean; arcs: LifeArc[] }>('/api/life-arcs').catch(() => ({ success: false, arcs: [] })),
      fetchJson<{ chapters?: Array<{ id: string; title: string; summary?: string }> }>('/api/chapters').catch(() => ({ chapters: [] })),
    ]);

    const arcs = arcsResponse.arcs ?? [];

    // Use the most recent active arc's title as the current era label
    const activeArcs = arcs.filter(a => a.is_active);
    const eraArc = activeArcs.find(a => a.arc_type === 'life_era') ?? activeArcs[0] ?? arcs[0];
    const era = eraArc?.title ?? 'Current Era';

    // Sort by confidence descending, cap at 8 for the canvas
    const arcCurves = [...arcs]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
      .map(a => ({
        id: a.id,
        label: a.title,
        intensity: Math.round(a.confidence * 100),
      }));

    const chapters: SagaChapter[] = (chaptersResponse.chapters ?? []).map(ch => ({
      id: ch.id,
      title: ch.title,
      summary: ch.summary ?? '',
      turningPoint: false,
    }));

    return { saga: { era, arcs: arcCurves, chapters } };
  } catch {
    return { saga: { era: 'Current Era', arcs: [], chapters: [] } };
  }
};
