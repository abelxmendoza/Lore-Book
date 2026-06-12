import { describe, it, expect } from 'vitest';
import { formatRecallChatResponse } from './recallChatFormatter';
import type { RecallResult } from './types';

const baseRecall = (overrides: Partial<RecallResult> = {}): RecallResult =>
  ({
    entries: [],
    confidence: 0.2,
    explanation: 'test',
    silence: undefined,
    ...overrides,
  }) as unknown as RecallResult;

const entry = {
  id: 'e1',
  date: '2026-06-01T00:00:00Z',
  content: 'Went to the gym with Sam.',
  emotions: [],
  themes: [],
  people: [],
};

describe('formatRecallChatResponse', () => {
  it('zero entries → honest "haven\'t talked about that yet", SILENCE mode', () => {
    const res = formatRecallChatResponse(baseRecall());
    expect(res.content).toContain("haven't talked about that yet");
    expect(res.content).not.toContain('past moments');
    expect(res.response_mode).toBe('SILENCE');
    expect(res.confidence_label).toBe('No record');
    expect(res.recall_meta?.recall_type).toBe('SILENCE');
  });

  it('low-confidence with entries keeps the tentative phrasing', () => {
    const res = formatRecallChatResponse(baseRecall({ entries: [entry] as any, confidence: 0.3 }));
    expect(res.content).toContain('loosely similar');
    expect(res.response_mode).toBe('RECALL');
  });

  it('high-confidence with entries keeps the strong phrasing', () => {
    const res = formatRecallChatResponse(baseRecall({ entries: [entry] as any, confidence: 0.9 }));
    expect(res.content).toContain('closely resembles');
    expect(res.confidence_label).toBe('Strong match');
  });

  it('explicit silence message still wins', () => {
    const res = formatRecallChatResponse(
      baseRecall({ silence: { message: 'Quiet here.' } as any })
    );
    expect(res.content).toBe('Quiet here.');
    expect(res.response_mode).toBe('SILENCE');
  });

  it('archivist persona with zero entries states no entries found', () => {
    const res = formatRecallChatResponse(baseRecall(), 'ARCHIVIST' as any);
    expect(res.content).toContain('No prior entries');
  });
});
