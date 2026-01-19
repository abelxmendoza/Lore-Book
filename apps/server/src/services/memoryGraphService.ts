import crypto from 'node:crypto';

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
      generatedAt: new Date().toISOString(),
      entryCount: entries.length
    } satisfies MemoryGraph;
  }
}

const POSITIVE_WORDS = [
  'excited',
  'happy',
  'joy',
  'grateful',
  'hopeful',
  'love',
  'proud',
  'calm',
  'confident'
];

const NEGATIVE_WORDS = [
  'sad',
  'tired',
  'anxious',
  'angry',
  'worried',
  'overwhelmed',
  'frustrated',
  'lonely',
  'guilty'
];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'have',
  'just',
  'really',
  'about',
  'from',
  'they',
  'them',
  'today',
  'yesterday',
  'tomorrow',
  'went',
  'into',
  'onto',
  'onto',
  'still',
  'back',
  'over'
]);

const EVENT_KEYWORDS = ['party', 'meeting', 'dinner', 'call', 'trip', 'walk', 'workout', 'appointment'];
const PLACE_HINTS = ['park', 'cafe', 'office', 'home', 'school', 'apartment', 'house', 'studio'];

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

class MemoryGraphBuilder {
  private nodes = new Map<string, MemoryGraphNode>();
  private edges = new Map<string, MemoryGraphEdge>();
  private lastSentiment: number | null = null;

  ingest(entry: ResolvedMemoryEntry) {
    const content = (entry.corrected_content ?? entry.content).trim();
    const sentiment = this.scoreSentiment(content);
    const entryNode = this.ensureNode(
      'entry',
      entry.summary ?? `${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`,
      entry.date,
      sentiment.score,
      content
    );

    const extracted = this.extractNodes(entry, content);
    const relatedNodes = [
      ...extracted.people,
      ...extracted.places,
      ...extracted.events,
      ...extracted.tags,
      ...extracted.themes
    ];

    const recencyWeight = this.recency(entry.date);

    relatedNodes.forEach((node) => {
      this.addEdge(entryNode.id, node.id, recencyWeight, ['context'], entry.date, sentiment.score);
    });

    this.connectCooccurrences(relatedNodes, entry.date, recencyWeight, sentiment.score);

    if (this.lastSentiment !== null && Math.abs(sentiment.score - this.lastSentiment) >= 0.4) {
      relatedNodes
        .filter((node) => node.type === 'theme' || node.type === 'tag')
        .forEach((node) => {
          this.addEdge(entryNode.id, node.id, recencyWeight * 0.5, ['sentiment shift'], entry.date, sentiment.score);
        });
    }

    this.lastSentiment = sentiment.score;
  }

