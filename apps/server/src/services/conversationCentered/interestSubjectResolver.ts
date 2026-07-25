/**
 * Decide which characters an interest should attach to — and *why*.
 *
 * LoreBook grows two intertwined lists:
 *   - the user's own hobbies/interests (self)
 *   - other people's hobbies/interests as they pertain to the user's story
 *
 * Bug this prevents: first-person hobbies ("I'm into anime") were saved with
 * every co-mentioned person in related_character_ids, so Mom inherited the
 * user's Duolingo / drones / martial arts list.
 */
import { supabaseAdmin } from '../supabaseClient';

export type InterestSubjectStance = 'self' | 'other_person' | 'shared';

export type InterestAttributionReason =
  | 'first_person_self'
  | 'explicit_attribution'
  | 'shared_with_user';

export type InterestSubjectLink = {
  characterId: string;
  reason: InterestAttributionReason;
  stance: InterestSubjectStance;
  evidence: string;
};

export type InterestSubjectResolution = {
  links: InterestSubjectLink[];
  /** Convenience: character ids from links */
  relatedCharacterIds: string[];
  /** True when the text is about the user's own interest (even if no self card). */
  isAboutUser: boolean;
};

const FIRST_PERSON_RE =
  /\b(i|i'm|i’m|i am|i've|i’ve|my|me)\b.{0,60}\b(love|into|interested|hobby|hobbies|passionate|avid|watch|play|learn|learning|wish to|make it a habit|fan of|big .+ fan)\b/i;

const FIRST_PERSON_SHORT_RE =
  /\b(i'm|i’m|i am)\s+(an?\s+)?(avid|big)\b|\bi wish to\b|\bi also (watch|play|do)\b/i;

export function isFirstPersonInterestText(evidence: string, context = ''): boolean {
  const blob = `${evidence}\n${context}`.trim();
  if (!blob) return false;
  return FIRST_PERSON_RE.test(blob) || FIRST_PERSON_SHORT_RE.test(blob);
}

export function characterAttributedInInterestText(
  name: string,
  evidence: string,
  context = '',
): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  const blob = `${evidence}\n${context}`;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `\\b${escaped}(?:'s|’s)?\\s+(?:hobby|hobbies|interest|interests|loves?|likes?|into|enjoys?)\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:hobby|hobbies|interest|interests|loves?|likes?|into|enjoys?)\\s+(?:of|for)\\s+${escaped}\\b`,
      'i',
    ),
    new RegExp(`\\b${escaped}\\s+(?:is|was)\\s+(?:into|interested in|passionate about)\\b`, 'i'),
  ];
  return patterns.some((re) => re.test(blob));
}

/** "Mom and I both love X" / "we watch anime together" near a named person. */
export function characterSharedInterestWithUser(
  name: string,
  evidence: string,
  context = '',
): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  const blob = `${evidence}\n${context}`;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `\\b${escaped}\\s+and\\s+i\\b.{0,40}\\b(both\\s+)?(love|like|enjoy|into|watch|play|do)\\b`,
      'i',
    ),
    new RegExp(
      `\\bi\\s+and\\s+${escaped}\\b.{0,40}\\b(both\\s+)?(love|like|enjoy|into|watch|play|do)\\b`,
      'i',
    ),
    new RegExp(
      `\\b(we|us)\\b.{0,40}\\b(both\\s+)?(love|like|enjoy|into|watch|play|do).{0,40}\\b${escaped}\\b`,
      'i',
    ),
    new RegExp(
      `\\b${escaped}\\b.{0,40}\\b(together|with\\s+me|and\\s+me)\\b.{0,40}\\b(love|like|enjoy|into|watch|play|do)?`,
      'i',
    ),
    new RegExp(
      `\\b(together\\s+with|with)\\s+${escaped}\\b.{0,40}\\b(love|like|enjoy|into|watch|play|do)\\b`,
      'i',
    ),
  ];
  return patterns.some((re) => re.test(blob));
}

