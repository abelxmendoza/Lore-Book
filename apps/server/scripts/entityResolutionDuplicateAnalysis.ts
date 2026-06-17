/**
 * Duplicate-variant analysis: legacy pool matcher vs EntityResolutionCore.
 *
 * Run:
 *   npx tsx apps/server/scripts/entityResolutionDuplicateAnalysis.ts
 */
import type { Entity } from '../src/types/omegaMemory';
import {
  compareLegacyAndCore,
  findLegacyPoolMatch,
  resolveMentionWithCore,
} from '../src/services/entities/entityResolutionBridge';

type VariantCase = {
  family: string;
  mention: string;
  pool: Entity[];
  expectedCoreId: string | null;
};

const FIXTURE_POOL: Entity[] = [
  {
    id: 'e-abuela',
    user_id: 'u1',
    type: 'CHARACTER',
    primary_name: 'Grandma Rose',
    aliases: ['Abuela', 'Abuelita', 'grandma'],
    created_at: '',
    updated_at: '',
  },
  {
    id: 'e-tiojuan',
    user_id: 'u1',
    type: 'CHARACTER',
    primary_name: 'Uncle James',
    aliases: ['Juan', 'Tio Juan', 'Tío Juan'],
    created_at: '',
    updated_at: '',
    metadata: { related_entity_ids: ['e-abuela'] },
  },
  {
    id: 'e-oscuri',
    user_id: 'u1',
    type: 'CHARACTER',
    primary_name: 'Juan',
    aliases: [],
    created_at: '',
    updated_at: '',
    metadata: { related_entity_ids: ['e-club'] },
  },
  {
    id: 'e-andrew',
    user_id: 'u1',
    type: 'CHARACTER',
    primary_name: 'Andrew',
    aliases: ['Andy'],
    created_at: '',
    updated_at: '',
  },
  {
    id: 'e-ashley',
    user_id: 'u1',
    type: 'CHARACTER',
    primary_name: 'Ashley',
    aliases: ['Ash'],
    created_at: '',
    updated_at: '',
  },
  {
    id: 'e-hf',
    user_id: 'u1',
    type: 'CHARACTER',
    primary_name: 'Velvet Hour',
    aliases: ['Daisy', 'Hell Fairy'],
    created_at: '',
    updated_at: '',
  },
  {
    id: 'e-mom',
    user_id: 'u1',
    type: 'CHARACTER',
    primary_name: 'Mother',
    aliases: [],
    created_at: '',
    updated_at: '',
  },
];

const VARIANTS: VariantCase[] = [
  { family: 'Tio Juan', mention: 'Tio Juan', pool: FIXTURE_POOL, expectedCoreId: 'e-tiojuan' },
  { family: 'Tio Juan', mention: 'Tío Juan', pool: FIXTURE_POOL, expectedCoreId: 'e-tiojuan' },
  { family: 'Abuela', mention: 'Abuela', pool: FIXTURE_POOL, expectedCoreId: 'e-abuela' },
  { family: 'Abuela', mention: 'grandma', pool: FIXTURE_POOL, expectedCoreId: 'e-abuela' },
  { family: 'Andrew', mention: 'Andrew', pool: FIXTURE_POOL, expectedCoreId: 'e-andrew' },
  { family: 'Andrew', mention: 'Andy', pool: FIXTURE_POOL, expectedCoreId: 'e-andrew' },
  { family: 'Ashley', mention: 'Ashley', pool: FIXTURE_POOL, expectedCoreId: 'e-ashley' },
  { family: 'Hell Fairy', mention: 'Hell Fairy', pool: FIXTURE_POOL, expectedCoreId: 'e-hf' },
  { family: 'Daisy', mention: 'Daisy', pool: FIXTURE_POOL, expectedCoreId: 'e-hf' },
  { family: 'Abuela', mention: 'Mom', pool: FIXTURE_POOL, expectedCoreId: 'e-mom' },
];

function analyzeVariant(testCase: VariantCase, withThreadContext = false) {
  const context = withThreadContext ? { threadEntityIds: ['e-abuela'] } : {};
  const legacy = findLegacyPoolMatch(testCase.mention, testCase.pool);
  const core = resolveMentionWithCore(testCase.mention, testCase.pool, context);
  const comparison = compareLegacyAndCore(testCase.mention, 'CHARACTER', legacy, core);

  const legacyWouldCreate = !legacy.entity;
  const coreWouldCreate = core.recommendation === 'create_separate';
  const duplicatePrevented = legacyWouldCreate && !coreWouldCreate && core.resolvedId !== null;

  return {
    family: testCase.family,
    mention: testCase.mention,
    withThreadContext,
    agreement: comparison.agreement,
    legacy: {
      action: legacy.entity ? 'resolve' : 'create',
      entityId: legacy.entity?.id ?? null,
      method: legacy.method,
    },
    core: {
      action: core.action,
      recommendation: core.recommendation,
      confidence: core.confidence,
      resolvedId: core.resolvedId ?? core.ranked[0]?.id ?? null,
      classification: core.classification,
    },
    duplicatePrevented,
    duplicateStillCreated: legacyWouldCreate && coreWouldCreate,
  };
}

function main() {
  console.log('Entity Resolution Duplicate Analysis\n');

  const rows = [
    ...VARIANTS.map((v) => analyzeVariant(v, false)),
    analyzeVariant(
      { family: 'Tio Juan', mention: 'Juan', pool: FIXTURE_POOL, expectedCoreId: null },
      false
    ),
    analyzeVariant(
      { family: 'Tio Juan', mention: 'Juan', pool: FIXTURE_POOL, expectedCoreId: 'e-tiojuan' },
      true
    ),
  ];

  const prevented = rows.filter((r) => r.duplicatePrevented);
  const stillCreated = rows.filter((r) => r.duplicateStillCreated);
  const disagreements = rows.filter((r) => !r.agreement);

  console.log(JSON.stringify({ rows, summary: {
    total: rows.length,
    agreements: rows.length - disagreements.length,
    disagreements: disagreements.length,
    duplicatesPrevented: prevented.length,
    duplicatesStillCreated: stillCreated.length,
  } }, null, 2));
}

main();
