import { describe, expect, it } from 'vitest';
import { keywordLexicalRescanService } from '../../src/services/conversationCentered/keywordLexicalRescanService';

describe('keywordLexicalRescanService', () => {
  it('returns empty summary for no keywords', async () => {
    const summary = await keywordLexicalRescanService.rescan('user-1', []);
    expect(summary.hitCount).toBe(0);
    expect(summary.hits).toEqual([]);
    expect(summary.keywords).toEqual([]);
  });

  it('filters stop words and short tokens from keyword list', async () => {
    const summary = await keywordLexicalRescanService.rescan('user-none', ['a', 'the', 'x'], {
      promote: false,
    });
    expect(summary.keywords).toEqual([]);
  });
});
