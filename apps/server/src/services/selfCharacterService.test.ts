import { describe, expect, it } from 'vitest';

import { extractExplicitSelfStageName } from './selfCharacterService';

describe('extractExplicitSelfStageName', () => {
  it('captures a direct first-person stage-name claim', () => {
    expect(
      extractExplicitSelfStageName(
        'I started recording again. My new stage name is Midnight Harbor, that is me.',
      ),
    ).toBe('Midnight Harbor');
  });

  it('captures quoted artist names without the quote', () => {
    expect(extractExplicitSelfStageName('My artist name is “Static Bloom”.')).toBe('Static Bloom');
  });

  it('does not turn a third-party stage name into the user', () => {
    expect(extractExplicitSelfStageName("Their stage name is Velvet Signal.")).toBeNull();
  });

  it('rejects handles and URLs as protagonist stage names', () => {
    expect(extractExplicitSelfStageName('My stage name is @midnight.')).toBeNull();
    expect(extractExplicitSelfStageName('My stage name is https://example.com.')).toBeNull();
  });
});
