/**
 * Social relationship intelligence — glossary SSOT tests.
 */
import { describe, expect, it } from 'vitest';

import { socialRoleSpecs } from '../../src/services/ontology/glossary';
import { parseSocialRoles, hasSocialRoleSignals } from '../../src/services/ontology/socialRelationshipIntelligence';
import { detectLexicalRelationships } from '../../src/services/lexical/lexicalRelationshipDetector';

describe('social relationship intelligence', () => {
  it('socialRoleSpecs covers close friend and ally roles', () => {
    const roles = new Set(socialRoleSpecs().map((s) => s.role));
    expect(roles.has('close_friend')).toBe(true);
    expect(roles.has('ally')).toBe(true);
    expect(roles.has('friend')).toBe(true);
  });

  it('parseSocialRoles detects bestie and ally', () => {
    const hits = parseSocialRoles('My bestie Maya has my back through everything.');
    expect(hits.some((h) => h.role === 'close_friend')).toBe(true);
    expect(hits.some((h) => h.role === 'ally')).toBe(true);
  });

  it('parseSocialRoles excludes third-party attribution', () => {
    const hits = parseSocialRoles("She's my best friend and I'm happy for her.");
    const selfHits = hits.filter((h) => h.attributedToSelf);
    expect(selfHits.length).toBe(0);
  });

  it('detectLexicalRelationships wires glossary social roles', () => {
    const signals = detectLexicalRelationships('Hung out with my homie Jordan last night.');
    expect(signals.some((s) => s.role === 'friend')).toBe(true);
  });

  it('hasSocialRoleSignals is false without social cues', () => {
    expect(hasSocialRoleSignals('I went running.')).toBe(false);
  });
});
