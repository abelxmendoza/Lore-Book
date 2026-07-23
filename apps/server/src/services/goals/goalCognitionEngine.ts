import { normalizeNameKey } from '../../utils/nameNormalization';
import { resolveGoalAgency } from './goalAgencyResolver';
import { canonicalizeGoalTitle, isSemanticallyCompleteGoalTitle } from './goalCanonicalizer';
import { segmentGoalClauses, selectGoalClause } from './goalCandidateExtractor';
import { scoreGoalConfidence } from './goalConfidenceScorer';
import { routeGoalDomain } from './goalDomainRouter';
import { evaluateGoalEligibility } from './goalEligibilityGate';
import { buildSupportingGoalEvidence } from './goalEvidenceService';
import { resolveGoalLifecycle } from './goalLifecycleResolver';
import { resolveGoalModality } from './goalModalityResolver';
import { resolveGoalPolarity } from './goalPolarityResolver';
import { isGoalSourceAllowed } from './goalSourcePolicy';
import { rankGoalSuggestion } from './goalSuggestionRanker';
import { resolveGoalTemporalState } from './temporalIntentResolver';
import type {
  GoalCognitionInput,
  GoalCognitionResult,
  GoalDurability,
  GoalKind,
} from './goalTypes';

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `goal-${(hash >>> 0).toString(16)}`;
}

