import { differenceInDays, differenceInMonths, parseISO } from 'date-fns';

import type {
  MemoryGraph,
  MemoryGraphEdge,
  MemoryGraphEdgeType,
  MemoryGraphNode,
  MemoryGraphNodeType,
  PeoplePlaceEntity,
  ResolvedMemoryEntry
} from '../types';
import { chapterService } from './chapterService';
import { memoryService } from './memoryService';
import { peoplePlacesService } from './peoplePlacesService';

class MemoryGraphService {
  private addNode(nodes: Map<string, MemoryGraphNode>, node: MemoryGraphNode) {
    if (!nodes.has(node.id)) {
      nodes.set(node.id, node);
    }
  }

  private recencyWeight(date: string): number {
    const months = Math.abs(differenceInMonths(new Date(), parseISO(date)));
    const decayed = Math.max(0.25, 1 - months / 18);
    return Number(decayed.toFixed(3));
  }

  private sentimentScore(mood?: string | null): number {
    if (!mood) return 0;

    const normalized = mood.toLowerCase();
    if (normalized.includes('happy') || normalized.includes('great') || normalized.includes('good')) return 0.8;
    if (normalized.includes('love') || normalized.includes('grateful')) return 0.7;
    if (normalized.includes('calm') || normalized.includes('content')) return 0.5;
    if (normalized.includes('ok') || normalized.includes('fine')) return 0.2;
    if (normalized.includes('tired') || normalized.includes('anxious')) return -0.3;
    if (normalized.includes('sad') || normalized.includes('down')) return -0.6;
    if (normalized.includes('angry') || normalized.includes('furious')) return -0.8;
    return 0;
  }

  private deriveThemes(tags: string[]): string[] {
    const themes = new Set<string>();
    const themeKeywords: Record<string, string[]> = {
      wellbeing: ['health', 'sleep', 'exercise', 'gym', 'run', 'meditation', 'walk'],
      work: ['work', 'career', 'job', 'project', 'meeting', 'client', 'deadline'],
      relationships: ['friend', 'family', 'partner', 'relationship', 'mom', 'dad', 'sibling'],
      creativity: ['art', 'music', 'writing', 'create', 'paint', 'draw'],
      learning: ['study', 'school', 'class', 'course', 'learn', 'reading'],
      adventure: ['trip', 'travel', 'flight', 'hike', 'vacation', 'beach'],
      mindfulness: ['journal', 'therapy', 'mindful', 'gratitude', 'reflection']
    };

    tags.forEach((tag) => {
      const lower = tag.toLowerCase();
      Object.entries(themeKeywords).forEach(([theme, keywords]) => {
        if (keywords.some((keyword) => lower.includes(keyword))) {
          themes.add(theme);
        }
      });
    });

    return Array.from(themes);
  }

  private addEdge(
    edges: Map<string, MemoryGraphEdge>,
    payload: {
      source: string;
      target: string;
      type: MemoryGraphEdgeType;
      weight: number;
      date: string;
      context?: Record<string, unknown>;
    }
  ) {
    const key = `${payload.source}|${payload.target}|${payload.type}`;
    const recency = this.recencyWeight(payload.date);
    const firstSeen = payload.date;
    const lastSeen = payload.date;

    if (edges.has(key)) {
      const existing = edges.get(key)!;
      edges.set(key, {
        ...existing,
        weight: Number((existing.weight + payload.weight).toFixed(3)),
        lastSeen: lastSeen > existing.lastSeen ? lastSeen : existing.lastSeen,
        firstSeen: firstSeen < existing.firstSeen ? firstSeen : existing.firstSeen,
        recency: Math.max(existing.recency, recency),
        context: {
          ...(existing.context ?? {}),
          occurrences: ((existing.context?.occurrences as number | undefined) ?? 1) + 1,
          ...payload.context
        }
      });
      return;
    }

    edges.set(key, {
      source: payload.source,
      target: payload.target,
      type: payload.type,
      weight: Number(payload.weight.toFixed(3)),
      firstSeen,
      lastSeen,
      recency,
      context: { occurrences: 1, ...payload.context }
    });
  }

  private buildEntryNode(entry: ResolvedMemoryEntry): MemoryGraphNode {
    const preview = (entry.summary ?? entry.corrected_content ?? entry.content).slice(0, 140);
    return {
      id: entry.id,
      type: 'event',
      label: entry.date,
      metadata: {
        preview,
        tags: entry.tags,
        mood: entry.mood,
        chapterId: entry.chapter_id,
        source: entry.source
      }
    } satisfies MemoryGraphNode;
  }

  private deriveEntityMap(entities: PeoplePlaceEntity[]): Map<string, PeoplePlaceEntity[]> {
    const map = new Map<string, PeoplePlaceEntity[]>();
    entities.forEach((entity) => {
      (entity.related_entries ?? []).forEach((entryId) => {
        const list = map.get(entryId) ?? [];
        list.push(entity);
        map.set(entryId, list);
      });
    });
    return map;
  }

