import { describe, it, expect } from 'vitest';
import { isInvalidPersonName } from './semanticGuards';

describe('isInvalidPersonName — AI model name denylist', () => {
  it('rejects known AI model/product names as person candidates', () => {
    expect(isInvalidPersonName('Gemini').invalid).toBe(true);
    expect(isInvalidPersonName('Grok').invalid).toBe(true);
    expect(isInvalidPersonName('Llama').invalid).toBe(true);
    expect(isInvalidPersonName('ChatGPT').invalid).toBe(true);
    expect(isInvalidPersonName('Claude').invalid).toBe(true);
  });

  it('still allows ordinary person names, including ones that sound similar', () => {
    expect(isInvalidPersonName('Ginny').invalid).toBe(false);
    expect(isInvalidPersonName('Marcus Chen').invalid).toBe(false);
  });

  it('rejects capitalized sentence fragments and recurring weekday labels', () => {
    expect(isInvalidPersonName('Like').invalid).toBe(true);
    expect(isInvalidPersonName('Tomorrow Im').invalid).toBe(true);
    expect(isInvalidPersonName('Fridays').invalid).toBe(true);
    expect(isInvalidPersonName('Fitness').invalid).toBe(true);
    expect(isInvalidPersonName('Police').invalid).toBe(true);
    expect(isInvalidPersonName('Annie').invalid).toBe(false);
    expect(isInvalidPersonName('Connor').invalid).toBe(false);
  });
});