function classifyGoalKind(text: string, proposed?: string): GoalKind {
  const lower = text.toLowerCase();
  if (/^(?:next|you completely failed|that was a failed response)\b/.test(lower)) return 'NON_GOAL';
  if (/\b(?:response failed|you forgot|app broke|that was a failed|completely failed)\b/.test(lower)) return 'FEEDBACK';
  if (/^(?:next|you completely|that was a)\b/.test(lower)) return 'NON_GOAL';
  if (/\b(?:was|is|were)\s+(?:run|built|led|managed)\s+by\b/.test(lower)) return 'NON_GOAL';
  if (/\b(?:i miss|i feel|i felt|i am sad|i'?m sad)\b/.test(lower)) return 'NON_GOAL';
  if (/\b(?:told me to|asked me to|assigned me to)\b/.test(lower)) return 'OBLIGATION';
  if (/\b(?:no longer want|never was a goal)\b/.test(lower)) return 'NON_GOAL';
  if (/\b(?:finished|completed|already did|got done|ran yesterday)\b/.test(lower)) return 'COMPLETED_ACTION';
  if (/\b(?:went to|texted me|got fired|we went|i ran)\b/.test(lower) && /\b(?:yesterday|last|ago|saturday|went|texted|fired|ran)\b/.test(lower)) {
    return 'PAST_EVENT';
  }
  if (/\b(?:at the time|back then|used to)\b/.test(lower)) return 'PAST_EVENT';
  if (/\b(?:don'?t|do not|never)\s+want\s+to\s+stop\b/.test(lower)) {
    return /\b(?:lorebook|build|launch|ship|project)\b/.test(lower) ? 'PROJECT' : 'INTENTION';
  }
  if (/\b(?:don'?t|do not|never)\s+want\s+to\b/.test(lower)) return 'AVOIDANCE_GOAL';
  if (/\bif\b.+\b(?:might|could|would)\b/.test(lower)) return 'HYPOTHETICAL';
  if (/\bwaiting to\b|\bwaiting for\b/.test(lower)) return 'WAITING_STATE';
  if (/\bi wish\b/.test(lower)) return 'WISH';
  if (/\bi hope\b|\bhoping that\b/.test(lower)) return 'HOPE';
  if (/\b(?:every day|every week|every morning|per week|routine)\b/.test(lower)) return 'HABIT';
  if (/\b(?:idea|what if we|could build)\b/.test(lower)) return 'IDEA';
  if (/\b(?:today|tomorrow|reply to|apply to|test \w|run at|going to run|need to)\b/.test(lower)) return 'TASK';
  if (/\b(?:lorebook|project|app|product)\b/.test(lower) && /\b(?:launch|ship|build|improve|continue|working)\b/.test(lower)) {
    return 'PROJECT';
  }
  if (/\b(?:my goal|want to|trying to|still want|plan to|intend to)\b/.test(lower)) return 'QUEST';
  const normalized = proposed?.toUpperCase();
  if (normalized && [
    'QUEST', 'PROJECT', 'MILESTONE', 'TASK', 'HABIT', 'ROUTINE', 'INTENTION',
  ].includes(normalized)) return normalized as GoalKind;
  return 'NON_GOAL';
}

function inferDurability(kind: GoalKind, text: string): GoalDurability {
  if (['QUEST', 'PROJECT', 'HABIT', 'ROUTINE'].includes(kind)) return 'DURABLE';
  if (['TASK', 'MILESTONE', 'INTENTION'].includes(kind)) return 'SHORT_TERM';
  if (/\b(?:today|now|just)\b/i.test(text)) return 'SHORT_TERM';
  return 'MOMENTARY';
}

function explicitUserIntent(text: string): boolean {
  return /\b(?:I|we)\s+(?:still\s+)?(?:want|need|plan|intend|will|am going|have|must|should|am trying)\b/i.test(text)
    || /\bI(?:'m| am)\s+(?:still\s+)?(?:going|trying|planning|working)\b/i.test(text)
    || /\bmy goal\b/i.test(text)
    || /\b(?:every day|every week|per week)\b/i.test(text);
}

export class GoalCognitionEngine {
  evaluate(input: GoalCognitionInput): GoalCognitionResult {
    const now = input.now ?? new Date();
    const sourceType = input.sourceType ?? 'chat';
    const clause = selectGoalClause(input.sourceText, input.proposedTitle);
    const kind = classifyGoalKind(clause.text, input.proposedKind);
    const polarity = resolveGoalPolarity(clause.text);
    const temporalState = input.userConfirmed
      ? 'PRESENT_ACTIVE'
      : resolveGoalTemporalState(clause.text, now);
    const agency = input.userConfirmed ? 'USER' : resolveGoalAgency(clause.text);
    const modality = resolveGoalModality(clause.text);
    const durability = inferDurability(kind, clause.text);
    const titleSeed = input.proposedTitle || clause.text;
    const canonicalTitle = canonicalizeGoalTitle(titleSeed, kind);
    const semanticallyComplete = isSemanticallyCompleteGoalTitle(canonicalTitle);
    const intendedByUser = input.userConfirmed || explicitUserIntent(clause.text);
    const sourceAllowed = isGoalSourceAllowed(input);
    const lifecycle = resolveGoalLifecycle({ text: clause.text, kind, temporalState });
    const eligibility = evaluateGoalEligibility({
      kind,
      temporalState,
      agency,
      durability,
      semanticallyComplete,
      sourceAllowed,
      negated: polarity.negated,
      intendedByUser,
    });
    const confidence = scoreGoalConfidence({
      kind,
      modality,
      explicitIntent: intendedByUser,
      durability,
      semanticComplete: semanticallyComplete,
      hardBlocked: !eligibility.eligible,
    });
    const evidence = buildSupportingGoalEvidence({
      text: clause.text,
      sourceMessageId: input.sourceMessageId,
      sourceType,
      observedAt: now,
    });
    const id = stableId(`${input.ownerEntityId}:${normalizeNameKey(canonicalTitle)}`);
    const candidate = {
      id,
      ownerEntityId: input.ownerEntityId,
      kind,
      canonicalTitle,
      originalText: clause.text,
      status: lifecycle.status,
      temporalState,
      durability,
      agency,
      domain: routeGoalDomain(clause.text),
      targetEntityIds: [],
      locationEntityIds: [],
      organizationEntityIds: [],
      desiredOutcome: canonicalTitle,
      nextAction: kind === 'TASK' ? canonicalTitle : undefined,
      commitmentScore: modality.weight,
      persistenceScore: durability === 'DURABLE' ? 0.9 : durability === 'SHORT_TERM' ? 0.68 : 0.25,
      actionabilityScore: ['TASK', 'QUEST', 'PROJECT', 'HABIT'].includes(kind) ? 0.85 : 0.3,
      salienceScore: confidence,
      confidence,
      evidenceIds: input.sourceMessageId ? [input.sourceMessageId] : [],
      supportingEvidence: [evidence],
      contradictingEvidence: [],
      sourceMessageId: input.sourceMessageId ?? '',
      sourceType,
      createdAt: now,
      lastSupportedAt: now,
    };
    const rankedDecision = rankGoalSuggestion(confidence, eligibility);
    const decision = lifecycle.lifecycleDecision ?? rankedDecision;
    const reasons = eligibility.eligible
      ? [`explicit_${modality.label.toLowerCase()}_user_intent`, `classified_as_${kind.toLowerCase()}`]
      : eligibility.reasons;

    return {
      candidate,
      eligibility,
      decision,
      diagnostic: {
        sourceText: input.sourceText,
        clauses: segmentGoalClauses(input.sourceText),
        detectedIntent: intendedByUser ? 'user_intent' : 'no_user_intent',
        temporalResolution: temporalState,
        negationScopes: polarity.scopes,
        modality: modality.label,
        agency,
        proposedKind: kind,
        eligibility,
        duplicateMatches: [],
        finalDecision: decision,
        reasons,
      },
    };
  }
}

export const goalCognitionEngine = new GoalCognitionEngine();