  async buildGraph(userId: string): Promise<MemoryGraph> {
    const [entries, entities, chapters] = await Promise.all([
      memoryService.searchEntriesWithCorrections(userId, { limit: 250 }),
      peoplePlacesService.listEntities(userId),
      chapterService.listChapters(userId)
    ]);

    const nodes = new Map<string, MemoryGraphNode>();
    const edges = new Map<string, MemoryGraphEdge>();
    const entityByEntry = this.deriveEntityMap(entities);

    entries.forEach((entry) => this.addNode(nodes, this.buildEntryNode(entry)));
    entities.forEach((entity) =>
      this.addNode(nodes, {
        id: entity.id,
        type: entity.type,
        label: entity.name,
        weight: entity.total_mentions,
        metadata: {
          firstMentionedAt: entity.first_mentioned_at,
          lastMentionedAt: entity.last_mentioned_at,
          correctedNames: entity.corrected_names,
          relationshipCounts: entity.relationship_counts
        }
      })
    );
    chapters.forEach((chapter) =>
      this.addNode(nodes, {
        id: `chapter:${chapter.id}`,
        type: 'chapter',
        label: chapter.title,
        metadata: {
          start: chapter.start_date,
          end: chapter.end_date,
          summary: chapter.summary
        }
      })
    );

    const tagCounts = new Map<string, number>();
    const themeCounts = new Map<string, number>();

    entries.forEach((entry) => {
      entry.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1));
      this.deriveThemes(entry.tags).forEach((theme) =>
        themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1)
      );
    });

    tagCounts.forEach((count, tag) =>
      this.addNode(nodes, {
        id: `tag:${tag}`,
        type: 'tag',
        label: `#${tag}`,
        weight: count,
        metadata: { occurrences: count }
      })
    );

    themeCounts.forEach((count, theme) =>
      this.addNode(nodes, {
        id: `theme:${theme}`,
        type: 'theme',
        label: theme,
        weight: count,
        metadata: { occurrences: count }
      })
    );

    entries.forEach((entry) => {
      const entryEntities = entityByEntry.get(entry.id) ?? [];
      const themes = this.deriveThemes(entry.tags);
      const sentiment = this.sentimentScore(entry.mood);

      entry.tags.forEach((tag) => {
        this.addEdge(edges, {
          source: entry.id,
          target: `tag:${tag}`,
          type: 'co_occurrence',
          weight: 1,
          date: entry.date,
          context: { entryId: entry.id }
        });
      });

      themes.forEach((theme) => {
        this.addEdge(edges, {
          source: entry.id,
          target: `theme:${theme}`,
          type: 'co_occurrence',
          weight: 1,
          date: entry.date,
          context: { entryId: entry.id }
        });
      });

      if (entry.chapter_id) {
        this.addEdge(edges, {
          source: entry.id,
          target: `chapter:${entry.chapter_id}`,
          type: 'temporal',
          weight: 1,
          date: entry.date,
          context: { entryId: entry.id }
        });
      }

      entryEntities.forEach((entity) => {
        this.addEdge(edges, {
          source: entry.id,
          target: entity.id,
          type: 'co_occurrence',
          weight: 1,
          date: entry.date,
          context: { entryId: entry.id }
        });

        if (entry.mood) {
          this.addEdge(edges, {
            source: entry.id,
            target: entity.id,
            type: 'emotional',
            weight: Math.max(0.1, Math.abs(sentiment)),
            date: entry.date,
            context: { mood: entry.mood }
          });
        }

        entry.tags.forEach((tag) => {
          this.addEdge(edges, {
            source: entity.id,
            target: `tag:${tag}`,
            type: 'frequency',
            weight: 1,
            date: entry.date,
            context: { entryId: entry.id }
          });
        });
      });

      for (let i = 0; i < entryEntities.length; i++) {
        for (let j = i + 1; j < entryEntities.length; j++) {
          const a = entryEntities[i];
          const b = entryEntities[j];
          this.addEdge(edges, {
            source: a.id,
            target: b.id,
            type: 'co_occurrence',
            weight: 1,
            date: entry.date,
            context: { entryId: entry.id }
          });
        }
      }
    });

    const orderedEntries = [...entries].sort(
      (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
    );

    for (let i = 1; i < orderedEntries.length; i++) {
      const previous = orderedEntries[i - 1];
      const current = orderedEntries[i];
      const sentimentDelta = Math.abs(
        this.sentimentScore(current.mood) - this.sentimentScore(previous.mood)
      );
      const daysBetween = Math.max(
        1,
        differenceInDays(parseISO(current.date), parseISO(previous.date))
      );

      this.addEdge(edges, {
        source: previous.id,
        target: current.id,
        type: 'temporal',
        weight: this.recencyWeight(current.date),
        date: current.date,
        context: { daysBetween }
      });

      if (sentimentDelta > 0 || previous.mood || current.mood) {
        this.addEdge(edges, {
          source: previous.id,
          target: current.id,
          type: 'sentiment_shift',
          weight: Math.max(0.1, sentimentDelta),
          date: current.date,
          context: { from: previous.mood, to: current.mood }
        });
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
      generatedAt: new Date().toISOString()
    } satisfies MemoryGraph;
  }
}

export const memoryGraphService = new MemoryGraphService();
