/**
 * In-memory user-decision index — one load per rescan/message, then N lookups.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { isRelationalPlaceholder } from '../../../utils/characterNameMatching';
import type { LoreBookDomain } from '../parser/loreBookParserTypes';
import type { AttachCanonRecord } from './suggestionAttachTypes';
import {
  decisionBookKey,
  decisionLookupDomains,
  notSamePairKey,
  type SuggestionDecision,
  type SuggestionDecisionType,
  type UserDecisionConsult,
} from './suggestionDecisionTypes';

export type SuggestionDecisionIndex = {
  byBookKey: Map<string, SuggestionDecision[]>;
  byNormalizedKey: Map<string, SuggestionDecision[]>;
  notSamePairs: Set<string>;
  typeByCanonicalId: Map<string, string>;
  loadCount: number;
};

export function emptySuggestionDecisionIndex(): SuggestionDecisionIndex {
  return {
    byBookKey: new Map(),
    byNormalizedKey: new Map(),
    notSamePairs: new Set(),
    typeByCanonicalId: new Map(),
    loadCount: 0,
  };
}

export function addSuggestionDecision(index: SuggestionDecisionIndex, decision: SuggestionDecision): void {
  const bookKey = decisionBookKey(decision.domain, decision.normalizedKey);
  const bookList = index.byBookKey.get(bookKey) ?? [];
  if (!bookList.some((row) => sameDecision(row, decision))) bookList.push(decision);
  index.byBookKey.set(bookKey, bookList);

  const entityList = index.byNormalizedKey.get(decision.normalizedKey) ?? [];
  if (!entityList.some((row) => sameDecision(row, decision))) entityList.push(decision);
  index.byNormalizedKey.set(decision.normalizedKey, entityList);

  if (decision.type === 'NOT_SAME_ENTITY' && decision.canonicalId && decision.relatedId) {
    index.notSamePairs.add(notSamePairKey(decision.canonicalId, decision.relatedId));
  }
  if (decision.type === 'TYPE_CORRECTED' && decision.canonicalId && decision.canonicalType) {
    index.typeByCanonicalId.set(decision.canonicalId, decision.canonicalType);
  }
}

function sameDecision(a: SuggestionDecision, b: SuggestionDecision): boolean {
  return (
    a.type === b.type &&
    a.domain === b.domain &&
    a.normalizedKey === b.normalizedKey &&
    (a.canonicalId ?? '') === (b.canonicalId ?? '') &&
    (a.relatedId ?? '') === (b.relatedId ?? '')
  );
}

const NAMING_EVIDENCE =
  /\b(?:her|his|their)\s+friend['’]?s?\s+name\s+is\s+[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)+/iu;

const WEAK_IDENTITY_PHRASE =
  /^(?:her|his|their|my|the|a|an)\s+(?:friend|guy|girl|person|dude|coworker|colleague|boss|manager)\b/i;

export function isWeakIdentityRejection(normalizedKey: string, originalName?: string): boolean {
  const label = originalName ?? normalizedKey;
  return isRelationalPlaceholder(label) || WEAK_IDENTITY_PHRASE.test(label);
}

/** In-memory stand-in for per-name `isUserRejectedEntityCard`. */
export function isCharacterRejectedInIndex(
  index: SuggestionDecisionIndex,
  name: string,
  evidence?: string,
): boolean {
  const consulted = consultUserDecision({
    index,
    domain: 'characters',
    name,
    evidence,
  });
  return consulted.action === 'reject';
}

export function rejectionSupersededByEvidence(
  decision: SuggestionDecision,
  evidence: string | undefined,
  candidate: string,
): boolean {
  if (decision.type !== 'REJECTED_CANDIDATE') return false;
  if (decision.evidenceStrength === 'strong') return false;
  if (!isWeakIdentityRejection(decision.normalizedKey, candidate)) return false;
  const text = evidence?.trim() ?? '';
  if (!text) return false;
  return NAMING_EVIDENCE.test(text);
}