  toGraph(): MemoryGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      generatedAt: new Date().toISOString(),
      entryCount: Array.from(this.nodes.values()).filter((node) => node.type === 'entry').length
    };
  }

  private ensureNode(
    type: MemoryGraphNodeType,
    label: string,
    date: string,
    sentimentScore?: number,
    contextSample?: string,
    meta?: Record<string, unknown>
  ): MemoryGraphNode {
    const normalizedLabel = label.trim();
    const id = `${type}:${slugify(normalizedLabel) || crypto.randomUUID()}`;
    const existing = this.nodes.get(id);
    const weight = this.recency(date);

    if (existing) {
      existing.weight = (existing.weight ?? 0) + weight;
      existing.lastSeen = date;
      if (sentimentScore !== undefined) {
        const samples = existing.sentiments?.samples ?? [];
        const score = existing.sentiments?.score ?? 0;
        existing.sentiments = {
          score: (score * samples.length + sentimentScore) / (samples.length + 1),
          samples: contextSample ? [...samples, contextSample].slice(-3) : samples
        };
      }
      return existing;
    }

    const node: MemoryGraphNode = {
      id,
      type,
      label: normalizedLabel,
      weight,
      firstSeen: date,
      lastSeen: date,
      meta
    };

    if (sentimentScore !== undefined) {
      node.sentiments = { score: sentimentScore, samples: contextSample ? [contextSample] : [] };
    }

    this.nodes.set(id, node);
    return node;
  }

  private addEdge(
    from: string,
    to: string,
    weight: number,
    reasons: string[],
    date: string,
    sentimentImpact?: number
  ) {
    const id = `${from}->${to}`;
    const existing = this.edges.get(id);

    if (existing) {
      existing.weight += weight;
      existing.decay = this.recency(date);
      existing.lastSeen = date;
      existing.sentimentImpact = sentimentImpact ?? existing.sentimentImpact;
      existing.reasons = Array.from(new Set([...existing.reasons, ...reasons]));
      return;
    }

    const edge: MemoryGraphEdge = {
      id,
      from,
      to,
      weight,
      reasons: Array.from(new Set(reasons)),
      lastSeen: date,
      decay: this.recency(date),
      sentimentImpact
    };

    this.edges.set(id, edge);
  }

  private connectCooccurrences(
    nodes: MemoryGraphNode[],
    date: string,
    recencyWeight: number,
    sentimentScore?: number
  ) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const first = nodes[i];
        const second = nodes[j];
        const combinedReason = ['co-occurrence'];

        if (first.type === 'theme' || second.type === 'theme') {
          combinedReason.push('emotional connection');
        }

        this.addEdge(first.id, second.id, recencyWeight, combinedReason, date, sentimentScore);
        this.addEdge(second.id, first.id, recencyWeight, combinedReason, date, sentimentScore);
      }
    }
  }

  private recency(date: string) {
    const ageInDays = Math.max(0, differenceInDays(new Date(), parseISO(date)));
    const decay = Math.exp(-ageInDays / 180);
    return 0.35 + decay;
  }

  private extractNodes(entry: ResolvedMemoryEntry, content: string) {
    const people = this.extractPeople(content).map((name) => this.ensureNode('person', name, entry.date));
    const places = this.extractPlaces(content).map((place) => this.ensureNode('place', place, entry.date));
    const events = this.extractEvents(content).map((event) => this.ensureNode('event', event, entry.date));
    const tags = (entry.tags ?? []).map((tag) => this.ensureNode('tag', tag, entry.date));
    const themes = this.extractThemes(entry, content).map((theme) => this.ensureNode('theme', theme, entry.date));

    if (entry.mood) {
      themes.push(this.ensureNode('theme', entry.mood, entry.date));
    }

    return { people, places, events, tags, themes };
  }

  private extractPeople(content: string): string[] {
    const candidates = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) ?? [];
    return Array.from(
      new Set(
        candidates.filter((name) => name.length > 2 && !STOP_WORDS.has(name.toLowerCase())).map((name) => name.trim())
      )
    ).slice(0, 10);
  }

  private extractPlaces(content: string): string[] {
    const matches = content.match(/\b(?:in|at|from|to)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g) ?? [];
    const hinted = PLACE_HINTS.flatMap((hint) =>
      (content.match(new RegExp(`\\b\\w+\\s+${hint}\\b`, 'gi')) ?? []).map((match) => match.trim())
    );
    return Array.from(new Set([...matches, ...hinted])).map((match) => match.replace(/^(in|at|from|to)\s+/i, '')).slice(0, 10);
  }

  private extractEvents(content: string): string[] {
    const lowered = content.toLowerCase();
    const events = EVENT_KEYWORDS.filter((keyword) => lowered.includes(keyword)).map((keyword) => keyword);
    const explicit = content.match(/"([^"]+)"/g)?.map((phrase) => phrase.replace(/"/g, '')) ?? [];
    return Array.from(new Set([...events, ...explicit])).slice(0, 10);
  }

  private extractThemes(entry: ResolvedMemoryEntry, content: string): string[] {
    const source = (entry.summary ?? content).toLowerCase();
    const tokens = source.match(/\b[a-z]{4,}\b/g) ?? [];
    const counts = tokens.reduce<Record<string, number>>((acc, token) => {
      if (!STOP_WORDS.has(token)) {
        acc[token] = (acc[token] ?? 0) + 1;
      }
      return acc;
    }, {});

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([token]) => token);
  }

  private scoreSentiment(content: string) {
    const tokens = content.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
    let score = 0;

    tokens.forEach((token) => {
      if (POSITIVE_WORDS.includes(token)) score += 1;
      if (NEGATIVE_WORDS.includes(token)) score -= 1;
    });

    const normalized = tokens.length ? score / Math.sqrt(tokens.length) : 0;

    return { score: Math.max(-1, Math.min(1, normalized)) };
  }
}

export const memoryGraphService = new MemoryGraphService();
