import { describe, expect, it } from 'vitest';

import {
  classifyMention,
  mayAppearAsBuildingOn,
  mayAppearAsTranscriptMention,
  mayAppearOnCast,
  mayPromoteMentionToCharacter,
} from './mentionClassifier';

describe('mentionClassifier', () => {
  it('marks indefinite and vague phrases as GENERIC', () => {
    for (const text of ['one girl', 'people in the scene', 'popular egirls', 'people in', 'other girls']) {
      const m = classifyMention({ text });
      expect(m.status).toBe('GENERIC');
      expect(mayAppearOnCast(m)).toBe(false);
      expect(mayAppearAsTranscriptMention(m)).toBe(false);
      expect(mayAppearAsBuildingOn(m)).toBe(false);
      expect(mayPromoteMentionToCharacter(m)).toBe(false);
    }
  });

  it('marks self as IGNORE', () => {
    expect(classifyMention({ text: 'Also You' }).status).toBe('IGNORE');
  });

  it('marks named people as RESOLVED for Cast', () => {
    const m = classifyMention({
      text: 'Jamie',
      entityId: 'c-jamie',
      provenance: 'character_book',
      kind: 'character',
    });
    expect(m.status).toBe('RESOLVED');
    expect(mayAppearOnCast(m)).toBe(true);
    expect(mayAppearAsBuildingOn(m)).toBe(true);
    expect(mayPromoteMentionToCharacter(m)).toBe(true);
  });

  it('marks contextual collectives as GROUP (transcript only, not Cast)', () => {
    const m = classifyMention({
      text: 'Other girls who reposted allegations on Instagram',
    });
    expect(m.status).toBe('GROUP');
    expect(mayAppearOnCast(m)).toBe(false);
    expect(mayAppearAsTranscriptMention(m)).toBe(true);
    expect(mayAppearAsBuildingOn(m)).toBe(false);
  });

  it('marks anonymous contextual individuals as UNRESOLVED', () => {
    const m = classifyMention({ text: 'Anonymous woman at Northwind Depot' });
    expect(m.status).toBe('UNRESOLVED');
    expect(mayAppearOnCast(m)).toBe(false);
    expect(mayAppearAsTranscriptMention(m)).toBe(true);
  });
});
