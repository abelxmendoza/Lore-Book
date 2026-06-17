import { describe, expect, it } from 'vitest';
import {
  hasVicariousRelationshipSignals,
  parseVicariousRelationships,
} from '../../src/services/ontology/vicariousRelationshipIntelligence';

describe('vicariousRelationshipIntelligence', () => {
  it('detects family possessive signals', () => {
    expect(hasVicariousRelationshipSignals("Sarah's sister Carmen visited last month")).toBe(true);
  });

  it('parses family sister pattern', () => {
    const hits = parseVicariousRelationships("Sarah's sister Carmen visited last month", ['Sarah']);
    expect(hits.some((h) => h.domain === 'family' && h.objectSurface.includes('Carmen'))).toBe(true);
  });

  it('parses social roommate pattern', () => {
    const hits = parseVicariousRelationships("Sam's roommate Drew is always around", ['Sam']);
    const hit = hits.find((h) => h.domain === 'social');
    expect(hit?.role).toBe('roommate');
  });

  it('parses professional manager pattern', () => {
    const hits = parseVicariousRelationships("Jordan's new manager is intense", ['Jordan']);
    expect(hits.some((h) => h.domain === 'professional' && h.role === 'manager')).toBe(true);
  });

  it('still includes romantic hits', () => {
    const hits = parseVicariousRelationships(
      'Sam was texting Marcus while we were still seeing each other',
      ['Sam']
    );
    expect(hits.some((h) => h.domain === 'romantic')).toBe(true);
  });

  it('parses mentor coach pattern', () => {
    const hits = parseVicariousRelationships("Carlos's coach Reyes is intense", ['Carlos']);
    expect(hits.some((h) => h.domain === 'mentor' && h.role === 'mentor')).toBe(true);
  });

  it('parses adversarial lawyer ally pattern', () => {
    const hits = parseVicariousRelationships("Maya's lawyer ally pushed back", ['Maya']);
    expect(hits.some((h) => h.domain === 'adversarial')).toBe(true);
  });

  it('parses creative producer pattern', () => {
    const hits = parseVicariousRelationships("Sam's producer Alex is mixing the pilot", ['Sam']);
    expect(hits.some((h) => h.domain === 'creative' && h.role === 'collaborator')).toBe(true);
  });
});
