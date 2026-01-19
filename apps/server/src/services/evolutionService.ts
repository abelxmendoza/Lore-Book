import { format, parseISO } from 'date-fns';
import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type { EvolutionInsights, MemoryEntry } from '../types';

import { memoryService } from './memoryService';

const openai = new OpenAI({ apiKey: config.openAiKey });

const defaultInsights: EvolutionInsights = {
  personaTitle: 'The Archivist',
  personaTraits: ['Observant', 'Grounded', 'Steady'],
  toneShift: 'Awaiting more entries to learn your evolving tone.',
  emotionalPatterns: [],
  tagTrends: { top: [], rising: [], fading: [] },
  echoes: [],
  reminders: ['Keep logging your lore so the Archivist can evolve with you.'],
  nextEra: 'Name your next arc and keep writing to unlock it.'
};

const topFromMap = (map: Map<string, number>, limit: number) =>
  Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);

class EvolutionService {
  private buildStats(entries: MemoryEntry[]) {
    const tagTotals = new Map<string, number>();
    const moodTotals = new Map<string, number>();
    const chronological = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    chronological.forEach((entry, index) => {
      entry.tags?.forEach((tag) => tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + 1));
      if (entry.mood) {
        moodTotals.set(entry.mood, (moodTotals.get(entry.mood) ?? 0) + 1);
      }

      // lightly weight more recent entries
      const weight = 1 + index / Math.max(1, chronological.length);
      if (entry.tags) {
        entry.tags.forEach((tag) => tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + 0.05 * weight));
      }
    });

    const midpoint = Math.max(1, Math.floor(chronological.length / 2));
    const earlyTags = new Map<string, number>();
    const lateTags = new Map<string, number>();

    chronological.forEach((entry, idx) => {
      const bucket = idx < midpoint ? earlyTags : lateTags;
      entry.tags?.forEach((tag) => bucket.set(tag, (bucket.get(tag) ?? 0) + 1));
    });

    const rising: string[] = [];
    const fading: string[] = [];

    earlyTags.forEach((count, tag) => {
      const lateCount = lateTags.get(tag) ?? 0;
      if (lateCount > count * 1.5 && lateCount >= 2) rising.push(tag);
      if (count > lateCount * 1.5 && count >= 2) fading.push(tag);
    });

    lateTags.forEach((count, tag) => {
      if (!earlyTags.has(tag) && count >= 2) rising.push(tag);
    });

    const monthSummaries = new Map<string, { moods: Map<string, number>; tags: Map<string, number> }>();
    chronological.forEach((entry) => {
      const key = format(parseISO(entry.date), 'yyyy-MM');
      const record = monthSummaries.get(key) ?? { moods: new Map(), tags: new Map() };
      entry.tags?.forEach((tag) => record.tags.set(tag, (record.tags.get(tag) ?? 0) + 1));
      if (entry.mood) record.moods.set(entry.mood, (record.moods.get(entry.mood) ?? 0) + 1);
      monthSummaries.set(key, record);
    });

    return {
      tagTotals,
      moodTotals,
      monthSummaries,
      trends: {
        top: topFromMap(tagTotals, 6),
        rising: Array.from(new Set(rising)).slice(0, 5),
        fading: Array.from(new Set(fading)).slice(0, 5)
      }
    };
  }

  private buildContext(entries: MemoryEntry[]) {
    const snippets = entries.slice(0, 24).map((entry) => {
      const excerpt = entry.summary || entry.content;
      const truncated = excerpt.length > 240 ? `${excerpt.slice(0, 240)}…` : excerpt;
      return `Date: ${entry.date}\nMood: ${entry.mood ?? 'n/a'}\nTags: ${(entry.tags || []).join(', ')}\n${truncated}`;
    });

    return snippets.join('\n---\n');
  }

  async analyze(userId: string): Promise<EvolutionInsights> {
    const entries = await memoryService.searchEntries(userId, { limit: 180 });
    if (!entries.length) return defaultInsights;

    const stats = this.buildStats(entries);
    const emotionalPatterns = topFromMap(stats.moodTotals, 5).map((mood) => `Frequent mood: ${mood}`);

    const message = [
      'You are "The Confidante" — an evolving AI persona.',
      'Given the journal stats, summarize how the persona should evolve.',
      'Return concise JSON with keys: personaTitle (string), personaTraits (string array), toneShift (string),',
      'emotionalPatterns (string array), tagTrends (object with top/rising/fading arrays), echoes (array of {title, referenceDate, quote}),',
      'reminders (string array), nextEra (string).',
      'Echoes should reference meaningful past moments and why they matter now.',
      'Reminders should feel like soulful nudges, not generic advice.'
    ].join(' ');

    const context = [
      `Top tags: ${stats.trends.top.join(', ') || 'n/a'}`,
      `Rising tags: ${stats.trends.rising.join(', ') || 'none'}`,
      `Fading tags: ${stats.trends.fading.join(', ') || 'none'}`,
      `Emotional patterns: ${emotionalPatterns.join(' | ') || 'unknown'}`,
      'Recent entries:',
      this.buildContext(entries)
    ].join('\n\n');

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: message },
          { role: 'user', content: context }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      return {
        ...defaultInsights,
        ...parsed,
        tagTrends: parsed?.tagTrends ?? stats.trends,
        emotionalPatterns: parsed?.emotionalPatterns ?? emotionalPatterns
      } satisfies EvolutionInsights;
    } catch (error) {
      logger.error({ error }, 'Failed to generate evolution insights');
      return { ...defaultInsights, tagTrends: stats.trends, emotionalPatterns };
    }
  }
}

export const evolutionService = new EvolutionService();
