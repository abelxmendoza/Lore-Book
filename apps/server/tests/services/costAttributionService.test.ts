import { describe, it, expect } from 'vitest';
import { costAttributionService } from '../../src/services/costAttributionService';

describe('costAttributionService (buffering + attribution)', () => {
  it('buffers by (day, operation, model) and aggregates increments', () => {
    const before = costAttributionService.__peek().size;

    costAttributionService.record({
      operation: 'chat',
      model: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 50,
      usd: 0.0001,
    });
    costAttributionService.record({
      operation: 'chat',
      model: 'gpt-4o-mini',
      inputTokens: 10,
      outputTokens: 5,
      usd: 0.00002,
    });
    costAttributionService.record({
      operation: 'ingestion',
      model: 'gpt-4o-mini',
      inputTokens: 200,
      outputTokens: 0,
      usd: 0.00003,
    });

    const buf = costAttributionService.__peek();
    // Two distinct buckets added (chat+ingestion for the same model/day).
    expect(buf.size).toBe(before + 2);

    const day = new Date().toISOString().slice(0, 10);
    const chat = buf.get(`${day}|chat|gpt-4o-mini`);
    expect(chat?.calls).toBe(2);
    expect(chat?.inputTokens).toBe(110);
    expect(chat?.outputTokens).toBe(55);
    expect(chat?.usd).toBeCloseTo(0.00012, 8);

    const ingestion = buf.get(`${day}|ingestion|gpt-4o-mini`);
    expect(ingestion?.calls).toBe(1);
    expect(ingestion?.inputTokens).toBe(200);
  });

  it('defaults missing operation/model to "unknown"', () => {
    costAttributionService.record({
      operation: '',
      model: '',
      inputTokens: 1,
      outputTokens: 1,
      usd: 0,
    });
    const day = new Date().toISOString().slice(0, 10);
    expect(costAttributionService.__peek().has(`${day}|unknown|unknown`)).toBe(true);
  });
});
