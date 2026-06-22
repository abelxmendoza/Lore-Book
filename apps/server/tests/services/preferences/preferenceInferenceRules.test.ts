import { describe, it, expect } from 'vitest';

import { preferenceInferenceService } from '../../../src/services/preferences/inference/preferenceInferenceService';
import {
  hasProvenance,
  isThirdPartyPreference,
  requiresSensitiveReview,
  shouldCreatePreferenceCard,
} from '../../../src/services/preferences/inference/preferenceProvenanceService';

function infer(text: string, extra: Parameters<typeof preferenceInferenceService.inferFromMessage>[0] = {}) {
  return preferenceInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findPreference(result: ReturnType<typeof infer>, namePart: string) {
  return result.accepted.find((s) =>
    s.displayName.toLowerCase().includes(namePart.toLowerCase()),
  );
}

describe('preference inference rules', () => {
  it('I like ska creates music preference', () => {
    const result = infer('I like ska and punk shows.');
    const pref = findPreference(result, 'ska');
    expect(pref).toBeDefined();
    expect(pref!.domain).toBe('music');
    expect(pref!.preferenceType).toMatch(/like|affinity/);
  });

  it('favorite summer clothes creates clothing favorite', () => {
    const result = infer('My favorite summer clothes are loose linen shirts.');
    const pref = findPreference(result, 'summer clothes');
    expect(pref).toBeDefined();
    expect(pref!.domain).toBe('clothing');
    expect(pref!.preferenceType).toBe('favorite');
    expect(pref!.strength).toBe('favorite');
  });

  it('Muay Thai is my main thing creates identity-level preference', () => {
    const result = infer('Muay Thai is still my main thing.');
    const pref = findPreference(result, 'Muay Thai');
    expect(pref).toBeDefined();
    expect(pref!.strength).toBe('identity_level');
    expect(pref!.domain).toBe('martial_arts');
  });

  it('repeated ska shows infer ska affinity', () => {
    const result = infer('I went to ska shows all the time back in high school.');
    const pref = findPreference(result, 'ska');
    expect(pref).toBeDefined();
    expect(pref!.preferenceType).toMatch(/affinity|like/);
    expect(pref!.inferredNotConfirmed).toBe(true);
  });

  it('they had tequila does not infer tequila preference', () => {
    expect(isThirdPartyPreference('They had tequila at the party.')).toBe(true);
    const result = infer('They had tequila at the party.');
    expect(result.accepted.some((s) => /tequila/i.test(s.displayName))).toBe(false);
  });

  it('I do not want to drive far creates avoidance preference', () => {
    const result = infer("I didn't want to drive because it's a far drive.");
    const pref = findPreference(result, 'far driving') ?? findPreference(result, 'drive');
    expect(pref).toBeDefined();
    expect(pref!.preferenceType).toBe('avoidance');
    expect(pref!.domain).toBe('lifestyle');
  });

  it('gothic/occult attaches to aesthetic taste', () => {
    const result = infer('I prefer dark gothic themes with occult vibes.');
    const pref = findPreference(result, 'gothic');
    expect(pref).toBeDefined();
    expect(pref!.domain).toBe('aesthetic');
    expect(pref!.attachedTo?.entityType).toBe('user_profile');
  });

  it('LoreBook UI preference attaches to LoreBook project', () => {
    const result = infer('For LoreBook I want mystical UI and entity chips.');
    const ui = findPreference(result, 'mystical UI');
    const chips = findPreference(result, 'entity chips');
    expect(ui ?? chips).toBeDefined();
    expect(result.accepted.some((s) => s.attachedTo?.inferredTitle === 'LoreBook')).toBe(true);
  });

  it('sensitive preferences require review', () => {
    expect(requiresSensitiveReview('I love tequila on weekends', 'tequila')).toBe(true);
    const result = infer('I love tequila on weekends.');
    expect(result.accepted.every((s) => s.requiresReview)).toBe(true);
  });

  it('assistant-generated preference is ignored', () => {
    const result = infer('You might like ska music.', { authorRole: 'assistant' });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'assistant_generated')).toBe(true);
  });

  it('provenance required', () => {
    const result = infer('I like ska and hate fake memories.');
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const signal of result.accepted) {
      expect(hasProvenance(signal)).toBe(true);
      expect(signal.sourceMessageIds).toContain('msg-1');
      expect(signal.evidencePhrases.length).toBeGreaterThan(0);
      expect(shouldCreatePreferenceCard(signal)).toBe(false);
    }
  });
});
