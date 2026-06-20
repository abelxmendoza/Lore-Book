/**
 * LoreBook Semantic Analyzer (Stage 2).
 *
 * Wraps the LoreBook Parse Engine and projects its operations into the unified
 * `SemanticAnalysis` contract. Read-only: emits meaning + gated candidates only.
 *
 * Phase 1.5: this is a faithful projection of what the parser already produces.
 * Stance / temporal / contradiction layers are returned empty (see types).
 */

import {
  parseLoreBookText,
  parseLoreBookTextForUser,
  type ParseLoreBookTextInput,
} from '../parser/loreBookParseEngine';
import type {
  EvidenceBundle,
  LoreBookDomain,
  LoreBookOperation,
  LoreBookParseOptions,
  LoreBookParseResult,
} from '../parser/loreBookParserTypes';
import type { CanonSeed } from '../parser/canonIndexBuilder';
import type {
  CrossBookHint,
  ProvenanceStep,
  SemanticAmbiguity,
  SemanticAnalysis,
  SemanticEdge,
  SemanticEntity,
  SemanticEvent,
  SemanticReviewItem,
} from './semanticAnalysisTypes';

const EVENT_DOMAINS = new Set<LoreBookDomain>(['events', 'timeline']);

function pushProvenance(steps: ProvenanceStep[], seen: Set<string>, step: ProvenanceStep): void {
  const key = `${step.stage}:${step.rule}:${step.detail ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  steps.push(step);
}

function evidenceRules(evidence?: EvidenceBundle): string[] {
  if (!evidence) return [];
  return [...(evidence.lexicalRulesFired ?? []), ...(evidence.parserRulesFired ?? [])];
}

/**
 * Pure projection: LoreBookParseResult → SemanticAnalysis.
 * No I/O. Safe to unit-test in isolation.
 */
export function parseResultToSemanticAnalysis(
  result: LoreBookParseResult,
  options: { includeRaw?: boolean } = {}
): SemanticAnalysis {
  const entities = new Map<string, SemanticEntity>();
  const relationships: SemanticEdge[] = [];
  const events: SemanticEvent[] = [];
  const crossBook: CrossBookHint[] = [];
  const ambiguities: SemanticAmbiguity[] = [];
  const reviewItems: SemanticReviewItem[] = [];
  const provenance: ProvenanceStep[] = [];
  const provSeen = new Set<string>();

  const upsertEntity = (entity: SemanticEntity) => {
    const key = `${entity.domain}:${entity.name.toLowerCase()}`;
    const prev = entities.get(key);
    if (!prev || entity.confidence > prev.confidence) {
      entities.set(key, prev ? { ...prev, ...entity, criteria: [...new Set([...prev.criteria, ...entity.criteria])] } : entity);
    }
  };

  // Active operations + redirects feed the projection. Suppressed is reported separately.
  const ops: LoreBookOperation[] = [...result.operations, ...result.redirects];

  for (const op of ops) {
    switch (op.kind) {
      case 'suggest_add': {
        const isEvent = EVENT_DOMAINS.has(op.domain);
        if (isEvent) {
          events.push({ name: op.name, domain: op.domain, confidence: op.confidence, evidence: op.evidence, gate: op.gate });
        } else {
          upsertEntity({
            name: op.name,
            domain: op.domain,
            resolution: 'new',
            confidence: op.confidence,
            criteria: ['not_in_canon'],
            evidence: op.evidence,
            sourceSpanIds: op.sourceSpans,
            gate: op.gate,
          });
        }
        reviewItems.push({ operation: op, reason: `new_${op.domain}`, gate: op.gate });
        pushProvenance(provenance, provSeen, { stage: 'parser', rule: 'suggest_add', detail: op.domain });
        for (const r of evidenceRules(op.evidence)) {
          pushProvenance(provenance, provSeen, { stage: 'lexical', rule: r });
        }
        break;
      }

      case 'suggest_merge': {
        upsertEntity({
          name: op.name,
          domain: op.domain,
          resolution: 'similar',
          matchedId: op.targetBookId,
          matchedName: op.targetName,
          confidence: op.confidence,
          criteria: [op.reason],
          sourceSpanIds: [],
          gate: 'review',
        });
        reviewItems.push({ operation: op, reason: op.reason, gate: 'review' });
        pushProvenance(provenance, provSeen, { stage: 'identity', rule: 'suggest_merge', detail: op.reason });
        break;
      }

      case 'redirect': {
        crossBook.push({
          name: op.name,
          fromDomain: op.fromDomain,
          toDomain: op.toDomain,
          reason: op.reason,
          confidence: op.confidence,
        });
        pushProvenance(provenance, provSeen, { stage: 'cross_book_guard', rule: 'redirect', detail: `${op.fromDomain}->${op.toDomain}` });
        break;
      }

      case 'link': {
        const bothResolved = Boolean(op.fromEntity.entityId && op.toEntity.entityId);
        relationships.push({
          from: op.fromEntity,
          to: op.toEntity,
          relationType: op.relationType,
          confidence: op.confidence,
          evidence: op.evidence,
          gate: op.gate,
          bothEndpointsResolved: bothResolved,
        });
        // Dangling relationships must be confirmed, not silently committed.
        const gate = bothResolved ? op.gate : 'review';
        reviewItems.push({ operation: op, reason: bothResolved ? op.relationType : 'dangling_endpoint', gate });
        pushProvenance(provenance, provSeen, { stage: 'parser', rule: 'link', detail: op.relationType });
        break;
      }

      case 'update_attribute': {
        upsertEntity({
          name: op.field,
          domain: op.domain,
          resolution: 'known',
          matchedId: op.entityId,
          confidence: op.confidence,
          criteria: ['attribute_update'],
          evidence: op.evidence,
          sourceSpanIds: [],
          gate: op.gate,
        });
        reviewItems.push({ operation: op, reason: `update_${op.field}`, gate: op.gate });
        pushProvenance(provenance, provSeen, { stage: 'parser', rule: 'update_attribute', detail: op.field });
        break;
      }

      case 'attach_evidence': {
        upsertEntity({
          name: op.entityId,
          domain: op.domain,
          resolution: 'known',
          matchedId: op.entityId,
          confidence: op.confidence,
          criteria: ['evidence_attached'],
          sourceSpanIds: [],
          gate: 'suggest',
        });
        pushProvenance(provenance, provSeen, { stage: 'provenance', rule: 'attach_evidence' });
        break;
      }
    }
  }

  // Lexical spans flagged for review → ambiguities (only if not already a clean entity).
  for (const span of result.lexicalSpans) {
    if (span.status !== 'needs_review' && !span.needsReview) continue;
    ambiguities.push({
      name: span.text,
      domain: (span.type as unknown as LoreBookDomain) ?? 'characters',
      question: `Is "${span.text}" the right interpretation?`,
      candidates: span.alternatives.map((alt) => ({
        domain: (alt.type as unknown as LoreBookDomain) ?? 'characters',
        confidence: alt.confidence,
      })),
    });
    if (span.rulesFired?.length) {
      for (const r of span.rulesFired) pushProvenance(provenance, provSeen, { stage: 'lexical', rule: r });
    }
  }

  const suppressed = result.suppressed
    .filter((op): op is Extract<LoreBookOperation, { kind: 'suppress' }> => op.kind === 'suppress')
    .map((op) => ({ name: op.name, reason: op.reason }));

  const allConfidences = [
    ...[...entities.values()].map((e) => e.confidence),
    ...relationships.map((r) => r.confidence),
    ...events.map((e) => e.confidence),
  ];
  const confidence =
    allConfidences.length > 0 ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length : 0;

  return {
    userId: result.userId,
    text: result.text,
    entities: [...entities.values()],
    relationships,
    events,
    crossBook,
    ambiguities,
    reviewItems,
    suppressed,
    stances: [],
    temporal: [],
    contradictions: [],
    provenance,
    confidence,
    warnings: result.warnings,
    raw: options.includeRaw ? result : undefined,
  };
}

/** Sync entry — parse + project. Uses supplied canon/seed (empty canon if none). */
export function analyzeSemantics(
  input: ParseLoreBookTextInput & { includeRaw?: boolean }
): SemanticAnalysis {
  const { includeRaw, ...parseInput } = input;
  const result = parseLoreBookText(parseInput);
  const analysis = parseResultToSemanticAnalysis(result, { includeRaw });
  analysis.messageId = parseInput.messageId;
  analysis.threadId = parseInput.threadId;
  return analysis;
}

/** Async entry — loads user canon from DB when none supplied. Read-only. */
export async function analyzeSemanticsForUser(
  userId: string,
  text: string,
  options: LoreBookParseOptions & { canonSeed?: CanonSeed; includeRaw?: boolean } = {}
): Promise<SemanticAnalysis> {
  const { includeRaw, ...parseOptions } = options;
  const result = await parseLoreBookTextForUser(userId, text, parseOptions);
  const analysis = parseResultToSemanticAnalysis(result, { includeRaw });
  analysis.messageId = options.messageId;
  analysis.threadId = options.threadId;
  return analysis;
}
