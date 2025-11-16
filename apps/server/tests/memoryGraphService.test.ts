import { beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryGraphService } from '../src/services/memoryGraphService';
import { chapterService } from '../src/services/chapterService';
import { memoryService } from '../src/services/memoryService';
import { peoplePlacesService } from '../src/services/peoplePlacesService';
import type { PeoplePlaceEntity, ResolvedMemoryEntry } from '../src/types';

vi.mock('../src/services/memoryService', () => ({
  memoryService: {
    searchEntriesWithCorrections: vi.fn()
  }
}));

vi.mock('../src/services/peoplePlacesService', () => ({
  peoplePlacesService: {
    listEntities: vi.fn()
  }
}));

vi.mock('../src/services/chapterService', () => ({
  chapterService: {
    listChapters: vi.fn()
  }
}));

const sampleEntries: ResolvedMemoryEntry[] = [
  {
    id: 'entry-1',
    user_id: 'user-1',
    date: '2024-01-10T00:00:00.000Z',
    content: 'Went hiking with Alex at the beach.',
    corrected_content: 'Went hiking with Alex at the beach.',
    tags: ['travel', 'exercise'],
    chapter_id: 'chapter-1',
    mood: 'happy',
    summary: 'Hiking day with Alex',
    source: 'manual',
    metadata: {}
  },
  {
    id: 'entry-2',
    user_id: 'user-1',
    date: '2024-02-15T00:00:00.000Z',
    content: 'Worked late on a deadline with Jordan.',
    corrected_content: 'Worked late on a deadline with Jordan.',
    tags: ['work', 'deadline'],
    chapter_id: null,
    mood: 'tired',
    summary: 'Crunch time with Jordan',
    source: 'manual',
    metadata: {}
  }
];

const sampleEntities: PeoplePlaceEntity[] = [
  {
    id: 'person-alex',
    user_id: 'user-1',
    name: 'Alex',
    type: 'person',
    first_mentioned_at: '2024-01-10T00:00:00.000Z',
    last_mentioned_at: '2024-02-01T00:00:00.000Z',
    total_mentions: 2,
    related_entries: ['entry-1'],
    corrected_names: [],
    relationship_counts: { friend: 2 }
  },
  {
    id: 'person-jordan',
    user_id: 'user-1',
    name: 'Jordan',
    type: 'person',
    first_mentioned_at: '2024-02-15T00:00:00.000Z',
    last_mentioned_at: '2024-02-15T00:00:00.000Z',
    total_mentions: 1,
    related_entries: ['entry-2'],
    corrected_names: [],
    relationship_counts: { professional: 1 }
  }
];

const sampleChapters = [
  {
    id: 'chapter-1',
    user_id: 'user-1',
    title: 'Winter Adventures',
    start_date: '2024-01-01',
    end_date: null,
    description: null,
    summary: 'Cold but active months'
  }
];

describe('memoryGraphService.buildGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (memoryService.searchEntriesWithCorrections as any).mockResolvedValue(sampleEntries);
    (peoplePlacesService.listEntities as any).mockResolvedValue(sampleEntities);
    (chapterService.listChapters as any).mockResolvedValue(sampleChapters);
  });

  it('builds nodes and edges for entries, entities, tags, and themes', async () => {
    const graph = await memoryGraphService.buildGraph('user-1');

    expect(graph.nodes.find((node) => node.id === 'entry-1')?.type).toBe('event');
    expect(graph.nodes.find((node) => node.id === 'person-alex')?.type).toBe('person');
    expect(graph.nodes.find((node) => node.id === 'tag:travel')).toBeDefined();
    expect(graph.nodes.find((node) => node.id === 'theme:adventure')).toBeDefined();
    expect(graph.nodes.find((node) => node.id === 'chapter:chapter-1')).toBeDefined();

    const coOccurrence = graph.edges.filter((edge) => edge.type === 'co_occurrence');
    expect(coOccurrence.some((edge) => edge.target === 'person-alex')).toBe(true);
    expect(coOccurrence.some((edge) => edge.target === 'tag:work' || edge.target === 'tag:travel')).toBe(true);

    expect(graph.edges.some((edge) => edge.type === 'emotional')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'frequency' && edge.source === 'person-jordan')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'sentiment_shift')).toBe(true);
  });
});
