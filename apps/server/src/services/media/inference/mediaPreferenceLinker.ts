import type { MediaCandidate } from './mediaInferenceTypes';

export function linkMediaToPreferences(candidate: MediaCandidate, text: string): MediaCandidate {
  const pref = candidate.context.preferenceSignal ?? 'mentioned';
  const linked: MediaCandidate = {
    ...candidate,
    context: {
      ...candidate.context,
      preferenceSignal: pref,
      sceneContext:
        candidate.context.sceneContext ??
        (candidate.mediaType === 'music_genre' || candidate.mediaType === 'fandom'
          ? 'user taste profile'
          : undefined),
    },
  };

  if (/\b(?:I like|I love|favorite|into|reminds me of|vibes with|inspired by|something like)\b/i.test(text)) {
    linked.context.sceneContext = 'user taste profile';
    linked.inferredNotConfirmed = !/\bI (?:like|love|favorite)\b/i.test(text);
  }

  if (/\bsomething like\b/i.test(text) && /Hedwig'?s Theme/i.test(candidate.displayName)) {
    linked.context.aestheticContext = 'mystical orchestral fantasy music';
    linked.context.preferenceSignal = 'inspired_by';
  }

  return linked;
}

export function linkMediaToProjectAesthetic(candidate: MediaCandidate, text: string): MediaCandidate {
  if (!/\bLoreBook\b/i.test(text)) return candidate;

  const aestheticRef = /\bBlade Runner\b/i.test(text)
    ? 'Blade Runner cyberpunk aesthetic'
    : candidate.context.aestheticContext;

  if (!aestheticRef && !/\b(?:vibe|aesthetic|UI|design)\b/i.test(text)) return candidate;

  return {
    ...candidate,
    context: {
      ...candidate.context,
      projectContext: 'LoreBook',
      aestheticContext: aestheticRef ?? `${candidate.displayName} aesthetic reference`,
    },
    promotionStatus:
      candidate.promotionStatus === 'mention_only' ? 'candidate' : candidate.promotionStatus,
  };
}

export function applyMediaLinks(candidate: MediaCandidate, text: string): MediaCandidate {
  let linked = linkMediaToPreferences(candidate, text);
  linked = linkMediaToProjectAesthetic(linked, text);
  return linked;
}
