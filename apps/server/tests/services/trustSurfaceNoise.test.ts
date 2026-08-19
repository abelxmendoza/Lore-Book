import { describe, expect, it } from 'vitest';
import { isTrustSurfaceNoise } from '../../src/services/trust/trustSurfaceNoise';

describe('isTrustSurfaceNoise', () => {
  it('hides alt-account app-testing chatter used as a project name', () => {
    expect(isTrustSurfaceNoise('alt account to test the app', '', 'projects')).toBe(true);
    expect(
      isTrustSurfaceNoise(
        'alternate account to test the app',
        'Is "alternate account to test the app" an active project in your life right now?',
        'projects'
      )
    ).toBe(true);
  });

  it('hides greeting fragments and consumer gadgets mis-typed as people', () => {
    expect(isTrustSurfaceNoise('Hi Im', '', 'characters')).toBe(true);
    expect(isTrustSurfaceNoise('amazon ring', '', 'characters')).toBe(true);
    expect(isTrustSurfaceNoise('ring', '', 'characters')).toBe(true);
  });

  it('keeps real people and a legitimate LoreBook project', () => {
    expect(isTrustSurfaceNoise('Jamie', 'Tell me more about Jamie — who are they to you?', 'characters')).toBe(
      false
    );
    expect(isTrustSurfaceNoise('LoreBook', 'pending suggestion', 'projects')).toBe(false);
  });
});
