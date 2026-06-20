/**
 * Friendship + music-scene inference — review-first, no DB writes.
 *
 * Handles lost/dormant friendships tied to places, venues, and genres.
 * Hard rules:
 *   - Do not infer death, breakup, or conflict from absence alone.
 *   - Do not hard-confirm venues vs events without review.
 *   - All associations are soft (inferredNotConfirmed=true).
 */

export interface FriendshipMusicSceneInput {
  sourceMessageId: string;
  text: string;
  people: string[];
  places: string[];
  venues: string[];
  genres: string[];
  relationshipPhrase?: string;
  absenceTimeHint?: string;
  userLabel?: string;
}

export interface FriendshipMusicSceneAssociation {
  kind: 'shared_music_scene_history' | 'associated_with' | 'interest' | 'values_relationship_with';
  subject: string;
  object: string;
  confidence: number;
  evidencePhrases: string[];
  sourceMessageId: string;
  inferredNotConfirmed: true;
  needsReview?: boolean;
}

export interface FriendshipMusicSceneResult {
  communityName: string;
  associations: FriendshipMusicSceneAssociation[];
  memoryReviewCandidates: string[];
  ambiguities: string[];
}

const LA_SCENE_COMMUNITY = 'LA Ska / Show Scene';

function evidence(text: string, ...patterns: RegExp[]): string[] {
  const found: string[] = [];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) found.push(m[0]);
  }
  return [...new Set(found)];
}

export function inferFriendshipMusicSceneAssociations(
  input: FriendshipMusicSceneInput
): FriendshipMusicSceneResult {
  const {
    sourceMessageId,
    text,
    people,
    places,
    venues,
    genres,
    relationshipPhrase,
    absenceTimeHint,
  } = input;
  const userLabel = input.userLabel ?? 'User';
  const associations: FriendshipMusicSceneAssociation[] = [];
  const memoryReviewCandidates: string[] = [];
  const ambiguities: string[] = [];

  const primaryPerson = people.find((p) => p !== userLabel && p !== 'self');
  const hasLaScene =
    places.some((p) => /\bLA\b/i.test(p)) ||
    /\bshows in LA\b/i.test(text) ||
    venues.length > 0 ||
    genres.some((g) => /ska/i.test(g));

  if (primaryPerson && relationshipPhrase) {
    memoryReviewCandidates.push(`${primaryPerson} was user's ${relationshipPhrase}.`);
    associations.push({
      kind: 'values_relationship_with',
      subject: userLabel,
      object: primaryPerson,
      confidence: 0.93,
      evidencePhrases: evidence(text, /\bnever had (?:any other )?friends like him\b/i, /\bbest friend\b/i),
      sourceMessageId,
      inferredNotConfirmed: true,
      needsReview: true,
    });
  }

  if (primaryPerson && absenceTimeHint) {
    memoryReviewCandidates.push(`User has not seen ${primaryPerson} since ${absenceTimeHint}.`);
    // Absence only — never infer death/conflict (hard rule).
    ambiguities.push('absence_not_cause_inferred');
  }

  if (primaryPerson && /\b(?:used to )?go to shows in LA\b/i.test(text)) {
    memoryReviewCandidates.push(`User and ${primaryPerson} used to go to shows in LA frequently.`);
    associations.push({
      kind: 'shared_music_scene_history',
      subject: primaryPerson,
      object: userLabel,
      confidence: 0.91,
      evidencePhrases: evidence(text, /\b(?:used to )?go to shows in LA\b/i),
      sourceMessageId,
      inferredNotConfirmed: true,
    });
  }

  if (hasLaScene) {
    memoryReviewCandidates.push('User has a strong connection to ska/live show culture.');
    if (primaryPerson) {
      associations.push({
        kind: 'associated_with',
        subject: primaryPerson,
        object: LA_SCENE_COMMUNITY,
        confidence: 0.78,
        evidencePhrases: evidence(text, /\bCode Red\b/, /\bska shows?\b/i, /\bshows in LA\b/i),
        sourceMessageId,
        inferredNotConfirmed: true,
        needsReview: true,
      });
    }
  }

  for (const genre of genres) {
    associations.push({
      kind: 'interest',
      subject: userLabel,
      object: genre,
      confidence: 0.88,
      evidencePhrases: evidence(text, new RegExp(`\\b${genre}\\s+shows?\\b`, 'i'), /\bska shows?\b/i),
      sourceMessageId,
      inferredNotConfirmed: true,
    });
  }

  if (venues.length > 0 && primaryPerson) {
    memoryReviewCandidates.push(
      `User and ${primaryPerson} went to ${venues.join(', ')} and ska shows together.`
    );
    ambiguities.push('venue_vs_event_unconfirmed');
  }

  return {
    communityName: LA_SCENE_COMMUNITY,
    associations,
    memoryReviewCandidates,
    ambiguities: [...new Set(ambiguities)],
  };
}
