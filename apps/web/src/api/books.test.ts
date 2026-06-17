import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api';
import { booksApi, chatThreadsApi, loadSkillsForBook } from './books';

describe('booksApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads characters from books BFF envelope', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      data: { characters: [{ id: 'c1' }], duplicate_groups: [], counts: {} },
      characters: [{ id: 'c1' }],
      duplicate_groups: [],
      counts: {},
    });

    const payload = await booksApi.loadCharacters();
    expect(fetchJson).toHaveBeenCalledWith('/api/books/characters');
    expect(payload.characters).toHaveLength(1);
  });

  it('loads family book payload', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      data: { tree: { nodes: [] }, households: [], familyGroups: [], analytics: [], graph: {}, counts: {} },
    });

    const payload = await booksApi.loadFamily();
    expect(fetchJson).toHaveBeenCalledWith('/api/books/family');
    expect(payload.tree).toBeDefined();
  });

  it('uses canonical chat thread repair path', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ repaired: 2, report: {} });
    const result = await chatThreadsApi.repairHealth();
    expect(fetchJson).toHaveBeenCalledWith('/api/chat-threads/health/repair', { method: 'POST' });
    expect(result.repaired).toBe(2);
  });

  it('loadSkillsForBook uses BFF when unfiltered', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      data: { skills: [{ id: 's1', name: 'TypeScript', is_active: true }], suggestions: [], counts: {} },
      skills: [{ id: 's1', name: 'TypeScript', is_active: true }],
      suggestions: [],
      counts: {},
    });

    const { skills } = await loadSkillsForBook({ active_only: false });
    expect(fetchJson).toHaveBeenCalledWith('/api/books/skills');
    expect(skills).toHaveLength(1);
  });

  it('loadSkillsForBook falls back to legacy when category filter set', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ skills: [{ id: 's2', name: 'BJJ', category: 'physical' as const }] });
    const { skills } = await loadSkillsForBook({ category: 'physical' });
    expect(fetchJson).toHaveBeenCalledWith('/api/skills?category=physical');
    expect(skills[0].name).toBe('BJJ');
  });
});
