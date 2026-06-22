import { describe, it, expect } from 'vitest';
import { hasTemporalSignal } from '../../../src/services/chat/temporalSignal';

describe('hasTemporalSignal', () => {
  it('skips clearly non-temporal messages (the cost win)', () => {
    expect(hasTemporalSignal('thanks!')).toBe(false);
    expect(hasTemporalSignal('tell me about my friends')).toBe(false);
    expect(hasTemporalSignal('who do I know in aerospace?')).toBe(false);
    expect(hasTemporalSignal('how are you')).toBe(false);
  });

  it('detects explicit and relative temporal references', () => {
    expect(hasTemporalSignal('I saw Tony yesterday')).toBe(true);
    expect(hasTemporalSignal('we met last week')).toBe(true);
    expect(hasTemporalSignal('my birthday is in March')).toBe(true);
    expect(hasTemporalSignal('it happened in 2019')).toBe(true);
    expect(hasTemporalSignal('see you at 3pm on Friday')).toBe(true);
    expect(hasTemporalSignal('a few months ago')).toBe(true);
    expect(hasTemporalSignal('next month I move')).toBe(true);
  });

  it('handles empty input', () => {
    expect(hasTemporalSignal('')).toBe(false);
  });
});
