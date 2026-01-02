import { orchestratorService } from '../services/orchestratorService';

export type HarmonizationSummary = {
  highlights: { title: string; summary?: string; reason?: string; timestamp?: string }[];
  clusters: Record<string, any[]>;
  identityHints: any[];
  continuityFlags: any[];
  recommendedSurfaces: string[];
};

const extractHighlights = (payload: any): HarmonizationSummary['highlights'] => {
  const timeline = payload?.timeline?.events ?? [];
  const important = timeline.filter((entry: any) => entry?.impact === 'high');
  const candidates = important.length ? important : timeline.slice(0, 3);
  return candidates.map((entry: any) => ({
    title: entry?.title ?? 'Untitled entry',
    summary: entry?.summary ?? entry?.content,
    reason: entry?.impact === 'high' ? 'high-impact' : 'recent',
    timestamp: entry?.timestamp,
  }));
};

const computeClusters = (timeline: any[] = []): Record<string, any[]> => {
  return timeline.reduce<Record<string, any[]>>((acc, entry) => {
    const tags: string[] = entry?.tags ?? ['untagged'];
    tags.forEach((tag) => {
      acc[tag] = acc[tag] ?? [];
      acc[tag].push(entry);
    });
    return acc;
  }, {});
};

const pickSurfaces = (payload: any): string[] => {
  const surfaces = new Set<string>(['timeline', 'notebook']);
  if ((payload?.identity?.identity?.motifs ?? []).length) {
    surfaces.add('identity');
  }
  if ((payload?.continuity?.conflicts ?? []).length) {
    surfaces.add('continuity');
  }
  if ((payload?.autopilot ?? payload?.tasks)?.length) {
    surfaces.add('tasks');
  }
  return Array.from(surfaces);
};

export class HarmonizationService {
  async compute(userId: string): Promise<HarmonizationSummary> {
    const payload = await orchestratorService.getSummary(userId);

    return {
      highlights: extractHighlights(payload),
      clusters: computeClusters(payload?.timeline?.events ?? []),
      identityHints: payload?.identity?.identity?.motifs ?? [],
      continuityFlags: payload?.continuity?.conflicts ?? [],
      recommendedSurfaces: pickSurfaces(payload),
    };
  }
}

export const harmonizationService = new HarmonizationService();
