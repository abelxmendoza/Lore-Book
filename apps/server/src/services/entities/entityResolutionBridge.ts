import { AI_THRESHOLDS } from '../../config/aiThresholds';
import { logger } from '../../logger';
import type { Entity } from '../../types/omegaMemory';
import { jaroWinkler } from '../../utils/jaroWinkler';
import { normalizeNameKey } from '../../utils/nameNormalization';

import {
  getEntityResolutionCoreMode,
  isEntityResolutionCoreActive,
  isEntityResolutionShadowEnabled,
} from './entityResolutionConfig';
import {
  resolveMention,
  type ResolutionCandidate,
  type ResolutionContext,
  type ResolutionResult,
} from './entityResolutionCore';
import { isMatchVetoedByType } from './entityTypeCompatibility';

export type LegacyMatchMethod = 'exact' | 'alias' | 'jw' | 'none';

export type LegacyMatchDecision = {
  entity: Entity | null;
  method: LegacyMatchMethod;
};

export type CoreProductionDecision = 'resolve' | 'create' | 'skip';

export type ShadowComparison = {
  mention: string;
  entityType: string;
  agreement: boolean;
  legacy: {
    action: 'resolve' | 'create';
    entityId: string | null;
    entityName: string | null;
    method: LegacyMatchMethod;
  };
  core: {
    action: ResolutionResult['action'];
    recommendation: ResolutionResult['recommendation'];
    confidence: number;
    resolvedId: string | null;
    classification: ResolutionResult['classification'];
  };
};

export function entityToResolutionCandidate(entity: Entity): ResolutionCandidate {
  const metadata = entity.metadata ?? {};
  return {
    id: entity.id,
    name: entity.primary_name,
    aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
    type: entity.type,
    mentions: typeof metadata.mention_count === 'number' ? metadata.mention_count : undefined,
    lastMentionedAt:
      typeof metadata.last_mentioned_at === 'string' ? metadata.last_mentioned_at : null,
    relatedEntityIds: Array.isArray(metadata.related_entity_ids)
      ? (metadata.related_entity_ids as string[])
      : [],
  };
}

/** In-memory legacy matcher (exact → alias → JW). Does not hit DB. */
export function findLegacyPoolMatch(name: string, pool: Entity[], expectedType?: string): LegacyMatchDecision {
  const nameLower = normalizeNameKey(name);
  // Only a known cross-family mismatch excludes a candidate. An undefined
  // expectedType (or untyped pool rows) must not empty the pool — that made
  // every untyped caller silently match nothing.
  const compatiblePool = pool.filter((entity) => !isMatchVetoedByType(expectedType, entity.type));

  const exact =
    compatiblePool.find(
      (entity) =>
        normalizeNameKey(entity.primary_name) === nameLower ||
        (Array.isArray(entity.aliases) &&
          entity.aliases.some((alias) => normalizeNameKey(alias) === nameLower))
    ) ?? null;

  if (exact) {
    const method =
      normalizeNameKey(exact.primary_name) === nameLower ? 'exact' : ('alias' as const);
    return { entity: exact, method };
  }

  let bestScore = 0;
  let bestEntity: Entity | null = null;

  for (const entity of compatiblePool) {
    const names = [entity.primary_name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])].filter(
      Boolean
    );
    const score = Math.max(
      ...names.map((candidateName) => jaroWinkler(nameLower, normalizeNameKey(candidateName)))
    );
    if (score > bestScore) {
      bestScore = score;
      bestEntity = entity;
    }
  }

  if (bestScore >= AI_THRESHOLDS.JW_ENTITY_MATCH && bestEntity) {
    return { entity: bestEntity, method: 'jw' };
  }

  return { entity: null, method: 'none' };
}

export function resolveMentionWithCore(
  mention: string,
  pool: Entity[],
  context: ResolutionContext = {},
  providedType?: string
): ResolutionResult {
  return resolveMention(mention, pool.map(entityToResolutionCandidate), context, providedType);
}

export function coreProductionDecision(result: ResolutionResult): CoreProductionDecision {
  if (result.recommendation === 'skip') return 'skip';
  if (result.recommendation === 'auto_resolve' && result.resolvedId) return 'resolve';
  // A suggestion is not merge authorization. Preserve a false split until a
  // user or stronger compatible evidence resolves the ambiguity.
  if (result.recommendation === 'merge_suggestion') return 'create';
  return 'create';
}

export function pickEntityForCoreDecision(
  result: ResolutionResult,
  pool: Entity[]
): Entity | null {
  const decision = coreProductionDecision(result);
  if (decision === 'skip') return null;
  if (decision === 'create') return null;

  const targetId =
    result.resolvedId ??
    (result.recommendation === 'merge_suggestion' ? result.ranked[0]?.id : null);

  if (!targetId) return null;
  return pool.find((entity) => entity.id === targetId) ?? null;
}

