import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJournalRows = vi.hoisted(() => [] as Array<{ content: string }>);
const mockMessageRows = vi.hoisted(() => [] as Array<{ content: string }>);

vi.mock('../../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(async () => {
          if (table === 'journal_entries') return { data: mockJournalRows, error: null };
          if (table === 'chat_messages') return { data: mockMessageRows, error: null };
          return { data: [], error: null };
        }),
      };
      return chain;
    }),
  },
}));

const mockQuestUpsert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSkillUpsert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockProjectUpsert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCreateEntity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../../src/services/quests/questSuggestionService', () => ({
  questSuggestionService: { upsertFromExtraction: mockQuestUpsert },
}));

vi.mock('../../../src/services/skills/skillSuggestionService', () => ({
  skillSuggestionService: { upsertFromExtraction: mockSkillUpsert },
}));

vi.mock('../../../src/services/projects/projectSuggestionService', () => ({
  projectSuggestionService: { upsertManyFromExtraction: mockProjectUpsert },
}));

vi.mock('../../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: { createEntity: mockCreateEntity },
}));

import {
  applyParseOperations,
  loadRecentCorpusLines,
  parseCorpusForUser,
  runCorpusParseAndApply,
} from '../../../src/services/lorebook/parser/loreBookParseCorpusService';
import type { LoreBookOperation } from '../../../src/services/lorebook/parser/loreBookParserTypes';

describe('loreBookParseCorpusService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJournalRows.length = 0;
    mockMessageRows.length = 0;
  });

  describe('loadRecentCorpusLines', () => {
    it('merges chat and journal lines, dedupes, and filters short lines', async () => {
      mockMessageRows.push(
        { content: 'Oscar Martinez joined our robotics team today.' },
        { content: 'ok' },
        { content: 'Oscar Martinez joined our robotics team today.' }
      );
      mockJournalRows.push({ content: 'Visited San Diego for the conference last week.' });

      const lines = await loadRecentCorpusLines('user-1', 20);
      expect(lines).toContain('Oscar Martinez joined our robotics team today.');
      expect(lines).toContain('Visited San Diego for the conference last week.');
      expect(lines.some((l) => l === 'ok')).toBe(false);
      expect(lines.filter((l) => l === 'Oscar Martinez joined our robotics team today.')).toHaveLength(1);
    });

    it('returns empty array when corpus is empty', async () => {
      const lines = await loadRecentCorpusLines('user-empty');
      expect(lines).toEqual([]);
    });
  });

  describe('parseCorpusForUser', () => {
    it('parses supplied lines and dedupes merged operations', async () => {
      const line = 'Oscar Martinez is my friend from robotics club.';
      const { lines, results, merged } = await parseCorpusForUser('user-1', [line, line]);
      expect(lines).toHaveLength(2);
      expect(results).toHaveLength(2);
      const suggestAdds = merged.filter((o) => o.kind === 'suggest_add');
      const uniqueNames = new Set(
        suggestAdds.map((o) => (o.kind === 'suggest_add' ? o.name.toLowerCase() : ''))
      );
      expect(uniqueNames.size).toBe(suggestAdds.length);
    });
  });

  describe('applyParseOperations', () => {
    const suggestAdd = (
      domain: LoreBookOperation & { kind: 'suggest_add' }['domain'],
      name: string,
      gate: 'suggest' | 'block' = 'suggest'
    ): LoreBookOperation => ({
      kind: 'suggest_add',
      domain,
      name,
      evidence: { quote: `mention of ${name}` },
      confidence: 0.8,
      sourceSpans: [],
      gate,
    });

    it('applies character suggest_add via omegaMemoryService', async () => {
      const summary = await applyParseOperations('user-1', [suggestAdd('characters', 'Oscar Martinez')]);
      expect(summary.applied).toBe(1);
      expect(summary.byDomain.characters).toBe(1);
      expect(summary.appliedItems).toEqual([
        { domain: 'characters', name: 'Oscar Martinez', confidence: 0.8 },
      ]);
      expect(mockCreateEntity).toHaveBeenCalledWith('user-1', 'Oscar Martinez', 'PERSON');
    });

    it('applies quest suggest_add via questSuggestionService', async () => {
      const summary = await applyParseOperations('user-1', [
        suggestAdd('quests', 'Ship LoreBook beta'),
      ]);
      expect(summary.applied).toBe(1);
      expect(mockQuestUpsert).toHaveBeenCalled();
    });

    it('skips blocked and non-suggest_add operations', async () => {
      const summary = await applyParseOperations('user-1', [
        suggestAdd('characters', 'Blocked Person', 'block'),
        {
          kind: 'redirect',
          fromDomain: 'characters',
          toDomain: 'locations',
          name: 'Gothicumbia',
          reason: 'cross_book_guard',
          confidence: 0.9,
        },
        { kind: 'suppress', name: 'Find My', reason: 'consumer_app', sourceSpans: [] },
      ]);
      expect(summary.applied).toBe(0);
      expect(summary.skipped).toBe(3);
    });

    it('dedupes appliedItems within one batch', async () => {
      const summary = await applyParseOperations('user-1', [
        suggestAdd('characters', 'Oscar Martinez'),
        suggestAdd('characters', 'oscar martinez'),
      ]);
      expect(summary.applied).toBe(2);
      expect(summary.appliedItems).toHaveLength(1);
    });

    it('counts apply failures as skipped without throwing', async () => {
      mockCreateEntity.mockRejectedValueOnce(new Error('db unavailable'));
      const summary = await applyParseOperations('user-1', [suggestAdd('characters', 'Fail Person')]);
      expect(summary.applied).toBe(0);
      expect(summary.skipped).toBe(1);
    });
  });

  describe('runCorpusParseAndApply', () => {
    it('runs end-to-end on corpus lines', async () => {
      mockMessageRows.push({ content: 'My friend Oscar Martinez works on robotics.' });
      const { parse, apply } = await runCorpusParseAndApply('user-1');
      expect(parse.lines.length).toBeGreaterThan(0);
      expect(apply.linesParsed).toBe(parse.lines.length);
      expect(apply.operationsSeen).toBe(parse.merged.length);
    });
  });
});
