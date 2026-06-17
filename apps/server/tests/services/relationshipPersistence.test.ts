import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockEnsureSelf = vi.fn();

vi.mock('../../src/services/entityRegistry/EntityRegistry', () => ({
  entityRegistry: {
    resolveByName: vi.fn(async () => null),
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../../src/services/selfCharacterService', () => ({
  selfCharacterService: {
    ensureSelfCharacter: (...args: unknown[]) => mockEnsureSelf(...args),
  },
}));

import { relationshipPersistenceService } from '../../src/services/ontology/relationshipPersistenceService';
import type { LexicalAnalysisResult } from '../../src/services/lexical/lexicalTypes';
import type { MeaningResolutionResult } from '../../src/services/meaning/meaningResolutionTypes';

function chain(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'limit', 'order', 'maybeSingle', 'insert', 'update', 'upsert']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
  return builder;
}

describe('relationshipPersistenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureSelf.mockResolvedValue({ id: 'self-char', name: 'Me' });
  });

  it('persists resolved entity link to entity_relationships', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain({ data: [{ id: 'self-char', name: 'Me', alias: [] }], error: null });
      }
      if (table === 'organizations') {
        return chain({ data: [{ id: 'org-1', name: 'Armstrong Robotics' }], error: null });
      }
      if (table === 'omega_entities') {
        return chain({ data: [], error: null });
      }
      if (table === 'entity_relationships') {
        const b = chain({ data: null, error: null });
        b.insert = insert;
        return b;
      }
      return chain({ data: [], error: null });
    });

    const lexical = {
      entityLinks: [{
        subject: 'self',
        object: 'Armstrong Robotics',
        relationshipType: 'WORKS_FOR',
        scope: 'PROFESSIONAL',
        cue: 'I work at Armstrong Robotics',
        confidence: 0.9,
      }],
    } as LexicalAnalysisResult;

    const meaning = {
      resolvedEntities: [{
        surface: 'Armstrong Robotics',
        normalized: 'armstrong robotics',
        kind: 'ORGANIZATION',
        entityId: 'org-1',
        confidence: 0.9,
        resolutionReason: 'test',
        requiresConfirmation: false,
      }],
      resolvedRelationships: [],
    } as MeaningResolutionResult;

    const result = await relationshipPersistenceService.persistFromInterpretation(
      'user-1',
      'msg-1',
      lexical,
      meaning
    );

    expect(result.persisted).toBe(1);
    expect(result.entityEdges).toBe(1);
    expect(insert).toHaveBeenCalled();
  });

  it('skips low-confidence co-mention links', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain({ data: [{ id: 'c1', name: 'Marcus', alias: [] }, { id: 'c2', name: 'Juan', alias: [] }], error: null });
      }
      return chain({ data: [], error: null });
    });

    const lexical = {
      entityLinks: [{
        subject: 'Marcus',
        object: 'Juan',
        relationshipType: 'CO_MENTIONED_WITH',
        scope: 'SOCIAL',
        cue: 'Marcus and Juan',
        confidence: 0.55,
      }],
    } as LexicalAnalysisResult;

    const meaning = {
      resolvedEntities: [
        { surface: 'Marcus', normalized: 'marcus', kind: 'PERSON', entityId: 'c1', confidence: 0.8, resolutionReason: 'test', requiresConfirmation: false },
        { surface: 'Juan', normalized: 'juan', kind: 'PERSON', entityId: 'c2', confidence: 0.8, resolutionReason: 'test', requiresConfirmation: false },
      ],
      resolvedRelationships: [],
    } as MeaningResolutionResult;

    const result = await relationshipPersistenceService.persistFromInterpretation(
      'user-1',
      'msg-1',
      lexical,
      meaning
    );

    expect(result.persisted).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('loads stored relationship knowledge for a character', async () => {
    mockFrom.mockImplementation(() =>
      chain({
        data: [{
          id: 'edge-1',
          from_entity_id: 'char-1',
          to_entity_id: 'org-1',
          from_entity_type: 'character',
          to_entity_type: 'omega_entity',
          relationship_type: 'WORKS_FOR',
          scope: 'PROFESSIONAL',
          confidence: 0.9,
          metadata: { role: 'coworker' },
        }],
        error: null,
      })
    );

    const knowledge = await relationshipPersistenceService.loadCharacterRelationshipKnowledge('user-1', 'char-1');
    expect(knowledge.relationship_edge_count).toBe(1);
    expect(knowledge.relationship_scopes).toContain('PROFESSIONAL');
    expect(knowledge.relationship_roles).toContain('coworker');
  });
});
