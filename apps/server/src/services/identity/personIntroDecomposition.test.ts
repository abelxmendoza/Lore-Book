import { describe, expect, it } from 'vitest';

import {
  decomposePersonIntro,
  detectPersonOnboardingIntent,
} from './personIntroDecomposition';

describe('decomposePersonIntro', () => {
  it('splits Jessica + Juan social-worker role from a contaminated intro', () => {
    const r = decomposePersonIntro("Jessica, Juan's Social Worker, someone new in my life");
    expect(r.canonicalName).toBe('Jessica');
    expect(r.rolePhrase).toBe('social worker');
    expect(r.supportsAnchor).toBe('Juan');
    expect(r.isNewPersonCue).toBe(true);
  });

  it('does not keep role phrase as the canonical name', () => {
    const r = decomposePersonIntro("Jamie, Marcus's Social Worker");
    expect(r.canonicalName).toBe('Jamie');
    expect(r.canonicalName).not.toMatch(/social worker/i);
    expect(r.rolePhrase).toBe('social worker');
    expect(r.supportsAnchor).toBe('Marcus');
  });

  it('handles a simple new-person name', () => {
    const r = decomposePersonIntro('Taylor');
    expect(r.canonicalName).toBe('Taylor');
    expect(r.rolePhrase).toBeNull();
    expect(r.supportsAnchor).toBeNull();
  });
});

describe('detectPersonOnboardingIntent', () => {
  it('detects tell-you-about introductions', () => {
    const r = detectPersonOnboardingIntent(
      "I want to tell you about Jamie, Marcus's Social Worker, someone new in my life.",
    );
    expect(r.detected).toBe(true);
    expect(r.candidateName).toBe('Jamie');
    expect(r.decomposition?.rolePhrase).toBe('social worker');
    expect(r.decomposition?.supportsAnchor).toBe('Marcus');
  });
});
