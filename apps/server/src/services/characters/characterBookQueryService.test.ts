import { describe, expect, it } from 'vitest';

import { characterBookQueryRequestSchema } from '@lorebook/api-contracts';

import {
  compileCharacterBookQuery,
  deriveCharacterBookQueryHints,
  isCharacterSimilarityQuery,
  type CharacterBookQueryRow,
} from './characterBookQueryService';

function row(partial: Partial<CharacterBookQueryRow> & Pick<CharacterBookQueryRow, 'id' | 'name'>): CharacterBookQueryRow {
  return {
    aliases: [],
    role: null,
    status: 'active',
    tags: [],
    summary: 'Known from work and hangouts.',
    metadata: {},
    updatedAt: '2026-08-01T00:00:00.000Z',
    importanceScore: 40,
    organizationNames: [],
    ...partial,
  };
}

const book: CharacterBookQueryRow[] = [
  row({ id: 'self', name: 'You', metadata: { is_self: true }, summary: 'Protagonist', importanceScore: 100 }),
  row({
    id: 'marcus',
    name: 'Marcus',
    organizationNames: ['Vanguard Robotics'],
    role: 'coworker',
  }),
  row({
    id: 'jamie',
    name: 'Jamie',
    aliases: ['James'],
    summary: '',
    metadata: { auto_detected: true },
    importanceScore: 4,
  }),
  row({
    id: 'alex',
    name: 'Alex',
    organizationNames: ['MemoVault'],
    status: 'inactive',
  }),
];

describe('character book query', () => {
  it('derives org and review hints from natural language', () => {
    const fromOrg = deriveCharacterBookQueryHints('who do I know from Vanguard Robotics?');
    expect(fromOrg.organizationNames).toEqual(['Vanguard Robotics']);
    expect(fromOrg.excludeSelf).toBe(true);

    const review = deriveCharacterBookQueryHints('which people need review?');
    expect(review.scopes).toContain('needs_review');
  });

  it('filters people connected to an organization and hides self', () => {
    const request = characterBookQueryRequestSchema.parse({
      query: 'who do I know from Vanguard Robotics?',
    });
    const result = compileCharacterBookQuery(book, request);
    expect(result.intent).toBe('organization');
    expect(result.results.map((item) => item.name)).toEqual(['Marcus']);
  });

  it('lists people that need review', () => {
    const request = characterBookQueryRequestSchema.parse({ query: 'which people need review?' });
    const result = compileCharacterBookQuery(book, request);
    expect(result.intent).toBe('quality');
    expect(result.results.map((item) => item.name)).toEqual(['Jamie']);
  });

  it('does not treat a lone who-is question as a similarity query', () => {
    expect(isCharacterSimilarityQuery('who is Marcus?')).toBe(false);
    expect(isCharacterSimilarityQuery('which people look related?')).toBe(true);
  });

  it('browses the character book when no filters fire', () => {
    const request = characterBookQueryRequestSchema.parse({ query: 'show people in my character book' });
    const result = compileCharacterBookQuery(book, request);
    expect(deriveCharacterBookQueryHints('show people in my character book').organizationNames).toEqual([]);
    expect(result.total).toBe(4);
    expect(result.results.some((item) => item.isSelf)).toBe(true);
  });
});
