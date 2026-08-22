/**
 * Deterministic suggestion-quality eval.
 *
 * Drives {@link decideSuggestionCandidate} against an in-memory canon +
 * decision index. No database writes, no LLM calls.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { decideSuggestionCandidate, type SuggestionWriteResult } from '../suggestions/applySuggestionCandidate';
import { isAttachPlan, mergeAliasList } from '../suggestions/suggestionAttachEligibility';
import {
  addSuggestionDecision,
  emptySuggestionDecisionIndex,
  type SuggestionDecisionIndex,
} from '../suggestions/suggestionDecisionIndex';
import type { SuggestionDecision } from '../suggestions/suggestionDecisionTypes';
import { notSamePairKey } from '../suggestions/suggestionDecisionTypes';
import type { AttachCanonIndex, AttachCanonRecord } from '../suggestions/suggestionAttachTypes';
import type { LoreBookDomain } from '../parser/loreBookParserTypes';
import {
  resetSuggestionWriteContextForTests,
  suggestionWriteLoadCount,
  withSuggestionWriteContext,
} from '../suggestions/suggestionWriteContext';
import { SUGGESTION_QUALITY_BASELINE } from './suggestionEvalBaseline';
import {
  allEvalCandidates,
  candidatesByIds,
  CORRECTION_DOCUMENT_IDS,
  CROSS_BOOK_IDS,
  DISMISS_CANDIDATE_IDS,
  documentsByIds,
  EVAL_DOCUMENTS,
  EVAL_USER_ID,
  EXPECTED_CANON,
  expectedCanonById,
  expectedStableEntities,
  expectedUnresolvedEntities,
  INGEST_DOCUMENT_IDS,
  MERGE_CANDIDATE_IDS,
  NOT_SAME_CANDIDATE_IDS,
  TYPE_QUALITY_IDS,
  CHARACTER_PROMOTION_IDS,
  type EvalCandidate,
} from './suggestionEvalCorpus';
import {
  emptyCleanupCounts,
  emptyOutcomeCounts,
  emptyWriteAmplification,
  EVAL_BOOKS,
  rate,
  type BookScorecardRow,
  type CandidateOutcome,
  type CleanupBurden,
  type CleanupCounts,
  type CleanupOutcome,
  type EvalBook,
  type OutcomeCounts,
  type PerformanceCounters,
  type PrecisionRecall,
  type WriteAmplification,
} from './suggestionQualityMetrics';

export type EvalTraceRow = {
  phase: string;
  candidateId: string;
  name: string;
  book: LoreBookDomain;
  outcome: CandidateOutcome;
  gateOutcome: SuggestionWriteResult['outcome'];
  reason: string;
  expected: CandidateOutcome;
  matchedExpectation: boolean;
  cleanup: CleanupOutcome[];
  writes: WriteAmplification;
  canonicalId?: string;
  canonicalName?: string;
};

export type PhaseSnapshot = {
  id: string;
  title: string;
  candidates: number;
  outcomes: OutcomeCounts;
  cleanup: CleanupCounts;
  writes: WriteAmplification;
  performance: PerformanceCounters;
  traces: EvalTraceRow[];
};

export type RemainingCleanupSource = {
  rank: number;
  source: string;
  count: number;
  examples: string[];
};

export type SuggestionQualityReport = {
  runId: string;
  generatedAt: string;
  harness: 'suggestion-quality-eval';
  llmCalls: 0;
  baseline: typeof SUGGESTION_QUALITY_BASELINE;
  corpus: {
    documents: number;
    candidates: number;
    expectedStableEntities: number;
    expectedUnresolved: number;
  };
  phases: Record<string, PhaseSnapshot>;
  cleanupBurden: CleanupBurden;
  precisionRecall: PrecisionRecall;
  bookScorecard: BookScorecardRow[];
  writeAmplification: {
    firstPass: WriteAmplification;
    secondPass: WriteAmplification;
  };
  performance: {
    firstPass: PerformanceCounters;
    secondPass: PerformanceCounters;
    nPlusOneReintroduced: boolean;
  };
  successTargets: {
    duplicateCanonicalCardsOnIdenticalRerun: number;
    dismissedEquivalentResurrection: number;
    repeatedMergeSuggestionsAfterConfirmedMerge: number;
    notSamePairReSuggested: number;
    machineCreateDuringFullDegraded: number;
    secondPassSemanticWrites: number;
  };
  remainingCleanupSources: RemainingCleanupSource[];
  canonAfterIngest: Array<{ id: string; name: string; domain: LoreBookDomain; aliases: string[]; type?: string }>;
};

type EvalWorld = {
  userId: string;
  index: AttachCanonIndex;
  decisions: SuggestionDecisionIndex;
  conceptToId: Map<string, string>;
  seq: number;
};

function emptyIndex(): AttachCanonIndex {
  return {
    characters: [],
    locations: [],
    skills: [],
    projects: [],
    quests: [],
    organizations: [],
    groups: [],
  };
}

function createWorld(): EvalWorld {
  return {
    userId: EVAL_USER_ID,
    index: emptyIndex(),
    decisions: emptySuggestionDecisionIndex(),
    conceptToId: new Map(),
    seq: 1,
  };
}

function addWrite(target: WriteAmplification, delta: Partial<WriteAmplification>): void {
  target.aliasesWritten += delta.aliasesWritten ?? 0;
  target.evidenceUpdates += delta.evidenceUpdates ?? 0;
  target.suggestionUpdates += delta.suggestionUpdates ?? 0;
  target.canonicalUpdates += delta.canonicalUpdates ?? 0;
  target.semanticWrites += delta.semanticWrites ?? 0;
}

function classifyOutcome(result: SuggestionWriteResult, candidate: EvalCandidate): CandidateOutcome {
  const suppression = result.userDecision?.suppressionReason ?? '';
  if (result.outcome === 'DEGRADED') return 'DEGRADED';
  if (suppression === 'suppressed_from_rescan' || result.reason === 'suppressed_from_rescan') {
    return 'SUPPRESSED_PREVIOUS_REJECT';
  }
  if (
    suppression === 'duplicate_recommendation_suppressed' ||
    result.reason === 'not_same_entity'
  ) {
    return 'SUPPRESSED_NOT_SAME';
  }
  if (suppression === 'previous_merge_attach' || suppression === 'alias_confirmed_attach') {
    return 'MERGE_MEMORY_ATTACH';
  }
  if (
    result.reason === 'book_isolation' ||
    result.reason.startsWith('route_to_') ||
    result.reason.includes('software_tool') ||
    result.reason.includes('canonical_type_conflict')
  ) {
    if (result.outcome === 'REJECTED') return 'WRONG_BOOK_ROUTED';
  }

  const unresolvedReason =
    result.matchBasis === 'relational_reference' ||
    result.reason.includes('unresolved') ||
    result.reason.includes('relational') ||
    result.reason.includes('generic_reference') ||
    candidate.unresolved === true;

  if (unresolvedReason && (result.outcome === 'REJECTED' || result.outcome === 'REVIEW')) {
    return 'UNRESOLVED_ACTOR';
  }

  if (result.outcome === 'ATTACHED') return 'ATTACHED_EXISTING';
  if (result.outcome === 'CREATED') return 'CREATED_NEW';
  if (result.outcome === 'REVIEW') return 'REVIEWED';
  return 'REJECTED';
}

function scoreCleanup(
  outcome: CandidateOutcome,
  result: SuggestionWriteResult,
  candidate: EvalCandidate,
  expected: CandidateOutcome,
  alreadyBeforeWrite?: AttachCanonRecord,
): CleanupOutcome[] {
  const cleanup: CleanupOutcome[] = [];
  const expectedEntity = candidate.expectedCanonId ? expectedCanonById(candidate.expectedCanonId) : undefined;

  if (outcome === 'CREATED_NEW') {
    if (alreadyBeforeWrite) {
      cleanup.push('DUPLICATE_CARD_CREATED', 'MANUAL_MERGE_REQUIRED');
    }
    if (candidate.unresolved || expected === 'UNRESOLVED_ACTOR' || expected === 'REJECTED') {
      cleanup.push('MANUAL_DELETE_REQUIRED', 'FALSE_POSITIVE_SUGGESTION');
    }
    if (expectedEntity && expectedEntity.book !== candidate.domain && result.outcome === 'CREATED') {
      cleanup.push('MANUAL_TYPE_EDIT_REQUIRED');
    }
    if (expectedEntity && normalizeNameKey(expectedEntity.canonicalName) !== normalizeNameKey(candidate.name)) {
      const aliasHit = expectedEntity.aliases.some((alias) => normalizeNameKey(alias) === normalizeNameKey(candidate.name));
      if (aliasHit) cleanup.push('MANUAL_MERGE_REQUIRED');
    }
  }

  if (outcome === 'REVIEWED' && (expected === 'REJECTED' || expected === 'UNRESOLVED_ACTOR')) {
    cleanup.push('FALSE_POSITIVE_SUGGESTION');
  }

  if (
    result.outcome === 'ATTACHED' &&
    expectedEntity &&
    result.canonical?.name &&
    normalizeNameKey(result.canonical.name) !== normalizeNameKey(expectedEntity.canonicalName) &&
    !expectedEntity.aliases.some((alias) => normalizeNameKey(alias) === normalizeNameKey(result.canonical?.name ?? ''))
  ) {
    cleanup.push('MANUAL_MERGE_REQUIRED');
  }

  if (candidate.expectedType && result.attach?.typeConflict && !result.attach.canonicalTypePreserved) {
    cleanup.push('MANUAL_TYPE_EDIT_REQUIRED');
  }

  if (outcome === 'CREATED_NEW' && expected === 'ATTACHED_EXISTING') {
    if (!cleanup.includes('DUPLICATE_CARD_CREATED')) cleanup.push('DUPLICATE_CARD_CREATED');
    if (!cleanup.includes('MANUAL_MERGE_REQUIRED')) cleanup.push('MANUAL_MERGE_REQUIRED');
  }

  return [...new Set(cleanup)];
}

function findExisting(index: AttachCanonIndex, domain: LoreBookDomain, name: string): AttachCanonRecord | undefined {
  const key = normalizeNameKey(name);
  const pools: AttachCanonRecord[] = [];
  if (domain === 'organizations' || domain === 'groups' || domain === 'schools') {
    pools.push(...(index.organizations ?? []), ...(index.groups ?? []), ...(index.schools ?? []));
  } else {
    pools.push(...(index[domain] ?? []));
  }
  return pools.find(
    (row) => normalizeNameKey(row.name) === key || row.aliases.some((alias) => normalizeNameKey(alias) === key),
  );
}

function applyResultToWorld(
  world: EvalWorld,
  candidate: EvalCandidate,
  result: SuggestionWriteResult,
): WriteAmplification {
  const writes = emptyWriteAmplification();
  if (result.outcome === 'ATTACHED' && isAttachPlan(result.attach)) {
    const plan = result.attach;
    const target = findCanonRecord(world.index, plan.target.id) ?? plan.target;
    const aliasDelta = plan.aliasAdded ? 1 : 0;
    const evidenceDelta = plan.evidenceAttached ? 1 : 0;
    target.aliases = plan.nextAliases;
    target.evidence = plan.nextEvidence;
    target.mentionCount = plan.nextMentionCount;
    writes.aliasesWritten = aliasDelta;
    writes.evidenceUpdates = evidenceDelta;
    writes.semanticWrites = aliasDelta + evidenceDelta;
  }

  if (result.outcome === 'CREATED') {
    const record: AttachCanonRecord = {
      id: `eval-${candidate.domain}-${world.seq++}`,
      name: candidate.name,
      aliases: [],
      domain: candidate.domain,
      canonicalType: candidate.incomingType ?? candidate.expectedType,
      userId: world.userId,
      mentionCount: 1,
      evidence: candidate.evidence
        ? [{ quote: candidate.evidence, sourceMessageId: candidate.id }]
        : [],
    };
    const bucket = (world.index[candidate.domain] ??= []);
    bucket.push(record);
    if (candidate.expectedCanonId && !world.conceptToId.has(candidate.expectedCanonId)) {
      world.conceptToId.set(candidate.expectedCanonId, record.id);
    }
    writes.canonicalUpdates = 1;
    writes.semanticWrites = 1;
  }

  if (result.outcome === 'REVIEW') {
    writes.suggestionUpdates = 1;
  }

  return writes;
}

function findCanonRecord(index: AttachCanonIndex, id?: string): AttachCanonRecord | undefined {
  if (!id) return undefined;
  for (const rows of Object.values(index)) {
    const hit = rows?.find((row) => row.id === id);
    if (hit) return hit;
  }
  return undefined;
}

function emptyPhase(id: string, title: string): PhaseSnapshot {
  return {
    id,
    title,
    candidates: 0,
    outcomes: emptyOutcomeCounts(),
    cleanup: emptyCleanupCounts(),
    writes: emptyWriteAmplification(),
    performance: {
      canonIndexLoads: 0,
      decisionIndexLoads: 0,
      perCandidateDbQueries: 0,
      llmCalls: 0,
      durationMs: 0,
      candidateCount: 0,
    },
    traces: [],
  };
}

async function runCandidates(
  world: EvalWorld,
  phaseId: string,
  title: string,
  candidates: EvalCandidate[],
  expectedField: 'expectedFirstPass' | 'expectedSecondPass',
  options: { degraded?: boolean } = {},
): Promise<PhaseSnapshot> {
  const phase = emptyPhase(phaseId, title);
  const started = Date.now();
  const loadsBefore = suggestionWriteLoadCount();

  await withSuggestionWriteContext(
    world.userId,
    async (ctx) => {
      world.index = ctx.index;
      world.decisions = ctx.decisions;
      for (const candidate of candidates) {
        const result = await decideSuggestionCandidate({
          userId: world.userId,
          domain: candidate.domain,
          name: candidate.name,
          evidence: candidate.evidence,
          incomingType: candidate.incomingType,
          extractor: `eval:${phaseId}`,
          source: candidate.id,
          sourceMessageId: candidate.id,
          writePolicy: candidate.writePolicy ?? 'inference',
          applyDomains: candidate.applyDomains,
          context: ctx,
        });
        const alreadyBeforeWrite = findExisting(world.index, candidate.domain, candidate.name);
        const writes = options.degraded ? emptyWriteAmplification() : applyResultToWorld(world, candidate, result);
        const expected = candidate[expectedField];
        const outcome = classifyOutcome(result, candidate);
        const cleanup = options.degraded ? [] : scoreCleanup(outcome, result, candidate, expected, alreadyBeforeWrite);

        const trace: EvalTraceRow = {
          phase: phaseId,
          candidateId: candidate.id,
          name: candidate.name,
          book: candidate.domain,
          outcome,
          gateOutcome: result.outcome,
          reason: result.reason,
          expected,
          matchedExpectation: outcome === expected,
          cleanup,
          writes,
          canonicalId: result.canonical?.id,
          canonicalName: result.canonical?.name,
        };
        phase.traces.push(trace);
        phase.candidates += 1;
        phase.outcomes[outcome] += 1;
        for (const item of cleanup) phase.cleanup[item] += 1;
        addWrite(phase.writes, writes);
      }
    },
    {
      index: world.index,
      status: options.degraded ? 'degraded' : 'ok',
      decisions: world.decisions,
      loadCount: 1,
    },
  );

  const loads = suggestionWriteLoadCount() - loadsBefore;
  phase.performance = {
    canonIndexLoads: loads,
    decisionIndexLoads: loads,
    perCandidateDbQueries: 0,
    llmCalls: 0,
    durationMs: Date.now() - started,
    candidateCount: phase.candidates,
  };
  return phase;
}

function recordDismiss(world: EvalWorld, name: string, domain: LoreBookDomain): void {
  addSuggestionDecision(world.decisions, {
    type: 'REJECTED_CANDIDATE',
    domain,
    normalizedKey: normalizeNameKey(name),
    scope: 'book',
    source: 'USER',
    createdAt: new Date().toISOString(),
    evidenceStrength: 'strong',
    reason: 'eval_user_dismiss',
  } satisfies SuggestionDecision);
}

function recordMerge(world: EvalWorld, alias: string, canonicalId: string, canonicalName: string, domain: LoreBookDomain): void {
  addSuggestionDecision(world.decisions, {
    type: 'MERGED_INTO',
    domain,
    normalizedKey: normalizeNameKey(alias),
    canonicalId,
    canonicalName,
    scope: 'entity',
    source: 'USER',
    createdAt: new Date().toISOString(),
    evidenceStrength: 'strong',
    reason: 'eval_user_merge',
  });
  const target = findCanonRecord(world.index, canonicalId);
  if (target) {
    const merged = mergeAliasList(target.name, target.aliases, alias);
    target.aliases = merged.aliases;
  }
}

function recordNotSame(world: EvalWorld, leftId: string, rightId: string): void {
  addSuggestionDecision(world.decisions, {
    type: 'NOT_SAME_ENTITY',
    domain: 'characters',
    normalizedKey: notSamePairKey(leftId, rightId),
    canonicalId: leftId,
    relatedId: rightId,
    scope: 'entity',
    source: 'USER',
    createdAt: new Date().toISOString(),
    evidenceStrength: 'strong',
    reason: 'eval_user_not_same',
  });
  world.decisions.notSamePairs.add(notSamePairKey(leftId, rightId));
  const left = findCanonRecord(world.index, leftId);
  const right = findCanonRecord(world.index, rightId);
  if (left) left.distinctFrom = [...new Set([...(left.distinctFrom ?? []), rightId])];
  if (right) right.distinctFrom = [...new Set([...(right.distinctFrom ?? []), leftId])];
}

function recordTypeCorrection(world: EvalWorld, canonicalId: string, canonicalType: string): void {
  addSuggestionDecision(world.decisions, {
    type: 'TYPE_CORRECTED',
    domain: 'organizations',
    normalizedKey: canonicalId,
    canonicalId,
    canonicalType,
    scope: 'entity',
    source: 'USER',
    createdAt: new Date().toISOString(),
    evidenceStrength: 'strong',
    reason: 'eval_type_corrected',
  });
}

function ingestCandidates(): EvalCandidate[] {
  return documentsByIds(INGEST_DOCUMENT_IDS).flatMap((doc) => doc.candidates);
}

function sumCleanup(phases: PhaseSnapshot[]): CleanupCounts {
  const totals = emptyCleanupCounts();
  for (const phase of phases) {
    for (const key of Object.keys(totals) as CleanupOutcome[]) {
      totals[key] += phase.cleanup[key];
    }
  }
  return totals;
}

function burdenFrom(cleanup: CleanupCounts, extra: { resurrected: number; repeatedMerges: number }, candidates: number): CleanupBurden {
  const manualMerges = cleanup.MANUAL_MERGE_REQUIRED;
  const manualDeletes = cleanup.MANUAL_DELETE_REQUIRED;
  const manualTypeEdits = cleanup.MANUAL_TYPE_EDIT_REQUIRED;
  const manualRenames = cleanup.MANUAL_RENAME_REQUIRED;
  const total =
    manualMerges +
    manualDeletes +
    manualTypeEdits +
    manualRenames +
    extra.resurrected +
    extra.repeatedMerges;
  return {
    manualMerges,
    manualDeletes,
    manualTypeEdits,
    manualRenames,
    resurrectedDismissals: extra.resurrected,
    repeatedMergeSuggestions: extra.repeatedMerges,
    total,
    per100Candidates: rate(total * 100, candidates),
  };
}

function bookScorecard(traces: EvalTraceRow[]): BookScorecardRow[] {
  return EVAL_BOOKS.map((book) => {
    const rows = traces.filter((row) => scorecardBook(row.book) === book);
    return {
      book,
      candidates: rows.length,
      created: rows.filter((row) => row.outcome === 'CREATED_NEW').length,
      attached: rows.filter((row) => row.outcome === 'ATTACHED_EXISTING' || row.outcome === 'MERGE_MEMORY_ATTACH').length,
      reviewed: rows.filter((row) => row.outcome === 'REVIEWED').length,
      rejected: rows.filter((row) => row.outcome === 'REJECTED' || row.outcome === 'SUPPRESSED_PREVIOUS_REJECT').length,
      unresolved: rows.filter((row) => row.outcome === 'UNRESOLVED_ACTOR').length,
      duplicates: rows.filter((row) => row.cleanup.includes('DUPLICATE_CARD_CREATED')).length,
      wrongType: rows.filter((row) => row.cleanup.includes('MANUAL_TYPE_EDIT_REQUIRED')).length,
      cleanupBurden: rows.reduce((sum, row) => sum + row.cleanup.length, 0),
    };
  });
}

function scorecardBook(domain: LoreBookDomain): EvalBook {
  if (domain === 'groups' || domain === 'schools' || domain === 'work') return domain === 'groups' ? 'groups' : 'organizations';
  if (EVAL_BOOKS.includes(domain as EvalBook)) return domain as EvalBook;
  return 'organizations';
}

function precisionRecall(world: EvalWorld, first: PhaseSnapshot, second: PhaseSnapshot): PrecisionRecall {
  const created = first.traces.filter((row) => row.outcome === 'CREATED_NEW');
  const correctCreated = created.filter((row) => {
    const entity = expectedCanonById(
      allEvalCandidates().find((candidate) => candidate.id === row.candidateId)?.expectedCanonId ?? '',
    );
    return Boolean(entity && !entity.unresolved && normalizeNameKey(entity.canonicalName) === normalizeNameKey(row.name));
  });

  const duplicateOpportunities = second.traces.filter((row) =>
    first.traces.some(
      (prior) =>
        prior.candidateId === row.candidateId &&
        (prior.outcome === 'CREATED_NEW' || prior.outcome === 'ATTACHED_EXISTING'),
    ),
  );
  const prevented = duplicateOpportunities.filter((row) => row.outcome !== 'CREATED_NEW').length;

  const attaches = [...first.traces, ...second.traces].filter(
    (row) => row.outcome === 'ATTACHED_EXISTING' || row.outcome === 'MERGE_MEMORY_ATTACH',
  );
  const correctAttaches = attaches.filter((row) => {
    const candidate = allEvalCandidates().find((item) => item.id === row.candidateId);
    const entity = candidate?.expectedCanonId ? expectedCanonById(candidate.expectedCanonId) : undefined;
    if (!entity || !row.canonicalName) return false;
    return (
      normalizeNameKey(row.canonicalName) === normalizeNameKey(entity.canonicalName) ||
      entity.aliases.some((alias) => normalizeNameKey(alias) === normalizeNameKey(row.canonicalName ?? ''))
    );
  });
  const wrongAttachCount = attaches.length - correctAttaches.length;

  const suppressed = [...first.traces, ...second.traces].filter(
    (row) =>
      row.outcome === 'SUPPRESSED_PREVIOUS_REJECT' ||
      row.outcome === 'SUPPRESSED_NOT_SAME' ||
      row.outcome === 'UNRESOLVED_ACTOR' ||
      row.outcome === 'REJECTED',
  );
  const correctSuppressed = suppressed.filter((row) => row.matchedExpectation).length;

  const stable = expectedStableEntities();
  const resolved = stable.filter((entity) => {
    if (world.conceptToId.has(entity.conceptId)) return true;
    return Boolean(findExisting(world.index, entity.book, entity.canonicalName));
  });

  const expectedUnresolved = expectedUnresolvedEntities();
  const unresolvedHits = expectedUnresolved.filter((entity) => {
    const createdCard = findExisting(world.index, 'characters', entity.canonicalName);
    return !createdCard;
  });

  const missedAttachCount = second.traces.filter(
    (row) => row.expected === 'ATTACHED_EXISTING' && row.outcome !== 'ATTACHED_EXISTING' && row.outcome !== 'MERGE_MEMORY_ATTACH',
  ).length;

  return {
    entityCreationPrecision: rate(correctCreated.length, created.length),
    duplicatePreventionRate: rate(prevented, duplicateOpportunities.length),
    attachPrecision: rate(correctAttaches.length, attaches.length),
    suppressionPrecision: rate(correctSuppressed, suppressed.length),
    stableEntityRecall: rate(resolved.length, stable.length),
    unresolvedPrecision: rate(unresolvedHits.length, expectedUnresolved.length),
    wrongAttachCount,
    missedAttachCount,
  };
}

function rankRemaining(traces: EvalTraceRow[]): RemainingCleanupSource[] {
  const buckets = new Map<string, { count: number; examples: string[] }>();
  const bump = (source: string, example: string) => {
    const current = buckets.get(source) ?? { count: 0, examples: [] };
    current.count += 1;
    if (current.examples.length < 4) current.examples.push(example);
    buckets.set(source, current);
  };

  for (const row of traces) {
    if (row.cleanup.includes('DUPLICATE_CARD_CREATED')) {
      bump(`${scorecardBook(row.book)} duplicate card`, `${row.name} (${row.candidateId})`);
    }
    if (row.cleanup.includes('MANUAL_TYPE_EDIT_REQUIRED')) {
      bump(`${scorecardBook(row.book)} wrong type`, `${row.name} (${row.reason})`);
    }
    if (row.outcome === 'REVIEWED' && row.reason.toLowerCase().includes('first_name')) {
      bump('Character first-name ambiguity', `${row.name}`);
    }
    if (row.outcome === 'REVIEWED' && /similar to/i.test(row.reason)) {
      bump('Character fuzzy-similar blocks distinct full names', `${row.name} (${row.reason})`);
    }
    if (row.expected === 'CREATED_NEW' && (row.outcome === 'REJECTED' || row.outcome === 'REVIEWED')) {
      bump('Missed stable entity (rejected or reviewed instead of create)', `${row.name} (${row.reason})`);
    }
    if (row.cleanup.includes('FALSE_POSITIVE_SUGGESTION')) {
      bump(`${scorecardBook(row.book)} false-positive suggestion`, `${row.name}`);
    }
    if (!row.matchedExpectation && row.outcome === 'CREATED_NEW' && row.expected === 'ATTACHED_EXISTING') {
      bump(`${scorecardBook(row.book)} missed attach / created instead`, `${row.name}`);
    }
    if (row.book === 'projects' && row.outcome === 'CREATED_NEW' && /python|skill/i.test(row.name)) {
      bump('Skill vs project alias ambiguity', row.name);
    }
    if (row.book === 'groups' && row.outcome === 'CREATED_NEW' && row.expected !== 'CREATED_NEW') {
      bump('Organization / group hierarchy confusion', row.name);
    }
    if (row.expected === 'ATTACHED_EXISTING' && row.outcome === 'REVIEWED') {
      bump('Short alias containment held for review instead of attach', `${row.name} (${row.reason})`);
    }
    if (row.reason.includes('canonical_type_place') && row.book === 'characters') {
      bump('Character surname classified as place', `${row.name}`);
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([source, value], index) => ({
      rank: index + 1,
      source,
      count: value.count,
      examples: value.examples,
    }));
}

export async function runSuggestionQualityEval(): Promise<SuggestionQualityReport> {
  resetSuggestionWriteContextForTests();
  const world = createWorld();
  const ingest = ingestCandidates();

  const firstPass = await runCandidates(world, 'first_pass', 'First-pass ingest', ingest, 'expectedFirstPass');
  const secondPass = await runCandidates(world, 'second_pass', 'Identical rescan', ingest, 'expectedSecondPass');

  recordDismiss(world, 'Failure Analysis', 'groups');
  const dismissPhase = await runCandidates(
    world,
    'dismissal_learning',
    'Dismiss Failure Analysis as Group, then rescan',
    candidatesByIds([...DISMISS_CANDIDATE_IDS, 'failure-analysis-skill']),
    'expectedSecondPass',
  );

  const nwuId =
    world.conceptToId.get('northwind-university') ??
    findExisting(world.index, 'organizations', 'Northwind Western University')?.id ??
    '';
  if (nwuId) {
    recordMerge(world, 'USC', nwuId, 'Northwind Western University', 'organizations');
    recordTypeCorrection(world, nwuId, 'university');
  }
  const mergeCandidates: EvalCandidate[] = [
    {
      id: 'usc-after-merge',
      name: 'USC',
      domain: 'organizations',
      evidence: 'I graduated from USC last spring',
      incomingType: 'university',
      expectedCanonId: 'northwind-university',
      expectedFirstPass: 'MERGE_MEMORY_ATTACH',
      expectedSecondPass: 'MERGE_MEMORY_ATTACH',
      expectedType: 'university',
    },
    ...candidatesByIds(MERGE_CANDIDATE_IDS),
  ];
  const mergePhase = await runCandidates(
    world,
    'merge_learning',
    'Merge USC into Northwind University, then rescan acronyms',
    mergeCandidates,
    'expectedSecondPass',
  );
  const mergeRepeat = await runCandidates(
    world,
    'merge_repeat',
    'Repeat USC after confirmed merge',
    [mergeCandidates[0]],
    'expectedSecondPass',
  );

  const mayaChenId = world.conceptToId.get('maya-chen') ?? findExisting(world.index, 'characters', 'Maya Chen')?.id;
  const mayaLopezId = world.conceptToId.get('maya-lopez') ?? findExisting(world.index, 'characters', 'Maya Lopez')?.id;
  if (mayaChenId && mayaLopezId) recordNotSame(world, mayaChenId, mayaLopezId);
  const notSamePhase = await runCandidates(
    world,
    'not_same',
    'Maya Chen ≠ Maya Lopez',
    candidatesByIds(NOT_SAME_CANDIDATE_IDS),
    'expectedSecondPass',
  );

  const typePhase = await runCandidates(
    world,
    'type_quality',
    'School vs company, software vs company, skill vs project',
    candidatesByIds(TYPE_QUALITY_IDS),
    'expectedSecondPass',
  );

  const promotionPhase = await runCandidates(
    world,
    'character_promotion',
    'Weak vs stable character promotion',
    candidatesByIds(CHARACTER_PROMOTION_IDS),
    'expectedSecondPass',
  );

  const resumePhase = await runCandidates(
    world,
    'resume_import',
    'Synthetic resume import',
    documentsByIds(['resume']).flatMap((doc) => doc.candidates),
    'expectedSecondPass',
  );

  const crossBookPhase = await runCandidates(
    world,
    'cross_book',
    'Cross-book routing',
    candidatesByIds(CROSS_BOOK_IDS),
    'expectedSecondPass',
  );

  const correctionPhase = await runCandidates(
    world,
    'corrections',
    'Correction persistence',
    documentsByIds(CORRECTION_DOCUMENT_IDS).flatMap((doc) => doc.candidates),
    'expectedSecondPass',
  );

  const degradedWorld = createWorld();
  const degradedPhase = await runCandidates(
    degradedWorld,
    'degraded',
    'Full canonical/decision index failure',
    ingest.filter((row) => (row.writePolicy ?? 'inference') !== 'user'),
    'expectedFirstPass',
    { degraded: true },
  );

  const resurrected =
    dismissPhase.traces.filter(
      (row) =>
        DISMISS_CANDIDATE_IDS.includes(row.candidateId) &&
        (row.outcome === 'CREATED_NEW' || row.outcome === 'REVIEWED'),
    ).length;
  const repeatedMerges = mergeRepeat.traces.filter(
    (row) => row.outcome === 'REVIEWED' || row.outcome === 'CREATED_NEW',
  ).length;
  const notSameResuggested = notSamePhase.traces.filter(
    (row) => row.outcome === 'CREATED_NEW' || (row.outcome === 'REVIEWED' && row.reason.includes('fuzzy')),
  ).length;

  const allPhaseList = [
    firstPass,
    secondPass,
    dismissPhase,
    mergePhase,
    mergeRepeat,
    notSamePhase,
    typePhase,
    promotionPhase,
    resumePhase,
    crossBookPhase,
    correctionPhase,
    degradedPhase,
  ];
  const ingestCleanup = sumCleanup([firstPass, secondPass]);
  const cleanupBurden = burdenFrom(ingestCleanup, { resurrected, repeatedMerges }, firstPass.candidates + secondPass.candidates);

  const report: SuggestionQualityReport = {
    runId: `suggestion-quality-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    harness: 'suggestion-quality-eval',
    llmCalls: 0,
    baseline: SUGGESTION_QUALITY_BASELINE,
    corpus: {
      documents: EVAL_DOCUMENTS.length,
      candidates: allEvalCandidates().length,
      expectedStableEntities: expectedStableEntities().length,
      expectedUnresolved: expectedUnresolvedEntities().length,
    },
    phases: Object.fromEntries(allPhaseList.map((phase) => [phase.id, phase])),
    cleanupBurden,
    precisionRecall: precisionRecall(world, firstPass, secondPass),
    bookScorecard: bookScorecard([...firstPass.traces, ...secondPass.traces]),
    writeAmplification: {
      firstPass: firstPass.writes,
      secondPass: secondPass.writes,
    },
    performance: {
      firstPass: firstPass.performance,
      secondPass: secondPass.performance,
      nPlusOneReintroduced:
        firstPass.performance.canonIndexLoads > 1 || secondPass.performance.canonIndexLoads > 1,
    },
    successTargets: {
      duplicateCanonicalCardsOnIdenticalRerun: secondPass.outcomes.CREATED_NEW,
      dismissedEquivalentResurrection: resurrected,
      repeatedMergeSuggestionsAfterConfirmedMerge: repeatedMerges,
      notSamePairReSuggested: notSameResuggested,
      machineCreateDuringFullDegraded: degradedPhase.outcomes.CREATED_NEW,
      secondPassSemanticWrites: secondPass.writes.semanticWrites,
    },
    remainingCleanupSources: rankRemaining([...firstPass.traces, ...secondPass.traces, ...typePhase.traces]),
    canonAfterIngest: Object.values(world.index)
      .flat()
      .filter((row): row is AttachCanonRecord => Boolean(row))
      .map((row) => ({
        id: row.id,
        name: row.name,
        domain: row.domain,
        aliases: row.aliases,
        type: row.canonicalType,
      })),
  };

  return report;
}

export function summarizeReport(report: SuggestionQualityReport): string {
  const t = report.successTargets;
  const lines = [
    `${report.runId} candidates=${report.corpus.candidates} llmCalls=${report.llmCalls}`,
    `firstPass created=${report.phases.first_pass.outcomes.CREATED_NEW} attached=${report.phases.first_pass.outcomes.ATTACHED_EXISTING} unresolved=${report.phases.first_pass.outcomes.UNRESOLVED_ACTOR}`,
    `secondPass created=${t.duplicateCanonicalCardsOnIdenticalRerun} semanticWrites=${t.secondPassSemanticWrites}`,
    `dismissResurrection=${t.dismissedEquivalentResurrection} mergeRepeat=${t.repeatedMergeSuggestionsAfterConfirmedMerge} notSame=${t.notSamePairReSuggested} degradedCreate=${t.machineCreateDuringFullDegraded}`,
    `cleanupBurden=${report.cleanupBurden.total} per100=${report.cleanupBurden.per100Candidates ?? 'n/a'}`,
    `creationPrecision=${report.precisionRecall.entityCreationPrecision ?? 'n/a'} attachPrecision=${report.precisionRecall.attachPrecision ?? 'n/a'} stableRecall=${report.precisionRecall.stableEntityRecall ?? 'n/a'}`,
    `nPlusOneReintroduced=${report.performance.nPlusOneReintroduced}`,
  ];
  return lines.join('\n');
}