export function findDecisions(
  index: SuggestionDecisionIndex,
  domain: LoreBookDomain,
  name: string,
  types?: SuggestionDecisionType[],
): SuggestionDecision[] {
  const key = normalizeNameKey(name);
  if (!key) return [];
  const out: SuggestionDecision[] = [];
  for (const book of decisionLookupDomains(domain)) {
    for (const row of index.byBookKey.get(decisionBookKey(book, key)) ?? []) {
      if (!types || types.includes(row.type)) out.push(row);
    }
  }
  if (types?.includes('MERGED_INTO') || types?.includes('ALIAS_CONFIRMED') || !types) {
    for (const row of index.byNormalizedKey.get(key) ?? []) {
      if (row.scope === 'entity' && (row.type === 'MERGED_INTO' || row.type === 'ALIAS_CONFIRMED')) {
        if (!out.some((existing) => sameDecision(existing, row))) out.push(row);
      }
    }
  }
  return out;
}

export function findBookRejection(
  index: SuggestionDecisionIndex,
  domain: LoreBookDomain,
  name: string,
): SuggestionDecision | undefined {
  return findDecisions(index, domain, name, ['REJECTED_CANDIDATE']).find((row) => row.scope === 'book');
}

export function findEntityMergeOrAlias(
  index: SuggestionDecisionIndex,
  domain: LoreBookDomain,
  name: string,
): SuggestionDecision | undefined {
  const rows = findDecisions(index, domain, name, ['MERGED_INTO', 'ALIAS_CONFIRMED']);
  return rows.find((row) => row.canonicalId) ?? rows[0];
}

export function areNotSameEntities(index: SuggestionDecisionIndex, a?: string, b?: string): boolean {
  if (!a || !b || a === b) return false;
  return index.notSamePairs.has(notSamePairKey(a, b));
}

export function correctedTypeFor(index: SuggestionDecisionIndex, canonicalId?: string): string | undefined {
  if (!canonicalId) return undefined;
  return index.typeByCanonicalId.get(canonicalId);
}

function isFullPersonLabel(name: string): boolean {
  return name.trim().split(/\s+/).length >= 2 && !isRelationalPlaceholder(name);
}

function givenToken(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

export function detectCooccurringDistinctPeople(
  evidence: string | undefined,
  people: AttachCanonRecord[],
): Array<[string, string]> {
  const text = evidence?.trim() ?? '';
  if (!text || people.length < 2) return [];
  const mentioned = people.filter((record) => {
    const labels = [record.name, ...record.aliases].filter(isFullPersonLabel);
    return labels.some((label) => text.includes(label));
  });

  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < mentioned.length; i += 1) {
    for (let j = i + 1; j < mentioned.length; j += 1) {
      const givenA = givenToken(mentioned[i].name);
      const givenB = givenToken(mentioned[j].name);
      if (givenA && givenB && givenA === givenB && mentioned[i].id !== mentioned[j].id) {
        pairs.push([mentioned[i].id, mentioned[j].id]);
      }
    }
  }
  return pairs;
}

export function consultUserDecision(input: {
  index: SuggestionDecisionIndex;
  domain: LoreBookDomain;
  name: string;
  evidence?: string;
  attachTargetId?: string;
}): { action: 'attach' | 'reject' | 'block_merge' | 'none'; consult?: UserDecisionConsult; decision?: SuggestionDecision } {
  const merge = findEntityMergeOrAlias(input.index, input.domain, input.name);
  if (merge?.canonicalId) {
    return {
      action: 'attach',
      decision: merge,
      consult: {
        type: merge.type,
        timestamp: merge.createdAt,
        source: merge.source,
        reason: merge.reason,
        superseded: false,
        suppressionReason: merge.type === 'MERGED_INTO' ? 'previous_merge_attach' : 'alias_confirmed_attach',
      },
    };
  }

  const rejection = findBookRejection(input.index, input.domain, input.name);
  if (rejection) {
    const superseded = rejectionSupersededByEvidence(rejection, input.evidence, input.name);
    if (!superseded) {
      return {
        action: 'reject',
        decision: rejection,
        consult: {
          type: 'REJECTED_CANDIDATE',
          timestamp: rejection.createdAt,
          source: rejection.source,
          reason: rejection.reason,
          superseded: false,
          suppressionReason: 'suppressed_from_rescan',
        },
      };
    }
    return {
      action: 'none',
      decision: rejection,
      consult: {
        type: 'REJECTED_CANDIDATE',
        timestamp: rejection.createdAt,
        source: rejection.source,
        reason: rejection.reason,
        superseded: true,
        suppressionReason: 'new_naming_evidence',
      },
    };
  }

  if (input.attachTargetId && areNotSameEntities(input.index, input.attachTargetId, input.attachTargetId)) {
    return { action: 'none' };
  }

  return { action: 'none' };
}
