import { normalizeNameKey } from '../../../utils/nameNormalization';
import { inferBlockers } from './blockerInferenceService';
import { inferFeatureQuestItems } from './featureQuestItemInference';
import { inferGoals } from './goalInferenceService';
import { inferHabits } from './habitInferenceService';
import {
  boostConfidenceForRepeatedMentions,
  canPromoteToQuestLogItem,
  evaluateQuestLogPromotionStatus,
} from './questLogPromotionGate';
import {
  buildQuestLogContext,
  extractEvidencePhrases,
  hasProvenance,
} from './questLogProvenanceService';
import { inferQuests } from './questInferenceService';
import {
  attachProjectLinks,
  isProjectBookEntity,
  shouldCreateProjectCardFromQuestItem,
} from './questProjectLinker';
import { inferTasks, isBareTaskLabel } from './taskInferenceService';
import type {
  QuestLogCandidate,
  QuestLogInferenceInput,
  QuestLogInferenceResult,
} from './questLogInferenceTypes';

export const BARE_GENERIC_QUEST_LABELS = new Set([
  'project',
  'task',
  'goal',
  'feature',
  'thing',
  'idea',
  'system',
  'app',
  'quest',
  'milestone',
  'blocker',
  'habit',
]);

const CONSUMER_TOOLS = /\b(?:Find My app|Cursor|Codex|Claude Code)\b/i;
const CONSUMER_TOOL_ACTION =
  /\b(?:use|build|configure|integrate|set up|wire|connect|deploy with)\b/i;

export function isBareGenericQuestLabel(name: string): boolean {
  return BARE_GENERIC_QUEST_LABELS.has(normalizeNameKey(name));
}

export function isConsumerToolOnlyMention(text: string, displayName: string): boolean {
  if (!CONSUMER_TOOLS.test(displayName) && !CONSUMER_TOOLS.test(text)) return false;
  return !CONSUMER_TOOL_ACTION.test(text);
}

function attachMessageMeta(
  candidates: QuestLogCandidate[],
  input: QuestLogInferenceInput,
): QuestLogCandidate[] {
  return candidates.map((c) => {
    const priorKey = normalizeNameKey(c.displayName);
    const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;
    const boosted = boostConfidenceForRepeatedMentions(c.confidence, priorMentions);

    const withMeta = {
      ...c,
      confidence: boosted,
      sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
      context: buildQuestLogContext(input.text, c.displayName, c.context),
      evidencePhrases:
        c.evidencePhrases.length > 0
          ? c.evidencePhrases
          : extractEvidencePhrases(input.text, c.displayName),
    };

    return attachProjectLinks(withMeta, input.text, input.knownProjects);
  });
}

function dedupeQuestLogItems(candidates: QuestLogCandidate[]): QuestLogCandidate[] {
  const out: QuestLogCandidate[] = [];
  const typePriority: Record<QuestLogCandidate['itemType'], number> = {
    blocker: 10,
    task: 9,
    feature: 8,
    quest: 7,
    goal: 6,
    milestone: 5,
    habit: 4,
    reminder: 3,
    research_item: 2,
  };

  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.displayName);
    const idx = out.findIndex((c) => normalizeNameKey(c.displayName) === key);
    if (idx >= 0) {
      const existing = out[idx];
      const keep =
        typePriority[candidate.itemType] >= typePriority[existing.itemType]
          ? candidate
          : existing;
      const merge = typePriority[candidate.itemType] >= typePriority[existing.itemType] ? existing : candidate;
      out[idx] = {
        ...keep,
        confidence: Math.max(existing.confidence, candidate.confidence),
        context: { ...merge.context, ...keep.context },
        evidencePhrases: [...new Set([...existing.evidencePhrases, ...candidate.evidencePhrases])],
        sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...candidate.sourceMessageIds])],
        requiresReview: existing.requiresReview || candidate.requiresReview,
      };
    } else {
      out.push(candidate);
    }
  }

  return out.filter((candidate) => {
    if (candidate.itemType !== 'quest') return true;
    return !out.some(
      (other) =>
        other.itemType === 'feature' &&
        other !== candidate &&
        candidate.displayName.toLowerCase().includes(other.displayName.toLowerCase()),
    );
  });
}

function finalizeCandidate(
  candidate: QuestLogCandidate,
  input: QuestLogInferenceInput,
): QuestLogCandidate {
  const priorKey = normalizeNameKey(candidate.displayName);
  const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;
  const promotionStatus = evaluateQuestLogPromotionStatus(candidate, {
    mentionCount: input.mentionCount,
    userConfirmed: input.userConfirmed,
    priorMentions,
  });
  return { ...candidate, promotionStatus };
}

export class QuestLogInferenceService {
  inferFromMessage(input: QuestLogInferenceInput): QuestLogInferenceResult {
    const rejected: QuestLogInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }],
      };
    }

    const raw = [
      ...inferQuests(input.text),
      ...inferGoals(input.text),
      ...inferTasks(input.text),
      ...inferFeatureQuestItems(input.text),
      ...inferBlockers(input.text),
      ...inferHabits(input.text),
    ];

    const withMeta = attachMessageMeta(raw, input);
    const deduped = dedupeQuestLogItems(withMeta);
    const accepted: QuestLogCandidate[] = [];

    for (const candidate of deduped) {
      if (isBareGenericQuestLabel(candidate.displayName) || isBareTaskLabel(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_generic_label' });
        continue;
      }

      if (isProjectBookEntity(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'project_book_entity_not_quest_item' });
        continue;
      }

      if (shouldCreateProjectCardFromQuestItem(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'routes_to_project_book_not_quest_log' });
        continue;
      }

      if (isConsumerToolOnlyMention(input.text, candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'consumer_tool_without_action' });
        continue;
      }

      if (input.knownDomains?.[normalizeNameKey(candidate.displayName)] === 'project') {
        rejected.push({ displayName: candidate.displayName, reason: 'known_project_entity' });
        continue;
      }

      if (!hasProvenance(candidate)) {
        rejected.push({ displayName: candidate.displayName, reason: 'missing_provenance' });
        continue;
      }

      accepted.push(finalizeCandidate(candidate, input));
    }

    return { accepted, rejected };
  }

  canPromote(
    candidate: QuestLogCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
  ): boolean {
    return canPromoteToQuestLogItem(candidate, opts);
  }

  /** Quest Log items must never surface as Project Book card suggestions. */
  shouldRouteToQuestLogUi(candidate: QuestLogCandidate): boolean {
    return !shouldCreateProjectCardFromQuestItem(candidate.displayName);
  }
}

export const questLogInferenceService = new QuestLogInferenceService();
