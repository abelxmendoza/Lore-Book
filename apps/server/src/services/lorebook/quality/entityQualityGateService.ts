/**
 * Cross-domain entity quality gate — orchestrates all LoreBook card guards.
 */

import { buildCrossBookIndexForUser } from '../../lexical/projects/projectCrossBookGuard';
import { logger } from '../../../logger';
import { guardBareCategoryWord } from './bareCategoryWordGuard';
import { guardBrokenSpan } from './brokenSpanGuard';
import {
  guardCrossDomainKnownEntity,
  guardWrongBookPlacement,
} from './crossDomainKnownEntityGuard';
import { guardDuplicateEntity } from './duplicateEntityGuard';
import { guardGenericReference } from './genericReferenceGuard';
import { guardSensitiveEntity } from './sensitiveEntityGuard';
import { guardStandaloneTimePhrase } from '../../timeline/timelineSuggestionGuard';
import type {
  EntityQualityCandidate,
  EntityQualityContext,
  EntityQualityGate,
  EntityQualityVerdict,
} from './entityQualityGuardTypes';

export type EvaluateEntityQualityOptions = EntityQualityContext & {
  skipDuplicateCheck?: boolean;
  skipSensitiveCheck?: boolean;
};

function allowVerdict(candidate: EntityQualityCandidate): EntityQualityVerdict {
  return {
    gate: 'allow',
    name: candidate.name.trim(),
    domain: candidate.domain,
    confidence: candidate.confidence ?? 0.7,
    provenance: [{ guard: 'entityQualityGateService', rule: 'all_guards_passed' }],
    requiresReview: false,
  };
}

function mergeProvenance(base: EntityQualityVerdict, extra: EntityQualityVerdict): EntityQualityVerdict {
  return {
    ...extra,
    provenance: [...base.provenance, ...extra.provenance],
  };
}

/**
 * Evaluate a single entity candidate against universal LoreBook quality rules.
 */
export function evaluateEntityQuality(
  candidate: EntityQualityCandidate,
  options: EvaluateEntityQualityOptions = {}
): EntityQualityVerdict {
  const normalized: EntityQualityCandidate = {
    ...candidate,
    name: candidate.name.trim(),
    contextText: candidate.contextText?.trim(),
    evidence: candidate.evidence?.trim(),
  };

  const broken = guardBrokenSpan(normalized);
  if (broken) return broken;

  const generic = guardGenericReference(normalized);
  if (generic) return generic;

  const timeOnly = guardStandaloneTimePhrase(normalized);
  if (timeOnly) return timeOnly;

  const bare = guardBareCategoryWord(normalized);
  if (bare) {
    if (bare.gate === 'contextualize' && bare.displayName) {
      normalized.name = bare.displayName;
    } else if (bare.gate === 'reject') {
      return bare;
    }
  }

  const cross = guardCrossDomainKnownEntity(normalized, options);
  if (cross) return cross;

  const wrongBook = guardWrongBookPlacement(normalized, options);
  if (wrongBook) return wrongBook;

  if (!options.skipDuplicateCheck) {
    const dupe = guardDuplicateEntity(normalized, options);
    if (dupe) return dupe;
  }

  if (!options.skipSensitiveCheck) {
    const sensitive = guardSensitiveEntity(normalized);
    if (sensitive) return sensitive;
  }

  if (bare?.gate === 'contextualize') {
    return {
      ...bare,
      name: normalized.name,
      displayName: normalized.name,
      provenance: [...bare.provenance, { guard: 'entityQualityGateService', rule: 'contextualized_allow' }],
    };
  }

  return allowVerdict(normalized);
}

/** True when UI/API should surface this candidate as a suggestion card. */
export function passesEntityQualityGate(verdict: EntityQualityVerdict): boolean {
  return verdict.gate === 'allow' || verdict.gate === 'contextualize' || verdict.gate === 'review';
}

export function qualityGateToOperationGate(verdict: EntityQualityVerdict): 'auto' | 'suggest' | 'review' | 'block' {
  switch (verdict.gate) {
    case 'allow':
    case 'contextualize':
      return verdict.requiresReview ? 'review' : 'suggest';
    case 'review':
      return 'review';
    case 'reject':
    default:
      return 'block';
  }
}

export function resolveDisplayName(candidate: EntityQualityCandidate, verdict: EntityQualityVerdict): string {
  return verdict.displayName?.trim() || candidate.name.trim();
}

/** Batch filter for suggestion lists — updates display names and drops rejected candidates. */
export function filterQualityCandidates<T extends { name: string }>(
  domain: EntityQualityCandidate['domain'],
  items: T[],
  options: EvaluateEntityQualityOptions & {
    getEvidence?: (item: T) => string | undefined;
    enrich?: (item: T, verdict: EntityQualityVerdict) => T;
  } = {}
): T[] {
  const { enrich, getEvidence, ...qualityOptions } = options;
  const out: T[] = [];

  for (const item of items) {
    const evidence = getEvidence?.(item) ?? '';
    const verdict = evaluateEntityQuality(
      {
        name: item.name,
        domain,
        contextText: evidence,
        evidence,
        confidence: (item as { confidence?: number }).confidence,
      },
      { skipDuplicateCheck: true, ...qualityOptions }
    );
    if (!passesEntityQualityGate(verdict)) continue;

    const base = {
      ...item,
      name: resolveDisplayName({ name: item.name, domain }, verdict),
    };
    out.push(enrich ? enrich(base, verdict) : base);
  }

  return out;
}

/** Gate a single suggestion candidate before it enters a book panel list. */
export function gateSuggestionCandidate(
  name: string,
  domain: EntityQualityCandidate['domain'],
  contextText: string,
  options: EvaluateEntityQualityOptions = {}
): { name: string; verdict: EntityQualityVerdict } | null {
  const verdict = evaluateEntityQuality(
    { name, domain, contextText, evidence: contextText },
    { skipDuplicateCheck: true, ...options }
  );
  if (!passesEntityQualityGate(verdict)) return null;
  return {
    name: resolveDisplayName({ name, domain }, verdict),
    verdict,
  };
}

let crossBookCache = new Map<string, Awaited<ReturnType<typeof buildCrossBookIndexForUser>>>();

export async function buildEntityQualityContext(
  userId: string,
  known?: { names: string[]; ids?: Map<string, string> }
): Promise<EntityQualityContext> {
  try {
    let crossBook = crossBookCache.get(userId);
    if (!crossBook) {
      crossBook = await buildCrossBookIndexForUser(userId);
      crossBookCache.set(userId, crossBook);
    }
    return {
      userId,
      crossBook,
      knownInBook: known ? new Set(known.names) : undefined,
      knownInBookIds: known?.ids,
    };
  } catch (err) {
    logger.debug({ err, userId }, 'Entity quality context build failed');
    return { userId };
  }
}

/** Test helper — clear cross-book cache between cases. */
export function resetEntityQualityContextCache(): void {
  crossBookCache = new Map();
}

export {
  guardBareCategoryWord,
  guardBrokenSpan,
  guardCrossDomainKnownEntity,
  guardDuplicateEntity,
  guardGenericReference,
  guardSensitiveEntity,
};

export type { EntityQualityCandidate, EntityQualityContext, EntityQualityGate, EntityQualityVerdict };
