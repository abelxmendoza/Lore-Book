import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { fetchLexicalPreview } from '../api/lexicalPreview';
import {
  abortLexicalPreviewShared,
  clearLexicalPreviewSharedCache,
  fetchLexicalPreviewShared,
} from './lexicalPreviewCache';

vi.mock('../api/lexicalPreview', () => ({
  fetchLexicalPreview: vi.fn(),
}));

const mockFetch = vi.mocked(fetchLexicalPreview);
const EMPTY = { spans: [], inferredAssociations: [], ambiguities: [] };

describe('lexicalPreviewCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLexicalPreviewSharedCache();
  });

  afterEach(() => {
    clearLexicalPreviewSharedCache();
  });

  it('reuses an in-flight request for the same draft', async () => {
    let resolveFirst: (value: typeof EMPTY) => void = () => undefined;
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const first = fetchLexicalPreviewShared('hello');
    const second = fetchLexicalPreviewShared('hello');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    resolveFirst(EMPTY);
    await expect(first).resolves.toEqual(EMPTY);
    await expect(second).resolves.toEqual(EMPTY);
  });

  it('aborts the in-flight fetch when a newer draft starts', () => {
    const signals: AbortSignal[] = [];
    mockFetch.mockImplementation((_text: string, _thread?: string, signal?: AbortSignal) => {
      if (signal) signals.push(signal);
      return new Promise(() => undefined);
    });

    void fetchLexicalPreviewShared('one');
    void fetchLexicalPreviewShared('two');
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('cancels stale server work via abortLexicalPreviewShared', () => {
    const signals: AbortSignal[] = [];
    mockFetch.mockImplementation((_text: string, _thread?: string, signal?: AbortSignal) => {
      if (signal) signals.push(signal);
      return new Promise(() => undefined);
    });

    void fetchLexicalPreviewShared('one');
    abortLexicalPreviewShared();
    expect(signals[0]?.aborted).toBe(true);
  });
});
