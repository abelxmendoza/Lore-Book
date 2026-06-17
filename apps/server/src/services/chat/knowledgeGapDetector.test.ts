import { describe, it, expect } from 'vitest';
import { detectKnowledgeGaps, extractCandidateNames, formatKnowledgeGapBlock } from './knowledgeGapDetector';

const chars = [
  { id: 'c1', name: 'Sarah Chen', alias: ['Sar'] },
  { id: 'c2', name: 'Grandma Rose', alias: [] },
];
const locs = [{ id: 'l1', name: 'Costco' }];

const base = {
  characters: chars,
  locations: locs,
  matchedEntities: [] as Array<{ id: string; type: 'character' | 'location'; name: string }>,
  arcLoadedForPrimary: false,
  primaryHasAttributes: false,
};

describe('extractCandidateNames', () => {
  it('extracts capitalized names and skips query verbs', () => {
    expect(extractCandidateNames('Tell me about Marcus')).toEqual(['Marcus']);
  });

  it('skips days, months, and common words', () => {
    expect(extractCandidateNames('What happened on Monday in January?')).toEqual([]);
  });

  it('keeps multi-word names intact', () => {
    expect(extractCandidateNames('Who is Marcus Webb?')).toEqual(['Marcus Webb']);
  });
});

describe('detectKnowledgeGaps', () => {
  it('flags a name that matches nothing on record', () => {
    const gaps = detectKnowledgeGaps({ ...base, message: 'Tell me about Marcus' });
    expect(gaps).toEqual([{ type: 'unknown_entity', name: 'Marcus' }]);
  });

  it('does not flag known names or aliases', () => {
    expect(detectKnowledgeGaps({ ...base, message: 'Tell me about Sarah Chen' })).toEqual([]);
    expect(detectKnowledgeGaps({ ...base, message: 'Tell me about Sar' })).toEqual([]);
    expect(detectKnowledgeGaps({ ...base, message: 'What happened at Costco?' })).toEqual([]);
  });

  it('partial name of a known person is not a gap ("Sarah" matches "Sarah Chen")', () => {
    expect(detectKnowledgeGaps({ ...base, message: 'What do you know about Sarah?' })).toEqual([]);
  });

  it('flags a matched entity with no arc and no attributes as sparse', () => {
    const gaps = detectKnowledgeGaps({
      ...base,
      message: 'Tell me about Grandma Rose',
      matchedEntities: [{ id: 'c2', type: 'character', name: 'Grandma Rose' }],
      arcLoadedForPrimary: false,
      primaryHasAttributes: false,
    });
    expect(gaps).toEqual([{ type: 'sparse_entity', name: 'Grandma Rose', entityId: 'c2', entityType: 'character' }]);
  });

  it('does not flag a matched entity whose arc loaded', () => {
    const gaps = detectKnowledgeGaps({
      ...base,
      message: 'Tell me about Grandma Rose',
      matchedEntities: [{ id: 'c2', type: 'character', name: 'Grandma Rose' }],
      arcLoadedForPrimary: true,
    });
    expect(gaps).toEqual([]);
  });

  it('does not flag a matched entity that has attributes', () => {
    const gaps = detectKnowledgeGaps({
      ...base,
      message: 'Tell me about Grandma Rose',
      matchedEntities: [{ id: 'c2', type: 'character', name: 'Grandma Rose' }],
      primaryHasAttributes: true,
    });
    expect(gaps).toEqual([]);
  });

  it('caps gaps at 2 per message', () => {
    const gaps = detectKnowledgeGaps({
      ...base,
      message: 'Tell me about Marcus and Priya and Devon',
    });
    expect(gaps.length).toBe(2);
  });
});

describe('formatKnowledgeGapBlock', () => {
  it('returns null with no gaps', () => {
    expect(formatKnowledgeGapBlock([])).toBeNull();
  });

  it('formats unknown and sparse gaps with TIER instructions', () => {
    const block = formatKnowledgeGapBlock([
      { type: 'unknown_entity', name: 'Marcus' },
      { type: 'sparse_entity', name: 'Grandma Rose', entityId: 'c2', entityType: 'character' },
    ])!;
    expect(block).toContain('KNOWLEDGE GAPS');
    expect(block).toContain('"Marcus" — nothing in the record');
    expect(block).toContain('TIER 3');
    expect(block).toContain('"Grandma Rose" is on record but has no events or facts yet');
    expect(block).toContain('nickname');
  });
});
