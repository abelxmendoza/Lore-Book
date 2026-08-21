/**
 * Affected-pair derivation for relationship foundation.
 * Pair identity is order-independent canonical Character ids.
 * Does not change relationship authority — only which pairs are eligible for work.
 */

import { canonicalFieldsUnchanged } from '../ingestion/dirtyCheck';

export function characterPairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export type RelationshipWriterClass =
  | 'EVENT-DRIVEN DELTA'
  | 'NEEDS SMALL OVERLAP'
  | 'EXPLICIT REBUILD'
  | 'RECOVERY'
  | 'REDUNDANT'
  | 'DEAD';

export type RelationshipEvidenceKind =
  | 'resolved_event'
  | 'entity_fact'
  | 'chat_message'
  | 'journal_entry'
  | 'organization_member';

export type RelationshipEvidenceRef = {
  kind: RelationshipEvidenceKind;
  id: string;
  characterIds: string[];
  at: string;
};

export type RelationshipDeltaReport = {
  worker: 'relationship_foundation';
  userId: string;
  mode: 'delta' | 'recovery' | 'rebuild';
  sourcesScanned: number;
  sourcesChanged: number;
  affectedCharacters: number;
  candidatePairs: number;
  uniquePairs: number;
  pairsLoaded: number;
  pairsRecomputed: number;
  pairsChanged: number;
  pairsUnchanged: number;
  writes: number;
  writesSkipped: number;
  historyRowsWritten: number;
  llmCalls: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
};

export const RELATIONSHIP_CANONICAL_FIELDS = [
  'relationship_type',
  'status',
  'strength',
  'closeness_score',
  'summary',
  'metadata',
] as const;

const VOLATILE_META = new Set([
  'updated_at',
  'last_refreshed_at',
  'last_processed_at',
  'generated_at',
  'repaired_at',
]);

export function uniquePairsFromCharacterIds(characterIds: string[]): string[] {
  const ids = [...new Set(characterIds.filter(Boolean))];
  const pairs: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push(characterPairKey(ids[i], ids[j]));
    }
  }
  return pairs;
}

export function addPairsToDirtySet(dirty: Set<string>, characterIds: string[]): void {
  for (const key of uniquePairsFromCharacterIds(characterIds)) dirty.add(key);
}

export function dirtySetFromEvidence(refs: RelationshipEvidenceRef[]): {
  dirty: Set<string>;
  characterIds: Set<string>;
  newestAt: string | null;
} {
  const dirty = new Set<string>();
  const characterIds = new Set<string>();
  let newestAt: string | null = null;
  for (const ref of refs) {
    for (const id of ref.characterIds) {
      if (id) characterIds.add(id);
    }
    addPairsToDirtySet(dirty, ref.characterIds);
    if (ref.at && (!newestAt || ref.at > newestAt)) newestAt = ref.at;
  }
  return { dirty, characterIds, newestAt };
}

/** Merge evidence ids without double-counting an already-seen source. */
export function mergeUniqueIds(previous: string[] | undefined, incoming: string[]): {
  next: string[];
  added: string[];
} {
  const seen = new Set(previous ?? []);
  const added: string[] = [];
  for (const id of incoming) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    added.push(id);
  }
  return { next: Array.from(seen), added };
}

export function parsePairKey(pairKey: string): [string, string] | null {
  const [a, b] = pairKey.split('::');
  if (!a || !b || a === b) return null;
  return a < b ? [a, b] : [b, a];
}

export function remapPairAfterMerge(pairKey: string, absorbedId: string, survivorId: string): string | null {
  const parsed = parsePairKey(pairKey);
  if (!parsed) return null;
  const mapped = parsed.map((id) => (id === absorbedId ? survivorId : id));
  if (mapped[0] === mapped[1]) return null;
  return characterPairKey(mapped[0], mapped[1]);
}

export function relationshipCanonicalUnchanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  const stripMeta = (meta: unknown) => {
    if (!meta || typeof meta !== 'object') return meta;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (VOLATILE_META.has(k)) continue;
      if (k === 'fact_ids' || k === 'source_memory_ids' || k === 'event_ids' || k === 'sources') {
        next[k] = Array.isArray(v) ? [...v].map(String).sort() : v;
        continue;
      }
      next[k] = v;
    }
    return next;
  };
  return canonicalFieldsUnchanged(
    { ...before, metadata: stripMeta(before.metadata) },
    { ...after, metadata: stripMeta(after.metadata) },
    [...RELATIONSHIP_CANONICAL_FIELDS],
  );
}

export function emptyRelationshipDeltaReport(
  userId: string,
  mode: RelationshipDeltaReport['mode'],
  cursorBefore: string | null = null,
): RelationshipDeltaReport {
  return {
    worker: 'relationship_foundation',
    userId,
    mode,
    sourcesScanned: 0,
    sourcesChanged: 0,
    affectedCharacters: 0,
    candidatePairs: 0,
    uniquePairs: 0,
    pairsLoaded: 0,
    pairsRecomputed: 0,
    pairsChanged: 0,
    pairsUnchanged: 0,
    writes: 0,
    writesSkipped: 0,
    historyRowsWritten: 0,
    llmCalls: 0,
    cursorBefore,
    cursorAfter: cursorBefore,
  };
}

export const RELATIONSHIP_WRITER_MAP: Array<{
  id: string;
  trigger: string;
  frequency: string;
  inputQuery: string;
  classification: RelationshipWriterClass;
  llmCalls: string;
  notes: string;
}> = [
  {
    id: 'relationship_foundation.recoverRelationshipGraph',
    trigger: 'graphRecoveryTrigger live + diagnostics/scripts',
    frequency: 'debounced 15s / 30m cooldown live; on-demand otherwise',
    inputQuery: 'was all memories + all facts + 500 chat + all org members + all relationship rows',
    classification: 'EVENT-DRIVEN DELTA',
    llmCalls: '0',
    notes: 'Primary ~57 no-op UPDATE offender. Writes character_relationships only.',
  },
  {
    id: 'character_relationship_history.applyCharacterRelationshipWrite',
    trigger: 'user/API relationship edits',
    frequency: 'on explicit write',
    inputQuery: 'pair history + compatibility cache',
    classification: 'EVENT-DRIVEN DELTA',
    llmCalls: '0',
    notes: 'Authority path. History is append-only with idempotency_key.',
  },
  {
    id: 'characterMergeService.mergeRelationships',
    trigger: 'character merge',
    frequency: 'on merge',
    inputQuery: 'edges incident to absorbed id',
    classification: 'EVENT-DRIVEN DELTA',
    llmCalls: '0',
    notes: 'Reassigns to survivor; drops self-loops. Do not change identity semantics.',
  },
  {
    id: 'writeRelationship / ontology persistence',
    trigger: 'ingestion ER write dispatcher',
    frequency: 'per extracted relationship',
    inputQuery: 'resolved entity pair',
    classification: 'EVENT-DRIVEN DELTA',
    llmCalls: '0 on write (extraction is upstream)',
    notes: 'Stage-gated. Not the graph recovery scan.',
  },
  {
    id: 'familyGraphInference.assertProtagonistKinship',
    trigger: 'kinship inference after ingest',
    frequency: 'per qualifying mention',
    inputQuery: 'protagonist + kin character',
    classification: 'EVENT-DRIVEN DELTA',
    llmCalls: '0',
    notes: 'Typed kinship edge writer.',
  },
  {
    id: 'relationship_foundation.repairMisclassifiedRelationships',
    trigger: 'end of recoverRelationshipGraph',
    frequency: 'with recovery/rebuild; dirty pairs only on delta',
    inputQuery: 'romantic rows lacking fact_ids',
    classification: 'NEEDS SMALL OVERLAP',
    llmCalls: '0',
    notes: 'Deterministic family-name repair. Not a truth-model change.',
  },
  {
    id: 'generateRelationships.ts / diagnostics recover-relationships',
    trigger: 'operator script / diagnostics POST',
    frequency: 'manual',
    inputQuery: 'full foundation recovery',
    classification: 'RECOVERY',
    llmCalls: '0',
    notes: 'Explicit historical reconstruction.',
  },
];
