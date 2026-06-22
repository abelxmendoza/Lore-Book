import type { MediaCandidate, MediaPromotionStatus } from './mediaInferenceTypes';

export function evaluateMediaPromotionStatus(
  candidate: MediaCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
): MediaPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_media';

  const mentions = opts.priorMentions ?? opts.mentionCount ?? 0;
  const pref = candidate.context.preferenceSignal;

  if (pref === 'favorite' || pref === 'likes' || pref === 'inspired_by') {
    return 'suggested_media';
  }
  if (pref === 'watched' || pref === 'listened_to') return 'suggested_media';
  if (candidate.context.projectContext) return 'suggested_media';
  if (candidate.context.aestheticContext) return 'suggested_media';
  if (mentions >= 2) return 'suggested_media';
  if (candidate.mediaType === 'music_genre' || candidate.mediaType === 'fandom') {
    return mentions >= 1 ? 'candidate' : 'mention_only';
  }
  if (candidate.confidence >= 0.88) return 'candidate';
  return 'mention_only';
}

export function canPromoteToMediaCard(
  candidate: MediaCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
): boolean {
  const status = evaluateMediaPromotionStatus(candidate, opts);
  return status === 'suggested_media' || status === 'confirmed_media';
}

export function boostConfidenceForRepeatedMentions(base: number, priorMentions: number): number {
  return Math.min(0.98, base + Math.min(0.15, priorMentions * 0.05));
}
