import { describe, expect, it } from 'vitest';

import { ENTITY_INTEGRITY_HOSTILE_CORPUS } from './entityIntegrityHostileCorpus';
import { classifyEntity } from './entityClassifier';
import { resolveMention } from './entityResolutionCore';
import {
  ENTITY_RESOLVER_VERSION,
  areEntityTypesCompatible,
  authorizeEntityMerge,
  normalizeEntityType,
} from './entityTypeCompatibility';

describe('entity type compatibility trust floor', () => {
  it('contains at least 50 deterministic hostile fixtures', () => {
    expect(ENTITY_INTEGRITY_HOSTILE_CORPUS.length).toBeGreaterThanOrEqual(50);
  });

  for (const fixture of ENTITY_INTEGRITY_HOSTILE_CORPUS) {
    it(`rejects ${fixture.id}: ${fixture.category}`, () => {
      const result = resolveMention(fixture.mention, [{
        id: `bad-${fixture.id}`,
        name: fixture.incompatibleCandidateName,
        aliases: [fixture.mention],
        type: fixture.incompatibleCandidateType,
        mentions: 100_000,
      }], {}, fixture.expectedType);

      expect(result.resolvedId).toBeNull();
      expect(result.action).not.toBe('resolve');
      expect(result.trace.rejectedCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({ entityId: `bad-${fixture.id}` }),
      ]));
    });
  }

  it('allows location subtypes and artifact subtypes within their families', () => {
    expect(areEntityTypesCompatible('country', 'location').compatible).toBe(true);
    expect(areEntityTypesCompatible('city', 'place').compatible).toBe(true);
    expect(areEntityTypesCompatible('software_tool', 'project').compatible).toBe(true);
    expect(areEntityTypesCompatible('school', 'organization').compatible).toBe(true);
  });

  it('treats unknown types conservatively', () => {
    expect(areEntityTypesCompatible('unknown', 'person').compatible).toBe(false);
    expect(areEntityTypesCompatible('person', undefined).compatible).toBe(false);
  });

  it('does not let embedding/phonetic/alias evidence override incompatibility', () => {
    for (const evidence of ['embedding=1.0', 'phonetic=1.0', 'exact-alias']) {
      const result = resolveMention('China', [{ id: evidence, name: 'China', aliases: ['China'], type: 'PERSON' }], {}, 'country');
      expect(result.resolvedId).toBeNull();
      expect(result.trace.rejectedCandidates[0]?.rejectionReason).toBe('ENTITY_TYPE_MISMATCH');
    }
  });

  it('is candidate-order independent and ignores incompatible high-similarity additions', () => {
    const compatible = { id: 'country-cn', name: 'China', type: 'country' };
    const incompatible = { id: 'person-china', name: 'China', aliases: ['China'], type: 'person', mentions: 999_999 };
    const a = resolveMention('China', [incompatible, compatible], {}, 'country');
    const b = resolveMention('China', [compatible, incompatible], {}, 'country');
    expect(a.resolvedId).toBe('country-cn');
    expect(b.resolvedId).toBe('country-cn');
  });

  it('abstains for two compatible same-name people without contextual separation', () => {
    const result = resolveMention('Ryan', [
      { id: 'ryan-1', name: 'Ryan', type: 'person' },
      { id: 'ryan-2', name: 'Ryan', type: 'person' },
    ], {}, 'person');
    expect(result.action).toBe('disambiguate');
    expect(result.resolvedId).toBeNull();
  });

  it('resolves legitimate compatible aliases across casing variants', () => {
    for (const mention of ['prima ai', 'PRIMA AI', 'Prima Ai', 'Prima']) {
      const result = resolveMention(mention, [{ id: 'prima', name: 'Prima AI', aliases: ['Prima'], type: 'APP' }], {}, 'software_tool');
      expect(result.resolvedId).toBe('prima');
    }
  });

  it('requires compatibility, evidence, reason, and resolver version for a persisted merge', () => {
    expect(authorizeEntityMerge({ sourceType: 'person', targetType: 'country', reason: 'fuzzy', evidenceIds: ['m1'], actor: 'SYSTEM' }).authorized).toBe(false);
    expect(authorizeEntityMerge({ sourceType: 'person', targetType: 'person', reason: '', evidenceIds: ['m1'], actor: 'USER' }).authorized).toBe(false);
    const authorized = authorizeEntityMerge({ sourceType: 'person', targetType: 'person', reason: 'User confirmed duplicate', evidenceIds: ['message:m1'], actor: 'USER' });
    expect(authorized.authorized).toBe(true);
    expect(authorized.resolverVersion).toBe(ENTITY_RESOLVER_VERSION);
  });

  it('normalizes the existing ontology instead of introducing storage-only types', () => {
    expect(normalizeEntityType('CHARACTER')).toBe('person');
    expect(normalizeEntityType('APP')).toBe('software_tool');
    expect(normalizeEntityType('PLACE')).toBe('location');
  });

  it('infers the reported regression types from full sentence context', () => {
    const message = "I work with Kavi, Dorian, Kelan, Hark, Jules, Rhys, and Xola. Kelan is a temp contractor and a good coder who made the internal chatbot tool Prima AI. Xola is a hardware engineer with a master's in electrical engineering from USC and grew up in China.";
    expect(classifyEntity('Prima AI', message).type).toBe('APP');
    expect(classifyEntity('China', message).type).toBe('PLACE');
    expect(classifyEntity('USC', message).type).toBe('ORGANIZATION');
    expect(classifyEntity('Xola', message).type).toBe('PERSON');
    expect(classifyEntity('Anime Expo', 'I attended Anime Expo.').type).toBe('EVENT');
    expect(classifyEntity('Ring', 'I work at Ring with Ryan.').type).toBe('ORGANIZATION');
    expect(classifyEntity('Ring', 'We tested Ring cameras.').type).toBe('PRODUCT');
  });
});