export function compareLegacyAndCore(
  mention: string,
  entityType: string,
  legacy: LegacyMatchDecision,
  core: ResolutionResult
): ShadowComparison {
  const legacyAction = legacy.entity ? 'resolve' : 'create';
  const coreDecision = coreProductionDecision(core);
  const coreResolvedId =
    core.resolvedId ??
    (core.recommendation === 'merge_suggestion' ? core.ranked[0]?.id ?? null : null);

  const agreement =
    (legacyAction === 'resolve' &&
      coreDecision === 'resolve' &&
      legacy.entity?.id === coreResolvedId) ||
    (legacyAction === 'create' && coreDecision === 'create') ||
    (legacyAction === 'create' && coreDecision === 'skip');

  return {
    mention,
    entityType,
    agreement,
    legacy: {
      action: legacyAction,
      entityId: legacy.entity?.id ?? null,
      entityName: legacy.entity?.primary_name ?? null,
      method: legacy.method,
    },
    core: {
      action: core.action,
      recommendation: core.recommendation,
      confidence: core.confidence,
      resolvedId: coreResolvedId,
      classification: core.classification,
    },
  };
}

export function logShadowComparison(comparison: ShadowComparison): void {
  const level = comparison.agreement ? 'debug' : 'info';
  logger[level](
    {
      entityResolution: 'shadow',
      mode: getEntityResolutionCoreMode(),
      ...comparison,
    },
    comparison.agreement
      ? 'Entity resolution shadow agreement'
      : 'Entity resolution shadow disagreement'
  );
}

export type ResolveWithCoreOptions = {
  mention: string;
  entityType: string;
  pool: Entity[];
  context?: ResolutionContext;
};

export type ResolveWithCoreResult = {
  useCore: boolean;
  core: ResolutionResult;
  legacy: LegacyMatchDecision;
  comparison: ShadowComparison;
  productionDecision: CoreProductionDecision;
  entityFromCore: Entity | null;
};

/** Character row shape used by CharacterRegistry → core bridge. */
export type CharacterResolutionRow = {
  id: string;
  name: string;
  alias: string[] | null;
  metadata: Record<string, unknown> | null;
};

export function characterToResolutionCandidate(row: CharacterResolutionRow): ResolutionCandidate {
  const metadata = row.metadata ?? {};
  return {
    id: row.id,
    name: row.name,
    aliases: Array.isArray(row.alias) ? row.alias : [],
    type: 'PERSON',
    mentions: typeof metadata.mention_count === 'number' ? metadata.mention_count : undefined,
    lastMentionedAt:
      typeof metadata.last_mentioned_at === 'string' ? metadata.last_mentioned_at : null,
    relatedEntityIds: Array.isArray(metadata.related_entity_ids)
      ? (metadata.related_entity_ids as string[])
      : [],
  };
}

/**
 * Character creation uses stricter defer rules than omega entity resolution:
 * only auto_resolve may merge; merge_suggestion and disambiguate → defer.
 */
export type CharacterCreationCoreAction = 'merge' | 'create' | 'defer' | 'reject';

export function characterCreationActionFromCore(result: ResolutionResult): CharacterCreationCoreAction {
  if (result.recommendation === 'skip') return 'reject';
  if (result.action === 'create' || result.recommendation === 'create_separate') return 'create';
  if (result.action === 'resolve' && result.recommendation === 'auto_resolve' && result.resolvedId) {
    return 'merge';
  }
  if (result.action === 'disambiguate' || result.recommendation === 'merge_suggestion') return 'defer';
  return 'create';
}

export type CharacterCreationShadowComparison = {
  mention: string;
  agreement: boolean;
  legacy: { action: 'reject' | 'merge' | 'create' | 'defer' };
  core: { action: CharacterCreationCoreAction; recommendation: ResolutionResult['recommendation'] };
};

export function compareCharacterCreationDecisions(
  mention: string,
  legacyAction: CharacterCreationShadowComparison['legacy']['action'],
  coreAction: CharacterCreationCoreAction,
  coreRecommendation: ResolutionResult['recommendation']
): CharacterCreationShadowComparison {
  const agreement =
    legacyAction === coreAction ||
    (legacyAction === 'defer' && coreAction === 'defer') ||
    (legacyAction === 'reject' && coreAction === 'reject');
  return {
    mention,
    agreement,
    legacy: { action: legacyAction },
    core: { action: coreAction, recommendation: coreRecommendation },
  };
}

export function logCharacterCreationShadowComparison(comparison: CharacterCreationShadowComparison): void {
  const level = comparison.agreement ? 'debug' : 'info';
  logger[level](
    {
      entityResolution: 'character_creation_shadow',
      mode: getEntityResolutionCoreMode(),
      ...comparison,
    },
    comparison.agreement
      ? 'Character creation shadow agreement'
      : 'Character creation shadow disagreement'
  );
}

/** Compare legacy vs core and decide which path is authoritative. */
export function resolveWithCore(options: ResolveWithCoreOptions): ResolveWithCoreResult {
  const { mention, entityType, pool, context = {} } = options;
  const legacy = findLegacyPoolMatch(mention, pool, entityType);
  const core = resolveMentionWithCore(mention, pool, context, entityType);
  const comparison = compareLegacyAndCore(mention, entityType, legacy, core);

  if (isEntityResolutionShadowEnabled()) {
    logShadowComparison(comparison);
  }

  const useCore = isEntityResolutionCoreActive();
  const productionDecision = useCore ? coreProductionDecision(core) : legacy.entity ? 'resolve' : 'create';
  const entityFromCore = useCore ? pickEntityForCoreDecision(core, pool) : null;

  return {
    useCore,
    core,
    legacy,
    comparison,
    productionDecision,
    entityFromCore,
  };
}
