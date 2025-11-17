import { spawnSync } from 'node:child_process';

import type { ClassifiedEvent } from './githubClassifier';

export type MilestoneSummary = {
  title: string;
  summary: string;
  significance: number;
  metadata: Record<string, unknown>;
};

const buildFallbackSummary = (events: ClassifiedEvent[]): MilestoneSummary => {
  const classifications = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.classification] = (acc[event.classification] ?? 0) + 1;
    return acc;
  }, {});

  const title = 'GitHub milestone';
  const summaryParts = Object.entries(classifications)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${count} ${label.toLowerCase()} events`);

  return {
    title,
    summary: summaryParts.length ? summaryParts.join('; ') : 'Captured meaningful GitHub activity.',
    significance: Math.min(events.length, 10),
    metadata: { classifications }
  } satisfies MilestoneSummary;
};

export const runPythonSummarizer = (events: ClassifiedEvent[]): MilestoneSummary => {
  try {
    const payload = JSON.stringify({ events });
    const result = spawnSync('python3', ['-m', 'lorekeeper.github.summarizer'], {
      input: payload,
      encoding: 'utf-8',
      maxBuffer: 1024 * 500
    });

    if (result.status === 0 && result.stdout) {
      const parsed = JSON.parse(result.stdout.trim());
      return parsed as MilestoneSummary;
    }
  } catch (error) {
    console.warn('Python summarizer unavailable, using fallback', error);
  }

  return buildFallbackSummary(events);
};
