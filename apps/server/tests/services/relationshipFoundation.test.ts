import { describe, expect, it } from 'vitest';

import {
  parseRelationshipFact,
  resolveCharacterIdByName,
} from '../../src/services/relationshipFoundationService';

describe('parseRelationshipFact', () => {
  it('parses narrator kinship on entity', () => {
    expect(parseRelationshipFact("Is the narrator's uncle")).toEqual({
      relType: 'family',
      kinship: 'uncle',
      protagonistToHolder: true,
    });
  });

  it('parses has uncle named Rafa on Me', () => {
    const p = parseRelationshipFact('Has an uncle named Rafa');
    expect(p?.relType).toBe('family');
    expect(p?.kinship).toBe('uncle');
    expect(p?.targetName).toBe('Rafa');
    expect(p?.protagonistToHolder).toBe(true);
  });

  it('parses boyfriend of Daisy', () => {
    const p = parseRelationshipFact('Is the boyfriend of Daisy');
    expect(p?.relType).toBe('romantic');
    expect(p?.targetName).toBe('Daisy');
  });

  it('parses social facts', () => {
    expect(parseRelationshipFact('Met the narrator at a bar')?.relType).toBe('friend');
  });

  it('parses career recruiter signal', () => {
    expect(parseRelationshipFact("Is involved in the narrator's identity verification process")?.relType).toBe(
      'coworker'
    );
  });

  it('parses household cohabitation', () => {
    expect(parseRelationshipFact('Lives with the narrator')?.kinship).toBe('household');
    expect(parseRelationshipFact('Same household as Mom')?.relType).toBe('family');
  });
});

describe('resolveCharacterIdByName', () => {
  const chars = [
    { id: '1', name: 'Tío Rafa' },
    { id: '2', name: 'Daisy' },
    { id: '3', name: 'Me' },
  ];

  it('resolves exact and first-name', () => {
    expect(resolveCharacterIdByName('Rafa', chars)).toBe('1');
    expect(resolveCharacterIdByName('Daisy', chars)).toBe('2');
  });
});
