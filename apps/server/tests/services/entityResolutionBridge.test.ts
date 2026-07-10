import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/aiThresholds', () => ({
  AI_THRESHOLDS: { JW_ENTITY_MATCH: 0.88 },
}));
vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../src/utils/jaroWinkler', () => ({
  jaroWinkler: vi.fn(),
}));

import { jaroWinkler } from '../../src/utils/jaroWinkler';
import type { Entity } from '../../src/types/omegaMemory';
import {
  compareLegacyAndCore,
  findLegacyPoolMatch,
  resolveWithCore,
} from '../../src/services/entities/entityResolutionBridge';
import { resolveMention, type ResolutionCandidate } from '../../src/services/entities/entityResolutionCore';

const abuelaEntity: Entity = {
  id: 'e-abuela',
  user_id: 'u1',
  type: 'CHARACTER',
  primary_name: 'Grandma Rose',
  aliases: ['grandma', 'Abuelita', 'Abuela'],
  created_at: '',
  updated_at: '',
};

const tioJuanEntity: Entity = {
  id: 'e-tiojuan',
  user_id: 'u1',
  type: 'CHARACTER',
  primary_name: 'Uncle James',
  aliases: ['Juan', 'Tio Juan'],
  created_at: '',
  updated_at: '',
};

const oscuriJuanEntity: Entity = {
  id: 'e-oscuri',
  user_id: 'u1',
  type: 'CHARACTER',
  primary_name: 'Juan',
  aliases: [],
  created_at: '',
  updated_at: '',
  metadata: { related_entity_ids: ['e-club'] },
};

describe('entityResolutionBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jaroWinkler).mockReturnValue(0);
    delete process.env.ENTITY_RESOLUTION_CORE;
  });

  afterEach(() => {
    delete process.env.ENTITY_RESOLUTION_CORE;
  });

  it('findLegacyPoolMatch resolves exact and alias hits', () => {
    expect(findLegacyPoolMatch('Grandma Rose', [abuelaEntity], 'CHARACTER').method).toBe('exact');
    expect(findLegacyPoolMatch('Abuela', [abuelaEntity], 'CHARACTER').method).toBe('alias');
  });

  it('shadow mode logs disagreement when core resolves kinship legacy would create', () => {
    process.env.ENTITY_RESOLUTION_CORE = 'shadow';
    const motherEntity: Entity = {
      id: 'e-mom',
      user_id: 'u1',
      type: 'CHARACTER',
      primary_name: 'Mother',
      aliases: [],
      created_at: '',
      updated_at: '',
    };
    const result = resolveWithCore({
      mention: 'Mom',
      entityType: 'CHARACTER',
      pool: [motherEntity],
    });

    expect(result.useCore).toBe(false);
    expect(result.comparison.agreement).toBe(false);
    expect(result.comparison.legacy.action).toBe('create');
    expect(result.comparison.core.resolvedId).toBe('e-mom');
  });

  it('on mode uses core decision for kinship alias', () => {
    process.env.ENTITY_RESOLUTION_CORE = 'on';
    const result = resolveWithCore({
      mention: 'grandma',
      entityType: 'CHARACTER',
      pool: [abuelaEntity],
    });

    expect(result.useCore).toBe(true);
    expect(result.entityFromCore?.id).toBe('e-abuela');
    expect(result.productionDecision).toBe('resolve');
  });

  it('on mode disambiguates Juan with thread context', () => {
    process.env.ENTITY_RESOLUTION_CORE = 'on';
    const pool = [tioJuanEntity, oscuriJuanEntity];
    const result = resolveWithCore({
      mention: 'Juan',
      entityType: 'CHARACTER',
      pool,
      context: { threadEntityIds: ['e-tiojuan'] },
    });

    expect(result.entityFromCore?.id).toBe('e-tiojuan');
  });

  it('Daisy resolves to Hell Fairy only when alias exists', () => {
    const withAlias = resolveMention('Daisy', [
      { id: 'e-hf', name: 'Velvet Hour', aliases: ['Daisy', 'Hell Fairy'], type: 'PERSON' },
    ], {}, 'PERSON');
    expect(withAlias.resolvedId).toBe('e-hf');

    const withoutAlias = resolveMention('Daisy', [
      { id: 'e-hf2', name: 'Velvet Hour', aliases: ['Hell Fairy'], type: 'PERSON' },
    ], {}, 'PERSON');
    expect(withoutAlias.resolvedId).toBeNull();
  });

  it('compareLegacyAndCore marks agreement when both resolve same entity', () => {
    const legacy = findLegacyPoolMatch('Abuela', [abuelaEntity], 'CHARACTER');
    const core = resolveMention('Abuela', [
      { id: abuelaEntity.id, name: abuelaEntity.primary_name, aliases: abuelaEntity.aliases, type: 'PERSON' },
    ], {}, 'PERSON');
    const comparison = compareLegacyAndCore('Abuela', 'CHARACTER', legacy, core);
    expect(comparison.agreement).toBe(true);
  });
});

describe('Entity variant battery (duplicate analysis fixtures)', () => {
  const pool: ResolutionCandidate[] = [
    { id: 'e-abuela', name: 'Grandma Rose', aliases: ['Abuela', 'Abuelita', 'grandma'], type: 'PERSON' },
    { id: 'e-tiojuan', name: 'Uncle James', aliases: ['Juan', 'Tio Juan', 'Tío Juan'], relatedEntityIds: ['e-abuela'], type: 'PERSON' },
    { id: 'e-oscuri', name: 'Juan', aliases: [], relatedEntityIds: ['e-club'], type: 'PERSON' },
    { id: 'e-andrew', name: 'Andrew', aliases: ['Andy'], type: 'PERSON' },
    { id: 'e-ashley', name: 'Ashley', aliases: ['Ash'], type: 'PERSON' },
    { id: 'e-hf', name: 'Velvet Hour', aliases: ['Daisy', 'Hell Fairy'], type: 'PERSON' },
  ];

  const variants: Array<{ label: string; mention: string; expectedId: string | null }> = [
    { label: 'Tio Juan', mention: 'Tio Juan', expectedId: 'e-tiojuan' },
    { label: 'Tío Juan', mention: 'Tío Juan', expectedId: 'e-tiojuan' },
    { label: 'Juan (ambiguous)', mention: 'Juan', expectedId: null },
    { label: 'Abuela', mention: 'Abuela', expectedId: 'e-abuela' },
    { label: 'grandma kinship', mention: 'grandma', expectedId: 'e-abuela' },
    { label: 'Andrew', mention: 'Andrew', expectedId: 'e-andrew' },
    { label: 'Andy alias', mention: 'Andy', expectedId: 'e-andrew' },
    { label: 'Ashley', mention: 'Ashley', expectedId: 'e-ashley' },
    { label: 'Hell Fairy alias', mention: 'Hell Fairy', expectedId: 'e-hf' },
    { label: 'Daisy alias', mention: 'Daisy', expectedId: 'e-hf' },
  ];

  it.each(variants)('$label → core resolves without duplicate create', ({ mention, expectedId }) => {
    const result = resolveMention(mention, pool, {}, 'PERSON');
    if (expectedId) {
      expect(result.action).toBe('resolve');
      expect(result.resolvedId).toBe(expectedId);
    } else {
      expect(result.action).toBe('disambiguate');
    }
  });
});