async function findSelfCharacterId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('user_id', userId)
    .contains('metadata', { is_self: true })
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

function evidenceSnippet(evidence: string, text: string): string {
  const raw = (evidence || text || '').trim();
  return raw.length > 240 ? `${raw.slice(0, 237)}…` : raw;
}

/**
 * Resolve who an interest is about and how it relates to the user's story.
 * - First-person (no shared cue) → self only
 * - Shared ("Mom and I both…") → self + other with stance shared
 * - Explicit third-person ("Mom loves knitting") → that person only
 * - Otherwise → no character links (stays as global user interest growth)
 */
export async function resolveInterestSubjects(
  userId: string,
  text: string,
  evidence: string,
  coMentionedIds: string[],
): Promise<InterestSubjectResolution> {
  const snippet = evidenceSnippet(evidence, text);
  const firstPerson = isFirstPersonInterestText(evidence, text);
  const selfId = await findSelfCharacterId(userId);

  const links: InterestSubjectLink[] = [];
  const push = (link: InterestSubjectLink) => {
    if (links.some((l) => l.characterId === link.characterId)) return;
    links.push(link);
  };

  let sharedHits = 0;
  let explicitHits = 0;

  if (coMentionedIds.length > 0) {
    const { data: rows } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId)
      .in('id', coMentionedIds);

    for (const row of rows ?? []) {
      if ((row.metadata as Record<string, unknown> | null)?.is_self === true) continue;
      const names = [row.name, ...((row.alias as string[] | null) ?? [])].filter(Boolean) as string[];
      const shared = names.some((name) => characterSharedInterestWithUser(name, evidence, text));
      const attributed = names.some((name) =>
        characterAttributedInInterestText(name, evidence, text),
      );
      if (shared) {
        sharedHits += 1;
        push({
          characterId: row.id as string,
          reason: 'shared_with_user',
          stance: 'shared',
          evidence: snippet,
        });
      } else if (attributed) {
        explicitHits += 1;
        push({
          characterId: row.id as string,
          reason: 'explicit_attribution',
          stance: 'other_person',
          evidence: snippet,
        });
      }
    }
  }

  // Shared interests also belong on the user's self card.
  if (sharedHits > 0 && selfId) {
    push({
      characterId: selfId,
      reason: 'shared_with_user',
      stance: 'shared',
      evidence: snippet,
    });
  }

  // Pure first-person (no explicit/shared other) → self only. Never attach co-mentions.
  if (firstPerson && sharedHits === 0 && explicitHits === 0) {
    if (selfId) {
      return {
        links: [
          {
            characterId: selfId,
            reason: 'first_person_self',
            stance: 'self',
            evidence: snippet,
          },
        ],
        relatedCharacterIds: [selfId],
        isAboutUser: true,
      };
    }
    return { links: [], relatedCharacterIds: [], isAboutUser: true };
  }

  return {
    links,
    relatedCharacterIds: links.map((l) => l.characterId),
    isAboutUser: firstPerson || sharedHits > 0,
  };
}

/** Back-compat wrapper used by call sites that only need ids. */
export async function resolveInterestRelatedCharacterIds(
  userId: string,
  text: string,
  evidence: string,
  coMentionedIds: string[],
): Promise<string[]> {
  const resolved = await resolveInterestSubjects(userId, text, evidence, coMentionedIds);
  return resolved.relatedCharacterIds;
}

export function attributionReasonLabel(reason?: InterestAttributionReason | string): string {
  switch (reason) {
    case 'first_person_self':
      return 'You said this about yourself';
    case 'explicit_attribution':
      return 'You attributed this to them';
    case 'shared_with_user':
      return 'Shared with you';
    case 'user_dismissed':
      return 'Removed from this person';
    case 'co_mention_pollution_repair':
      return 'Removed — was wrongly linked from your own interest';
    case 'user_dismissed':
      return 'You removed this — LoreBook won’t re-add it from chats';
    case 'user_restored':
      return 'You restored this link';
    default:
      return 'From your chats';
  }
}
