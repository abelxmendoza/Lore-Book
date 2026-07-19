/**
 * Client-side mention lifecycle helpers.
 * Mirrors server mentionClassifier for filtering chips when lifecycleStatus
 * is missing on older message rows.
 */

export type MentionLifecycleStatus =
  | 'RESOLVED'
  | 'UNRESOLVED'
  | 'GENERIC'
  | 'GROUP'
  | 'IGNORE';

const SELF = /^(?:you|also you|me|myself|self|the user|user)$/i;
const INDEFINITE =
  /^(?:(?:a|an|one|some|that|this|the)\s+)?(?:girl|guy|man|woman|person|dude|lady)s?$/i;
const VAGUE_COLLECTIVE =
  /^(?:(?:the|some|other|those|these|my|our)\s+)?(?:other\s+)?(?:girls|guys|people|folks|friends|coworkers|co-workers|organizers|attendees|fans|users|boys|kids|egirls|e-girls|popular egirls)(?:\s+in\s+the\s+scene)?$/i;
const TRUNCATED = /^(?:people|folks|girls|guys)\s+in(?:\s+the)?$/i;
const PROPER_NAME = /^[A-ZÀ-Ý][a-zà-ÿ'’-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]+){0,2}$/;
const CONTEXTUAL_GROUP =
  /\b(?:who|from|with|at|discussing|repost|comment|attend|members of)\b/i;

export function inferMentionLifecycleStatus(name: string): MentionLifecycleStatus {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key || SELF.test(key)) return 'IGNORE';
  if (INDEFINITE.test(key) || VAGUE_COLLECTIVE.test(key) || TRUNCATED.test(key)) return 'GENERIC';
  if (/\b(?:girls|guys|people|friends|commenters|members)\b/i.test(name) && CONTEXTUAL_GROUP.test(name)) {
    return 'GROUP';
  }
  if (/^anonymous\b/i.test(name)) return 'UNRESOLVED';
  if (PROPER_NAME.test(name.trim())) return 'RESOLVED';
  return 'UNRESOLVED';
}

export function resolveMentionLifecycleStatus(
  name: string,
  lifecycleStatus?: MentionLifecycleStatus | null,
): MentionLifecycleStatus {
  return lifecycleStatus ?? inferMentionLifecycleStatus(name);
}

export function isCastWorthyMention(
  name: string,
  lifecycleStatus?: MentionLifecycleStatus | null,
): boolean {
  return resolveMentionLifecycleStatus(name, lifecycleStatus) === 'RESOLVED';
}

export function isTranscriptMentionWorthy(
  name: string,
  lifecycleStatus?: MentionLifecycleStatus | null,
): boolean {
  const status = resolveMentionLifecycleStatus(name, lifecycleStatus);
  return status === 'RESOLVED' || status === 'UNRESOLVED' || status === 'GROUP';
}

export function isBuildingOnWorthy(
  name: string,
  lifecycleStatus?: MentionLifecycleStatus | null,
): boolean {
  return resolveMentionLifecycleStatus(name, lifecycleStatus) === 'RESOLVED';
}
