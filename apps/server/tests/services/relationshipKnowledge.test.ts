import { describe, expect, it } from 'vitest';

import {
  discoverEntityLinks,
  groupInputsByRelationshipScope,
  isValidRelationshipEndpoint,
  sanitizeRelationshipName,
} from '../../src/services/ontology/relationshipDiscovery';
import { relationshipKnowledgeService } from '../../src/services/ontology/relationshipKnowledgeService';
import { lexicalAnalyzerService } from '../../src/services/lexical/lexicalAnalyzerService';
import { hintToScope, roleToScope } from '../../src/services/ontology/canonical/relationshipKnowledge';

describe('relationshipDiscovery', () => {
  it('links self to named family member from "my cousin Marcus"', () => {
    const text = 'My cousin Marcus came over for dinner.';
    const links = discoverEntityLinks(text, [
      { surface: 'Marcus', normalized: 'marcus', type: 'PERSON', confidence: 0.8, source: 'test' },
    ], []);
    const cousinLink = links.find((l) => l.object === 'Marcus' && l.role === 'cousin');
    expect(cousinLink).toBeDefined();
    expect(cousinLink?.scope).toBe('FAMILY');
    expect(cousinLink?.relationshipType).toBe('CO_MENTIONED_WITH');
  });

  it('links self to org from work pattern', () => {
    const text = 'I work at Armstrong Robotics on ROS2 projects.';
    const links = discoverEntityLinks(text, [
      { surface: 'Armstrong Robotics', normalized: 'armstrong robotics', type: 'ORGANIZATION', confidence: 0.85, source: 'test' },
    ], []);
    const workLink = links.find((l) => l.relationshipType === 'WORKS_FOR');
    expect(workLink?.object).toMatch(/Armstrong Robotics/i);
    expect(workLink?.scope).toBe('PROFESSIONAL');
  });

  it('groups family and professional inputs separately', () => {
    const text = 'My cousin Marcus came over. I work at Armstrong Robotics.';
    const entities = [
      { surface: 'Marcus', normalized: 'marcus', type: 'PERSON' as const, confidence: 0.8, source: 'test' },
      { surface: 'Armstrong Robotics', normalized: 'armstrong robotics', type: 'ORGANIZATION' as const, confidence: 0.85, source: 'test' },
    ];
    const links = discoverEntityLinks(text, entities, []);
    const groups = groupInputsByRelationshipScope(text, links, entities, []);
    const scopes = groups.map((g) => g.scope);
    expect(scopes).toContain('FAMILY');
    expect(scopes).toContain('PROFESSIONAL');
  });

  it('creates co-mention links for multiple entities', () => {
    const text = 'Marcus and Juan went to the show.';
    const entities = [
      { surface: 'Marcus', normalized: 'marcus', type: 'PERSON' as const, confidence: 0.7, source: 'test' },
      { surface: 'Juan', normalized: 'juan', type: 'PERSON' as const, confidence: 0.7, source: 'test' },
    ];
    const links = discoverEntityLinks(text, entities, []);
    expect(links.some((l) => l.subject === 'Marcus' && l.object === 'Juan')).toBe(true);
  });

  it('sanitizes captured names and skips role-only links', () => {
    expect(sanitizeRelationshipName('Armstrong Robotics. We hung')).toBe('Armstrong Robotics');
    expect(sanitizeRelationshipName('Juan too.')).toBe('Juan');
    expect(isValidRelationshipEndpoint('friend')).toBe(false);
    expect(isValidRelationshipEndpoint('coworker')).toBe(false);

    const text = 'My cousin Marcus works at Armstrong Robotics. We hung out with Juan too.';
    const entities = [
      { surface: 'Marcus', normalized: 'marcus', type: 'PERSON' as const, confidence: 0.8, source: 'test' },
      { surface: 'Armstrong Robotics', normalized: 'armstrong robotics', type: 'ORGANIZATION' as const, confidence: 0.85, source: 'test' },
      { surface: 'Juan', normalized: 'juan', type: 'PERSON' as const, confidence: 0.75, source: 'test' },
    ];
    const relationships = [
      { role: 'cousin' as const, cue: 'my cousin', sentiment: 'neutral' as const, confidence: 0.82 },
      { role: 'coworker' as const, cue: 'works at', sentiment: 'neutral' as const, confidence: 0.82 },
      { role: 'friend' as const, cue: 'hung out with', sentiment: 'neutral' as const, confidence: 0.8 },
    ];
    const links = discoverEntityLinks(text, entities, relationships);
    const objects = links.map((l) => l.object);

    expect(objects).toContain('Marcus');
    expect(objects).toContain('Juan');
    expect(objects.some((o) => /Armstrong Robotics/i.test(o))).toBe(true);
    expect(objects).not.toContain('friend');
    expect(objects).not.toContain('coworker');
    expect(objects).not.toContain('cousin');
    expect(objects.some((o) => /\bWe hung\b/i.test(o))).toBe(false);
    expect(objects.some((o) => /too\.?$/i.test(o))).toBe(false);
  });
});

describe('relationshipKnowledgeService', () => {
  it('builds entity knowledge from lexical analysis', () => {
    const result = lexicalAnalyzerService.analyzeMessage({
      userId: 'u1',
      messageId: 'm1',
      text: 'My cousin Marcus works at Armstrong Robotics. We hung out with Juan too.',
    });
    const knowledge = relationshipKnowledgeService.buildFromLexical(result);
    const endpoints = [
      ...knowledge.entityLinks.map((l) => l.object),
      ...knowledge.entityLinks.map((l) => l.subject),
      ...knowledge.groups.flatMap((g) => g.entityNames),
    ];
    const objects = knowledge.entityLinks.map((l) => l.object);

    expect(knowledge.entityLinks.length).toBeGreaterThan(0);
    expect(knowledge.groups.length).toBeGreaterThan(0);
    expect(knowledge.entityKnowledge['Marcus']?.scopes).toContain('FAMILY');
    expect(objects).toContain('Marcus');
    expect(objects).toContain('Juan');
    expect(endpoints.some((name) => /Armstrong Robotics/i.test(String(name)))).toBe(true);
    expect(objects).not.toContain('friend');
    expect(objects).not.toContain('coworker');
  });

  it('maps hints and roles to scopes', () => {
    expect(hintToScope('FAMILY_RELATIONSHIP')).toBe('FAMILY');
    expect(hintToScope('WORK_RELATIONSHIP')).toBe('PROFESSIONAL');
    expect(roleToScope('romantic_partner')).toBe('ROMANTIC');
  });
});
