import { normalizeNameKey } from '../../../utils/nameNormalization';
import { hasPerformanceContext, isStageNameAmbiguous } from './artistBandInference';
import { isEducationOrgNotMedia } from './contentCreatorInference';
import { inferArtistsAndBands } from './artistBandInference';
import { inferContentCreators } from './contentCreatorInference';
import { inferGenreFandoms } from './genreFandomInference';
import { applyMediaLinks } from './mediaPreferenceLinker';
import {
  disambiguateEventOrVenue,
  isCodeRedReviewFirst,
  shouldRejectAsMedia,
} from './mediaEventDisambiguation';
import { inferMediaWorks } from './mediaWorkInference';
import {
  boostConfidenceForRepeatedMentions,
  canPromoteToMediaCard,
  evaluateMediaPromotionStatus,
} from './mediaPromotionGate';
import {
  extractEvidencePhrases,
  hasProvenance,
  inferPreferenceSignal,
} from './mediaProvenanceService';
import type {
  MediaCandidate,
  MediaInferenceInput,
  MediaInferenceResult,
} from './mediaInferenceTypes';

function dedupeMedia(candidates: MediaCandidate[]): MediaCandidate[] {
  const typePriority: Record<MediaCandidate['mediaType'], number> = {
    movie: 10,
    show: 10,
    anime: 10,
    book: 10,
    theme_song: 9,
    song: 9,
    band: 8,
    artist: 8,
    content_creator: 7,
    youtube_channel: 7,
    game: 7,
    podcast: 6,
    fandom: 5,
    music_genre: 4,
    cultural_reference: 4,
    unknown_media: 1,
  };

  const out: MediaCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.displayName);
    const idx = out.findIndex((c) => normalizeNameKey(c.displayName) === key);
    if (idx >= 0) {
      const existing = out[idx];
      const keep =
        typePriority[candidate.mediaType] >= typePriority[existing.mediaType]
          ? candidate
          : existing;
      const merge =
        typePriority[candidate.mediaType] >= typePriority[existing.mediaType]
          ? existing
          : candidate;
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
  return out;
}

function finalizeCandidate(candidate: MediaCandidate, input: MediaInferenceInput): MediaCandidate {
  const key = normalizeNameKey(candidate.displayName);
  const priorMentions = input.priorMentionCounts?.[key] ?? 0;
  const boosted = boostConfidenceForRepeatedMentions(candidate.confidence, priorMentions);

  const withMeta = applyMediaLinks(
    {
      ...candidate,
      confidence: boosted,
      sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : candidate.sourceMessageIds,
      evidencePhrases:
        candidate.evidencePhrases.length > 0
          ? candidate.evidencePhrases
          : extractEvidencePhrases(input.text, candidate.displayName),
      context: {
        ...candidate.context,
        preferenceSignal: candidate.context.preferenceSignal ?? inferPreferenceSignal(input.text),
      },
    },
    input.text,
  );

  const promotionStatus = evaluateMediaPromotionStatus(withMeta, {
    mentionCount: input.mentionCount,
    userConfirmed: input.userConfirmed,
    priorMentions,
  });

  return {
    ...withMeta,
    promotionStatus,
    requiresReview: withMeta.requiresReview || isCodeRedReviewFirst(input.text),
  };
}

export class MediaInferenceService {
  inferFromMessage(input: MediaInferenceInput): MediaInferenceResult {
    const rejected: MediaInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return { accepted: [], rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }] };
    }

    const eventVenue = disambiguateEventOrVenue(input.text);
    if (eventVenue && eventVenue.route !== 'reject_media') {
      rejected.push({ displayName: eventVenue.displayName, reason: eventVenue.reason });
    }

    const raw = [
      ...inferMediaWorks(input.text),
      ...inferGenreFandoms(input.text),
      ...inferArtistsAndBands(input.text),
      ...inferContentCreators(input.text),
    ];

    const withMeta = raw.map((c) => finalizeCandidate(c, input));
    const deduped = dedupeMedia(withMeta);
    const accepted: MediaCandidate[] = [];

    for (const candidate of deduped) {
      if (isEducationOrgNotMedia(input.text, candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'education_org_not_media' });
        continue;
      }

      const wrongDomain = shouldRejectAsMedia(candidate.displayName, input.text, input.knownDomains);
      if (wrongDomain) {
        rejected.push({ displayName: candidate.displayName, reason: wrongDomain.reason });
        continue;
      }

      const charKey = normalizeNameKey(candidate.displayName);
      if (
        input.knownCharacters?.[charKey] &&
        isStageNameAmbiguous(candidate.displayName) &&
        !hasPerformanceContext(input.text)
      ) {
        rejected.push({ displayName: candidate.displayName, reason: 'known_character_not_media' });
        continue;
      }

      if (eventVenue && normalizeNameKey(eventVenue.displayName) === charKey) {
        rejected.push({ displayName: candidate.displayName, reason: eventVenue.reason });
        continue;
      }

      if (!hasProvenance(candidate)) {
        rejected.push({ displayName: candidate.displayName, reason: 'missing_provenance' });
        continue;
      }

      accepted.push(candidate);
    }

    return { accepted, rejected };
  }

  canPromote(
    candidate: MediaCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
  ): boolean {
    return canPromoteToMediaCard(candidate, opts);
  }
}

export const mediaInferenceService = new MediaInferenceService();

export { hasProvenance, disambiguateEventOrVenue, applyMediaLinks };
