import { describe, expect, it } from 'vitest';
import {
  hasVicariousRomanticSignals,
  parseVicariousEpisode,
  extractAnchorCandidates,
} from '../../src/services/ontology/vicariousRomanticIntelligence';

describe('vicariousRomanticIntelligence', () => {
  it('detects vicarious signals', () => {
    expect(hasVicariousRomanticSignals('Sam was texting Marcus while we were still seeing each other')).toBe(true);
    expect(hasVicariousRomanticSignals('I had coffee today')).toBe(false);
  });

  it('parses named side partner overlap', () => {
    const hits = parseVicariousEpisode(
      'I think Sam was texting Marcus while we were still seeing each other last summer.',
      ['Sam']
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const hit = hits.find((h) => h.objectName === 'Marcus');
    expect(hit).toBeDefined();
    expect(hit?.subjectName).toBe('Sam');
    expect(hit?.role).toBe('side_partner');
    expect(hit?.tier).toBe('suspected');
  });

  it('does not tag a hit with a domain word mentioned elsewhere in a long message', () => {
    const message =
      'I think Sam was texting Marcus while we were still seeing each other. ' +
      'Unrelated: my coworker posted on Instagram about a show downtown and I might check it out this weekend.';
    const hits = parseVicariousEpisode(message, ['Sam']);
    const hit = hits.find((h) => h.objectName === 'Marcus');
    expect(hit).toBeDefined();
    expect(hit?.ontologyTags.some((t) => t.startsWith('APP/'))).toBe(false);
    expect(hit?.ontologyTags.some((t) => t.startsWith('EVENT/'))).toBe(false);
  });

  it('parses possessive ex pattern', () => {
    const hits = parseVicariousEpisode("Morgan's ex Nova keeps coming up in old stories.");
    expect(hits.some((h) => h.subjectName === 'Morgan' && h.role === 'ex')).toBe(true);
  });

  it('keeps an unnamed possessive ex as an ex, not a current partner', () => {
    const hits = parseVicariousEpisode("Alex's ex still texts on birthdays.", ['Alex']);
    const hit = hits.find((candidate) => candidate.subjectName === 'Alex');
    expect(hit?.role).toBe('ex');
    expect(hit?.objectSurface).toBe('ex partner');
  });

  it('captures a partner sexual-history story with its explicit time context', () => {
    const hits = parseVicariousEpisode(
      'Jamie hooked up with Jordan after they split.',
      ['Jamie'],
    );
    const hit = hits.find((candidate) => candidate.objectName === 'Jordan');
    expect(hit?.role).toBe('hookup');
    expect(hit?.evidence).toMatch(/hooked up with Jordan/i);
    expect(hit?.timeContext).toBe('after they split');
  });

  it('captures a dated prior-partner story without converting it to a fake date', () => {
    const hits = parseVicariousEpisode(
      "Jamie said her ex Jordan was still around in summer 2019.",
      ['Jamie'],
    );
    const hit = hits.find((candidate) => candidate.role === 'ex');
    expect(hit?.timeContext).toBe('in summer 2019');
  });

  it('parses confirmed together pattern', () => {
    const hits = parseVicariousEpisode(
      'Taylor and Jordan are together now — I heard from the art studio.',
      ['Taylor']
    );
    const hit = hits.find((h) => h.objectName === 'Jordan');
    expect(hit?.tier).toBe('confirmed');
    expect(hit?.role).toBe('current_partner');
  });

  it('parses anonymous someone else with anchor', () => {
    const hits = parseVicariousEpisode(
      'She is seeing someone else at work apparently.',
      ['Alex']
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].subjectName).toBe('Alex');
    expect(hits[0].objectSurface).toMatch(/someone/i);
    expect(hits[0].proximity).toBe('third_party');
  });

  it('extracts anchor candidates from possessive mentions', () => {
    const anchors = extractAnchorCandidates("Alex's new boyfriend came up in conversation.", ['Alex']);
    expect(anchors).toContain('Alex');
  });
});
