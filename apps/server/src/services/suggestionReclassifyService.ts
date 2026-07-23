/**
 * User-driven suggestion category redirect — records training signal and moves
 * the suggestion to the target LoreBook pipeline.
 */

import { logger } from '../logger';
import { correctionTracker } from './activeLearning/correctionTracker';
import { questSuggestionService } from './quests/questSuggestionService';
import { skillSuggestionService } from './skills/skillSuggestionService';
import { projectSuggestionService } from './projects/projectSuggestionService';
import { omegaMemoryService } from './omegaMemoryService';
import {
  SUGGESTION_DOMAIN_LABELS,
  type SuggestionBookDomain,
} from './suggestionCrossBookService';
import {
  applyRedirectTargetMerge,
  buildRedirectMergeNotification,
  evaluateRedirectTargetMatch,
  type RedirectTargetMatchResult,
} from './suggestionRedirectMatchService';

export type SuggestionReclassifyInput = {
  name: string;
  fromDomain: SuggestionBookDomain;
  toDomain: SuggestionBookDomain;
  suggestionId?: string;
  context?: string;
  evidence?: string;
  description?: string;
  questType?: string;
  skillCategory?: string;
  projectType?: string;
  locationType?: string;
};

export type SuggestionReclassifyResult = {
  success: boolean;
  fromDomain: SuggestionBookDomain;
  toDomain: SuggestionBookDomain;
  name: string;
  correctionId?: string;
  message: string;
  autoMerged?: boolean;
  mergeNotification?: string;
  redirectMatch?: RedirectTargetMatchResult;
};

async function dismissSourceSuggestion(
  userId: string,
  fromDomain: SuggestionBookDomain,
  name: string,
  suggestionId?: string
): Promise<void> {
  try {
    if (fromDomain === 'quests') {
      if (suggestionId) await questSuggestionService.rejectSuggestion(userId, suggestionId);
      else await questSuggestionService.rejectByTitle(userId, name);
      return;
    }
    if (fromDomain === 'skills') {
      if (suggestionId) await skillSuggestionService.rejectSuggestion(userId, suggestionId);
      else await skillSuggestionService.rejectByName(userId, name);
      return;
    }
    if (fromDomain === 'projects') {
      if (suggestionId) await projectSuggestionService.rejectSuggestion(userId, suggestionId);
      else await projectSuggestionService.rejectByName(userId, name);
    }
  } catch (err) {
    logger.debug({ err, userId, fromDomain, name }, 'Source suggestion dismiss failed (non-blocking)');
  }
}

async function seedTargetSuggestion(
  userId: string,
  input: SuggestionReclassifyInput,
  match: RedirectTargetMatchResult
): Promise<void> {
  const name = input.name.trim();
  if (!name) return;

  const movedReason = `Moved from ${SUGGESTION_DOMAIN_LABELS[input.fromDomain]} suggestions by you`;
  const similarNote =
    match.disposition === 'uncertain' && match.matchedName
      ? `May match existing “${match.matchedName}”.`
      : null;

  switch (input.toDomain) {
    case 'quests':
      await questSuggestionService.upsertFromExtraction(
        userId,
        {
          title: name,
          description: input.description ?? input.context,
          quest_type: input.questType ?? 'side',
          confidence: match.disposition === 'uncertain' ? 0.62 : 0.78,
          reasoning: [movedReason, similarNote].filter(Boolean).join(' '),
        },
        {
          source: 'chat',
          sourceText: input.context ?? input.description ?? name,
          userConfirmed: true,
        }
      );
      break;
    case 'skills':
      await skillSuggestionService.upsertFromExtraction(
        userId,
        {
          skill_name: name,
          skill_category: input.skillCategory ?? 'other',
          skill_type: 'professional',
          monetization: 'unpaid',
          proficiency: 50,
          confidence: match.disposition === 'uncertain' ? 0.62 : 0.78,
          enjoyment: 50,
          usage_frequency: 'rarely',
          trajectory: 'unknown',
          description: input.description ?? input.context,
          evidence: input.evidence ? [input.evidence] : [],
        },
        { source: 'chat' }
      );
      break;
    case 'projects':
      await projectSuggestionService.upsertManyFromExtraction(
        userId,
        [
          {
            name,
            description: input.description ?? input.context,
            type: input.projectType ?? 'project',
            confidence: match.disposition === 'uncertain' ? 0.62 : 0.78,
            reasoning: [movedReason, similarNote].filter(Boolean).join(' '),
            evidence: input.evidence ? [input.evidence] : [],
          },
        ],
        { source: 'chat' }
      );
      break;
    case 'characters':
      await omegaMemoryService.createEntity(userId, name, 'PERSON');
      break;
    case 'locations':
      await omegaMemoryService.createEntity(userId, name, 'LOCATION');
      break;
    default:
      break;
  }
}

class SuggestionReclassifyService {
  async reclassify(userId: string, input: SuggestionReclassifyInput): Promise<SuggestionReclassifyResult> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Suggestion name is required');
    }
    if (input.fromDomain === input.toDomain) {
      throw new Error('Source and target category must differ');
    }

    await dismissSourceSuggestion(userId, input.fromDomain, name, input.suggestionId);

    const redirectMatch = await evaluateRedirectTargetMatch(userId, name, input.toDomain);
    const autoMerged = redirectMatch.disposition === 'auto_merged';

    if (autoMerged) {
      await applyRedirectTargetMerge(userId, name, input.toDomain, redirectMatch);
    } else {
      await seedTargetSuggestion(userId, input, redirectMatch);
    }

    const mergeNotification = buildRedirectMergeNotification(name, input.toDomain, redirectMatch);

    const correction = await correctionTracker
      .recordCorrection(userId, {
        correction_type: 'entity',
        original_value: `${input.fromDomain}:${name}`,
        corrected_value: `${input.toDomain}:${name}`,
        context: input.context ?? input.evidence,
        metadata: {
          kind: 'suggestion_category_redirect',
          fromDomain: input.fromDomain,
          toDomain: input.toDomain,
          suggestionId: input.suggestionId ?? null,
          evidence: input.evidence ?? null,
          redirectMatch,
          autoMerged,
        },
      })
      .catch((err) => {
        logger.debug({ err, userId, name }, 'Correction audit skipped — redirect still applied');
        return null;
      });

    logger.info(
      {
        userId,
        from: input.fromDomain,
        to: input.toDomain,
        name,
        correctionId: correction?.id,
        autoMerged,
        matchedName: redirectMatch.matchedName,
      },
      'Suggestion reclassified by user'
    );

    const message = autoMerged
      ? (mergeNotification ??
        `Linked to existing ${SUGGESTION_DOMAIN_LABELS[input.toDomain].slice(0, -1).toLowerCase()}.`)
      : redirectMatch.disposition === 'uncertain'
        ? `Sent to ${SUGGESTION_DOMAIN_LABELS[input.toDomain]} as a suggestion — may match “${redirectMatch.matchedName}”.`
        : `Sent to ${SUGGESTION_DOMAIN_LABELS[input.toDomain]}. LoreBook will learn from this.`;

    return {
      success: true,
      fromDomain: input.fromDomain,
      toDomain: input.toDomain,
      name,
      correctionId: correction?.id,
      message,
      autoMerged,
      mergeNotification,
      redirectMatch,
    };
  }
}

export const suggestionReclassifyService = new SuggestionReclassifyService();
