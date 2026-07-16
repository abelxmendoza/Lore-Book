import { createHash } from 'crypto';

import type { MemoryProposalInput, ProposalKind, RiskLevel, SensitivityLevel } from '../types/memoryReviewQueue';

export type ProposalIntegrityDecision = {
  valid: boolean;
  rejectionReason?: string;
  proposalKind: ProposalKind;
  normalizedSummary: string;
  proposedMutation: string;
  predicate: string;
  typedValue: string | null;
  confidence: number;
  riskLevel: RiskLevel;
  riskReason: string;
  sensitivity: SensitivityLevel;
  fingerprint: string;
  groupKey: string;
  groupLabel: string;
  fingerprintInputs: {
    subjectScope: 'self' | 'entity';
    entityScope: string;
    proposalKind: ProposalKind;
    predicate: string;
    normalizedBelief: string;
    temporalScope: string;
    occurrenceScope: string;
  };
};

const COMMAND_OR_META = /^(?:please\s+)?(?:show|tell|list|check|remember|recap|summari[sz]e|fix|update|delete|forget|can you|could you|do you|what do you|who (?:am|is|else)|did i|well i(?:'m| am) asking)\b/i;
const TEST_OR_UI = /\b(?:test(?:ing|ed)?|debug(?:ging)?|chat bubbles?|styling|ui|user interface|glow effect|api tokens?|something went wrong|memory can be saved)\b/i;
const GREETING = /^(?:hi|hey|hello|yo|ok(?:ay)?)[!,.\s]*(?:there|again|here i am)?[!,.\s]*$/i;
const GENERIC_SHELL = /^(?:(?:user|the user|person|they)\s+(?:has|uses|mentioned)\b.*\b(?:event|relationship|one professionally)\b|possible entity:)/i;
const UNRESOLVED_PRONOUN = /\b(?:her|him|them|she|he|they)\b/i;
const RELATIONSHIP = /\b(?:relationship|partner|coworker|dating|romantic|blocked|friend|cousin|manager|spouse|boyfriend|girlfriend)\b/i;
const CORRECTION = /\b(?:mistake|incorrect|wrong|actually)\b|\b(?:i(?:'m| am)|you(?:'re| are)|he(?:'s| is)|she(?:'s| is)|they(?:'re| are)|is|are|was|were)\s+not\b|\b(?:isn'?t|aren'?t|wasn'?t|weren'?t)\b/i;
const EVENT = /\b(?:went|attended|visited|stayed|met|started|first day|party|show|concert|blocked|texted|happened)\b/i;
const PLAN = /\b(?:plan(?:ning)? (?:to|on)|about to|going to|intend|looking forward to)\b/i;
const FEELING = /\b(?:felt|feel|stoked|depressed|happy|sad|excited|anxious|optimistic)\b/i;
const OCCUPATION = /\b(?:works? (?:as|at|for)|working (?:as|at|for)|job|occupation|technician|engineer|developer|manager|contractor|agency)\b/i;
const ENTITY_CLASSIFICATION = /\b(?:is|was)\s+(?:a|an|the)\s+(?:band|club|venue|company|organization|platform|project|product|place)\b/i;
const HIGH_SENSITIVITY = /\b(?:sex|sexual|romantic|diagnos|health|medical|legal|crime|debt|income|salary|abuse)\b/i;
const IDENTITY = /\b(?:identity|occupation|works? as|working as|parent|religion|politic|not a)\b/i;
const AUTOBIOGRAPHICAL_ACTION = /\b(?:i|we|[A-Z][\w'.-]+)\s+(?:went|attended|visited|stayed|met|started|worked|felt|was|were|blocked|texted)\b/;

function compact(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();
}

function canonical(text: string): string {
  return compact(text)
    .toLowerCase()
    .replace(/\b(?:the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function inferKind(text: string, metadata: Record<string, unknown>): ProposalKind {
  const sourceType = String(metadata.extracted_unit_type ?? metadata.category ?? '').toUpperCase();
  if (CORRECTION.test(text)) return /\b(?:not|isn'?t|aren'?t)\b/i.test(text) ? 'retraction' : 'correction';
  if (PLAN.test(text) || sourceType === 'INTENTION') return 'plan';
  if (FEELING.test(text) || sourceType === 'FEELING') return 'emotional_state';
  if (RELATIONSHIP.test(text)) return 'relationship';
  if (OCCUPATION.test(text)) return 'occupation';
  if (ENTITY_CLASSIFICATION.test(text)) return 'entity_classification';
  if (EVENT.test(text) || sourceType === 'EXPERIENCE') return 'event';
  if (IDENTITY.test(text)) return 'identity_fact';
  return 'durable_fact';
}

function inferPredicate(kind: ProposalKind, text: string): string {
  if (kind === 'retraction' || kind === 'correction') return 'supersedes';
  if (kind === 'occupation') return /\b(?:at|for)\b/i.test(text) ? 'works_for' : 'works_as';
  if (kind === 'relationship') return /\bblocked\b/i.test(text) ? 'blocked_on_platform' : 'related_to';
  if (kind === 'event') return 'experienced';
  if (kind === 'plan') return 'intends';
  if (kind === 'emotional_state') return 'felt';
  if (kind === 'entity_classification') return 'is_a';
  return 'has_fact';
}

function mutationFor(kind: ProposalKind, summary: string): string {
  if (kind === 'retraction') return `Supersede the conflicting belief; do not add “${summary}” as a second fact.`;
  if (kind === 'correction') return `Replace the conflicting belief with: ${summary}`;
  if (kind === 'event') return `Add this as a dated moment, linked to its source evidence: ${summary}`;
  if (kind === 'plan') return `Add this as a temporary plan, not as a completed event: ${summary}`;
  if (kind === 'emotional_state') return `Add this as a time-bounded feeling: ${summary}`;
  return `Add this belief to LoreBook: ${summary}`;
}

function classifyRiskAndSensitivity(kind: ProposalKind, text: string, confidence: number): {
  riskLevel: RiskLevel;
  riskReason: string;
  sensitivity: SensitivityLevel;
} {
  const sensitivity: SensitivityLevel = HIGH_SENSITIVITY.test(text)
    ? 'SENSITIVE'
    : RELATIONSHIP.test(text)
      ? 'PRIVATE'
      : 'NORMAL';
  if (kind === 'retraction' || kind === 'correction') {
    return { riskLevel: 'HIGH', riskReason: 'Changes or removes an existing belief', sensitivity };
  }
  if (kind === 'relationship' || IDENTITY.test(text)) {
    return { riskLevel: 'HIGH', riskReason: 'Could materially change identity or relationship recall', sensitivity };
  }
  if (kind === 'occupation' || sensitivity !== 'NORMAL') {
    return { riskLevel: 'MEDIUM', riskReason: 'Affects current work or private personal context', sensitivity };
  }
  return { riskLevel: 'LOW', riskReason: 'Non-sensitive and reversible if interpreted incorrectly', sensitivity };
}

export function evaluateProposalIntegrity(input: {
  userId: string;
  entityId: string;
  entityName?: string;
  proposal: MemoryProposalInput;
  sourceText: string;
  metadata?: Record<string, unknown>;
}): ProposalIntegrityDecision {
  const claim = compact(input.proposal.claim_text);
  const source = compact(input.sourceText);
  const metadata = input.metadata ?? {};
  const confidence = Math.max(0, Math.min(1, input.proposal.confidence ?? 0.6));
  const proposalKind = inferKind(claim, metadata);
  const firstPerson = /^(?:i(?:'m| am)?|my)\b/i.test(claim);
  const subject = String(metadata.subject_name ?? metadata.user_name ?? (firstPerson ? 'The user' : input.entityName ?? 'The user'));
  const normalizedSummary = claim
    .replace(/^(?:user|the user)\s+/i, '')
    .replace(/^(?:(?:so|yeah|well|right now)\s+)?i(?:'m| am)\s+/i, `${subject} is `)
    .replace(/^(?:(?:so|yeah|well|right now)\s+)?i\s+/i, `${subject} `);

  let rejectionReason: string | undefined;
  if (!claim || claim.length < 8) rejectionReason = 'incomplete_fragment';
  else if (GREETING.test(source) || GREETING.test(claim)) rejectionReason = 'greeting';
  else if (source.endsWith('?') || claim.endsWith('?')) rejectionReason = 'question_or_recall_request';
  else if (COMMAND_OR_META.test(source) && !AUTOBIOGRAPHICAL_ACTION.test(claim)) rejectionReason = 'command_or_metaconversation';
  else if (TEST_OR_UI.test(source) && !EVENT.test(claim)) rejectionReason = 'test_debug_or_ui_feedback';
  else if (/^possible entity:\s*(?:tonight|today|tomorrow|yesterday)\s*\([^)]*\)/i.test(claim)) rejectionReason = 'invalid_temporal_entity';
  else if (GENERIC_SHELL.test(claim)) rejectionReason = 'generic_or_incomplete_proposal';
  else if ((RELATIONSHIP.test(claim) || /\b(?:met|saw|kissed|dated)\b/i.test(claim)) && UNRESOLVED_PRONOUN.test(claim) && !metadata.object_entity_id) rejectionReason = 'unresolved_relationship_endpoint';
  else if (
    /^(?:tonight|today|tomorrow|yesterday)$/i.test(claim) ||
    /^(?:tonight|today|tomorrow|yesterday)$/i.test(String(metadata.entity_name ?? input.entityName ?? ''))
  ) rejectionReason = 'invalid_temporal_entity';
  else if ((proposalKind === 'correction' || proposalKind === 'retraction') && (OCCUPATION.test(claim) || EVENT.test(claim)) && /\b(?:and|but|currently|now)\b/i.test(claim)) {
    rejectionReason = 'compound_mixed_proposal';
  }
  else if (proposalKind === 'occupation' && /\band\b.*\b(?:sent|package|deliver|took forever)\b/i.test(claim)) {
    rejectionReason = 'compound_mixed_proposal';
  }

  const predicate = inferPredicate(proposalKind, claim);
  const typedValue = normalizedSummary || null;
  const occurrenceBearing = proposalKind === 'event' || proposalKind === 'plan' || proposalKind === 'emotional_state';
  const temporalScope = occurrenceBearing || proposalKind === 'relationship'
    ? stableJson(input.proposal.temporal_context ?? {})
    : '{}';
  const occurrenceScope = occurrenceBearing
    ? String(
        metadata.message_id ??
        metadata.source_message_id ??
        metadata.utterance_id ??
        metadata.extracted_unit_id ??
        canonical(source)
      )
    : '';
  const subjectScope: 'self' | 'entity' = firstPerson && !occurrenceBearing ? 'self' : 'entity';
  const entityScope = subjectScope === 'self' ? `user:${input.userId}` : `entity:${input.entityId}`;
  const fingerprintSource = [
    input.userId,
    proposalKind,
    entityScope,
    predicate,
    canonical(normalizedSummary),
    temporalScope,
    occurrenceScope,
  ].join('|');
  const fingerprint = createHash('sha256').update(fingerprintSource).digest('hex');
  const { riskLevel, riskReason, sensitivity } = classifyRiskAndSensitivity(proposalKind, claim, confidence);
  const groupLabel = String(metadata.group_label ?? metadata.story_title ?? input.entityName ?? 'Related memories');

  return {
    valid: !rejectionReason,
    rejectionReason,
    proposalKind,
    normalizedSummary,
    proposedMutation: mutationFor(proposalKind, normalizedSummary),
    predicate,
    typedValue,
    confidence,
    riskLevel,
    riskReason,
    sensitivity,
    fingerprint,
    groupKey: canonical(groupLabel) || input.entityId,
    groupLabel,
    fingerprintInputs: {
      subjectScope,
      entityScope,
      proposalKind,
      predicate,
      normalizedBelief: canonical(normalizedSummary),
      temporalScope,
      occurrenceScope,
    },
  };
}

export function canAutoApproveProposal(decision: ProposalIntegrityDecision): boolean {
  return decision.valid && decision.riskLevel === 'LOW' && decision.sensitivity === 'NORMAL' && decision.confidence >= 0.85;
}
