export type ClassifiedEvent = {
  type: string;
  payload: any;
  created_at?: string;
  classification: GithubClassification;
};

export type GithubClassification =
  | 'FEATURE'
  | 'BUGFIX'
  | 'REFACTOR'
  | 'RELEASE'
  | 'ARCHITECTURE'
  | 'DOCUMENTATION'
  | 'NEW_REPO'
  | 'COLLABORATION'
  | 'BREAKTHROUGH'
  | 'RESEARCH'
  | 'MILESTONE';

const keywordMap: Record<GithubClassification, RegExp[]> = {
  FEATURE: [/add/i, /feature/i, /implement/i, /build/i, /introduce/i],
  BUGFIX: [/fix/i, /bug/i, /issue/i, /error/i, /regression/i],
  REFACTOR: [/refactor/i, /cleanup/i, /restructure/i, /tidy/i],
  RELEASE: [/release/i, /version/i, /tagged/i],
  ARCHITECTURE: [/core/i, /engine/i, /framework/i, /architecture/i],
  DOCUMENTATION: [/docs/i, /documentation/i, /readme/i, /guide/i],
  NEW_REPO: [/init/i, /initial/i, /scaffold/i],
  COLLABORATION: [/merge/i, /pair/i, /contributor/i, /co-authored/i],
  BREAKTHROUGH: [/breakthrough/i, /major/i, /milestone/i, /launch/i],
  RESEARCH: [/experiment/i, /research/i, /spike/i, /prototype/i],
  MILESTONE: [/milestone/i, /launch/i, /release/i]
};

export const classifyEvent = (message: string, files: string[] = []): GithubClassification => {
  const normalized = message.toLowerCase();
  const isDocs = files.some((file) => file.toLowerCase().includes('readme') || file.endsWith('.md'));
  if (isDocs) return 'DOCUMENTATION';

  for (const [classification, patterns] of Object.entries(keywordMap) as [GithubClassification, RegExp[]][]) {
    if (patterns.some((pattern) => pattern.test(normalized))) {
      return classification;
    }
  }

  if (files.some((file) => file.includes('src/core') || file.includes('src/engine'))) {
    return 'ARCHITECTURE';
  }

  return 'FEATURE';
};

export const classifyEvents = (events: { type: string; payload: any; created_at?: string }[]): ClassifiedEvent[] => {
  return events.map((event) => {
    const message = event.payload?.message ?? event.payload?.title ?? event.type;
    const files: string[] = event.payload?.files ?? [];
    return {
      ...event,
      classification: classifyEvent(message ?? event.type, files)
    } satisfies ClassifiedEvent;
  });
};
