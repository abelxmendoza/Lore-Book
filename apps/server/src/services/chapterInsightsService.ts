import { differenceInCalendarDays, format, parseISO } from 'date-fns';

import type { ChapterCandidate, ChapterFacet, ChapterProfile, MemoryEntry, MonthGroup } from '../types';
import { correctionService } from './correctionService';
import { chapterService } from './chapterService';
import { memoryService } from './memoryService';

const TRAIT_MAP: Record<string, string> = {
  love: 'heart',
  heartbreak: 'heartbreak',
  work: 'grind',
  career: 'growth',
  study: 'skill-building',
  learning: 'skill-building',
  travel: 'wanderlust',
  loneliness: 'loneliness',
  grief: 'grief',
  focus: 'obsession',
  obsession: 'obsession',
  resilience: 'resilience',
  growth: 'growth'
};

const TITLE_FALLBACKS = ['New Arc', 'Turning Point', 'Fresh Season', 'Quiet Chapter'];

class ChapterInsightsService {
  private groupByMonth(entries: MemoryEntry[]): MonthGroup[] {
    const grouped = entries.reduce<Record<string, MemoryEntry[]>>((acc, entry) => {
      const month = format(parseISO(entry.date), 'yyyy MMMM');
      acc[month] = acc[month] ?? [];
      acc[month].push(entry);
      return acc;
    }, {});

    return Object.entries(grouped).map(([month, monthEntries]) => ({ month, entries: monthEntries }));
  }

  private inferTraits(tags: string[]): string[] {
    const traits = new Set<string>();
    tags.forEach((tag) => {
      const normalized = tag.toLowerCase();
      if (TRAIT_MAP[normalized]) {
        traits.add(TRAIT_MAP[normalized]);
      }
    });
    if (traits.size === 0 && tags.length > 0) {
      traits.add('growth');
    }
    return Array.from(traits);
  }

  private buildFacets(counts: Map<string, number>): ChapterFacet[] {
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 6).map(([label, score]) => ({ label, score }));
  }

  private summarize(entries: MemoryEntry[]): string {
    if (entries.length === 0) return '';
    const [first, last] = [entries[0], entries[entries.length - 1]];
    const intro = (first.summary ?? first.content).slice(0, 160);
    const outro = last === first ? '' : (last.summary ?? last.content).slice(0, 120);
    return [intro, outro].filter(Boolean).join(' … ');
  }

  private extractCounts(entries: MemoryEntry[]) {
    const tagCounts = new Map<string, number>();
    const moodCounts = new Map<string, number>();
    const people = new Map<string, number>();
    const places = new Map<string, number>();

    entries.forEach((entry) => {
      entry.tags.forEach((tag) => {
        const normalized = tag.toLowerCase();
        tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
        if (normalized.startsWith('person:')) {
          people.set(normalized.replace('person:', ''), (people.get(normalized) ?? 0) + 1);
        }
        if (normalized.startsWith('place:')) {
          places.set(normalized.replace('place:', ''), (places.get(normalized) ?? 0) + 1);
        }
      });
      if (entry.mood) {
        const mood = entry.mood.toLowerCase();
        moodCounts.set(mood, (moodCounts.get(mood) ?? 0) + 1);
      }
    });

    return { tagCounts, moodCounts, people, places };
  }

  async buildProfiles(userId: string): Promise<ChapterProfile[]> {
    try {
      // Try to get cached insights first
      const { chapterInsightsCacheService } = await import('./chapterInsightsCacheService');
      const cached = await chapterInsightsCacheService.getCachedInsights(userId);
      if (cached) {
        return cached;
      }

      const [chapters, entries] = await Promise.all([
        chapterService.listChapters(userId),
        memoryService.searchEntries(userId, { limit: 400 })
      ]);
      const resolved = correctionService.applyCorrectionsToEntries(entries);

      const profiles = chapters.map((chapter) => {
      const chapterEntries = resolved.filter((entry) => entry.chapter_id === chapter.id);
      const { tagCounts, moodCounts, people, places } = this.extractCounts(chapterEntries);
      const traits = this.inferTraits(Array.from(tagCounts.keys()));
      const timeline = this.groupByMonth(chapterEntries);
      const titleFallback = TITLE_FALLBACKS[Number(chapter.id?.[0] ?? 0) % TITLE_FALLBACKS.length];

      return {
        ...chapter,
        title: chapter.title || titleFallback,
        entry_ids: chapterEntries.map((entry) => entry.id),
        summary: chapter.summary ?? this.summarize(chapterEntries),
        emotion_cloud: this.buildFacets(moodCounts.size > 0 ? moodCounts : tagCounts),
        top_tags: this.buildFacets(tagCounts),
        chapter_traits: traits,
        featured_people: this.buildFacets(people).map((facet) => facet.label),
        featured_places: this.buildFacets(places).map((facet) => facet.label),
        timeline
      } satisfies ChapterProfile;
    });

      // Cache the profiles for future use
      await chapterInsightsCacheService.cacheInsights(userId, profiles);

      return profiles;
    } catch (error) {
      // Return empty array on error (e.g., tables don't exist)
      return [];
    }
  }

  async detectCandidates(userId: string): Promise<ChapterCandidate[]> {
    try {
      const entries = await memoryService.searchEntries(userId, { limit: 400 });
      const resolved = correctionService.applyCorrectionsToEntries(entries).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const candidates: MemoryEntry[][] = [];
      resolved.forEach((entry) => {
        const current = candidates.at(-1);
        if (!current || this.shouldStartNewChapter(current[current.length - 1], entry)) {
          candidates.push([entry]);
          return;
        }
        current.push(entry);
      });

      return candidates
        .filter((group) => group.length >= 2)
        .map((group, index) => this.toCandidate(group, index));
    } catch (error) {
      // Return empty array on error (e.g., tables don't exist)
      return [];
    }
  }

  private shouldStartNewChapter(prev: MemoryEntry, next: MemoryEntry): boolean {
    const gap = differenceInCalendarDays(parseISO(next.date), parseISO(prev.date));
    const tagOverlap = this.computeTagOverlap(prev.tags, next.tags);
    return gap > 21 || tagOverlap < 0.25;
  }

  private computeTagOverlap(previous: string[], incoming: string[]): number {
    if (previous.length === 0 || incoming.length === 0) return 0;
    const prevSet = new Set(previous.map((tag) => tag.toLowerCase()));
    const nextSet = new Set(incoming.map((tag) => tag.toLowerCase()));
    let shared = 0;
    prevSet.forEach((tag) => {
      if (nextSet.has(tag)) shared += 1;
    });
    const total = prevSet.size + nextSet.size - shared;
    return total === 0 ? 0 : shared / total;
  }

  private toCandidate(entries: MemoryEntry[], index: number): ChapterCandidate {
    const tagCounts = new Map<string, number>();
    entries.forEach((entry) => entry.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)));
    const traits = this.inferTraits(Array.from(tagCounts.keys()));
    const title = this.buildFacets(tagCounts)[0]?.label ?? TITLE_FALLBACKS[index % TITLE_FALLBACKS.length];

    const startDate = entries[0]?.date ?? new Date().toISOString();
    const endDate = entries.at(-1)?.date ?? startDate;

    return {
      id: `candidate-${index + 1}`,
      chapter_title: title,
      start_date: startDate,
      end_date: endDate,
      summary: this.summarize(entries),
      chapter_traits: traits,
      entry_ids: entries.map((entry) => entry.id),
      confidence: Math.min(1, 0.4 + entries.length * 0.05 + traits.length * 0.1)
    };
  }
}

export const chapterInsightsService = new ChapterInsightsService();
