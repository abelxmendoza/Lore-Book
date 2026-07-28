import { describe, expect, it } from 'vitest';

import { compileDemoUniversalBookQuery } from './universalBookQueryDemo';

describe('compileDemoUniversalBookQuery', () => {
  it('returns synthetic cross-book connections without private fixtures', () => {
    const result = compileDemoUniversalBookQuery('MemoVault skills and quests');

    expect(result.results.some((row) => row.domain === 'skill')).toBe(true);
    expect(result.results.some((row) => row.domain === 'quest')).toBe(true);
    expect(result.connections.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(/\b(?:abel|angel negro)\b/i);
  });

  it('respects a book-specific domain scope', () => {
    const result = compileDemoUniversalBookQuery('career facts', ['document']);
    expect(result.results.every((row) => row.domain === 'document')).toBe(true);
  });
});
