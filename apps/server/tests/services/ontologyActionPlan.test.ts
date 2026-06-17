import { describe, expect, it } from 'vitest';
import {
  classifyActionIntent,
  extractClaimedName,
  inferRelationshipRole,
} from '../../src/services/ontology/lexicalIntelligence';

describe('ontology action intents', () => {
  it('detects identity + disambiguation on same-name self/father claim', () => {
    const msg = "Abel Mendoza is actually me but it's also my estranged father";
    const { hits, relationshipHints } = classifyActionIntent(msg);

    expect(hits.some((h) => h.actionHint === 'IDENTITY_CLAIM')).toBe(true);
    expect(hits.some((h) => h.actionHint === 'DISAMBIGUATE')).toBe(true);
    expect(relationshipHints.some((h) => h.hint === 'FAMILY_RELATIONSHIP' || h.hint === 'ADVERSARIAL_RELATIONSHIP')).toBe(true);
    expect(extractClaimedName(msg)).toBe('Abel Mendoza');
    expect(inferRelationshipRole(msg)).toBe('father');
  });

  it('extracts name from my name is pattern', () => {
    expect(extractClaimedName('My legal name is Abel Mendoza')).toBe('Abel Mendoza');
  });

  it('detects open characters navigation cue', () => {
    const { hits } = classifyActionIntent('Can you show my characters?');
    expect(hits.some((h) => h.actionHint === 'OPEN_SURFACE')).toBe(true);
  });
});
