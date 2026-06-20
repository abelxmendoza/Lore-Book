import { describe, it, expect } from 'vitest';
import {
  buildDisplayTitleFromContextualReference,
  buildDisplayTitleFromName,
  parseTitlePartsFromName,
  shouldAllowCharacterCreation,
} from '../../../src/services/identity/dynamicCharacterTitleService';

describe('dynamicCharacterTitleService', () => {
  const id = 'char-1';

  it('rejects bare Professor as character title', () => {
    const result = buildDisplayTitleFromName(id, 'Professor');
    expect(result.rejected).toBe(true);
    expect(shouldAllowCharacterCreation(result)).toBe(false);
  });

  it('accepts Professor from Japanese Class as contextual reference', () => {
    const result = buildDisplayTitleFromContextualReference(id, {
      rolePhrase: 'professor',
      text: 'the professor from my Japanese Class gave us homework',
    });
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toMatch(/Professor from Japanese Class/i);
    expect(result.displayTitle.titleType).toBe('role_contextual');
  });

  it('accepts Potential Investor from Antler', () => {
    const result = buildDisplayTitleFromContextualReference(id, {
      rolePhrase: 'potential investor',
      text: 'met a potential investor from Antler who saw my GitHub',
    });
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toBe('Potential Investor from Antler');
  });

  it('formats recruiter from Amazon as Amazon Recruiter', () => {
    const result = buildDisplayTitleFromContextualReference(id, {
      rolePhrase: 'recruiter',
      text: 'a recruiter emailed me from Amazon about an opening',
    });
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toBe('Amazon Recruiter');
  });

  it('formats promoter from Ska Prom', () => {
    const result = buildDisplayTitleFromContextualReference(id, {
      rolePhrase: 'promoter',
      text: 'the promoter kicked me out at Ska Prom',
    });
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toMatch(/Promoter from Ska Prom/i);
  });

  it('preserves Mr Morten honorific', () => {
    const result = buildDisplayTitleFromName(id, 'Mr Morten');
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toMatch(/Mr\.?\s+Morten/i);
    expect(result.displayTitle.titleType).toBe('honorific_name');
  });

  it('preserves Tio Ralph family title + given name', () => {
    const result = buildDisplayTitleFromName(id, 'Tio Ralph');
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toBe('Tio Ralph');
    expect(result.displayTitle.titleType).toBe('family_title_name');
    const parts = parseTitlePartsFromName('Tio Ralph');
    expect(parts.givenName).toBe('Ralph');
  });

  it('keeps Hell Fairy as stage/nickname title', () => {
    const result = buildDisplayTitleFromName(id, 'Hell Fairy');
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toBe('Hell Fairy');
    expect(['nickname', 'legal_or_full_name', 'stage_name']).toContain(result.displayTitle.titleType);
  });

  it('keeps Ducky as nickname title', () => {
    const result = buildDisplayTitleFromName(id, 'Ducky');
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toBe('Ducky');
  });

  it('rejects bare Friend without context', () => {
    const result = buildDisplayTitleFromContextualReference(id, {
      rolePhrase: 'friend',
      text: 'my friend was there',
    });
    expect(result.rejected).toBe(true);
  });

  it('accepts Friend from Football Team with context', () => {
    const result = buildDisplayTitleFromContextualReference(id, {
      rolePhrase: 'friend',
      text: 'my friend from the football team helped me move',
      contextSources: [{ kind: 'group', label: 'Football Team', rank: 3 }],
    });
    expect(result.rejected).toBe(false);
    expect(result.displayTitle.primaryTitle).toBe('Friend from Football Team');
  });
});
