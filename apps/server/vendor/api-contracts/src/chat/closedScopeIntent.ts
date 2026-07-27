/**
 * Shared closed-scope query predicates — imported by both apps/web and
 * apps/server via @lorebook/api-contracts, so routing decisions made on the
 * client (which context to attach) and the server (which mode to route to,
 * which evidence to accept) stay in lockstep off one definition.
 */

export type ClosedScopeReason =
  | 'cast_roster_query'
  | 'entity_query'
  | 'character_book_write_request'
  | 'organization_group_write_request'
  | 'entity_reclassify_write_request'
  | 'location_write_request'
  | 'project_write_request'
  | 'skill_write_request'
  | 'quest_write_request'
  | 'family_write_request'
  | 'romance_write_request';

/**
 * Deliberately narrow: a window/thread-scoped noun ("in this story/thread/
 * chat/conversation", "so far") combined with a new-vs-returning signal.
 * Distinct in shape from CHARACTER_LIST_RE (apps/server's whole-life roster
 * pattern, "who's in my story") — that pattern does not match this shape.
 */
const CAST_ROSTER_RE =
  /\b(who(?:'s| is| are)?\s+(?:new|returning|recurring)\b.{0,40}\b(this (story|thread|chat|conversation)|so far)\b)/i;
const CAST_ROSTER_NEW_VS_RETURNING_RE = /\bnew\s+(?:vs\.?|versus|or)\s+returning\b.{0,40}\b(people|characters|cast)\b/i;
const CAST_ROSTER_MENTIONED_RE =
  /\bwho(?:'s| have i)\b.{0,20}\b(mentioned|introduced|talked about)\b.{0,20}\bin this (story|thread|chat)\b/i;
const CAST_ROSTER_RECOGNIZE_RE =
  /\b(who(?:'s| do i)?\s+(?:recognize|seen before|know already))\b.{0,40}\b(this (story|thread|chat|conversation))\b/i;

export function isCastRosterQuery(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  // Providing a membership list is a group write, never a cast query.
  if (isOrganizationGroupWriteRequest(text)) return false;
  return (
    CAST_ROSTER_RE.test(text) ||
    CAST_ROSTER_NEW_VS_RETURNING_RE.test(text) ||
    CAST_ROSTER_MENTIONED_RE.test(text) ||
    CAST_ROSTER_RECOGNIZE_RE.test(text)
  );
}

const CHARACTER_BOOK_WRITE_RE =
  /\b(make sure|please make sure|be sure|can you) .{0,60}\b(in|added to|saved (?:in|to)|goes into|is in) my (character book|characters book|lorebook of characters)\b/i;
const CHARACTER_BOOK_WRITE_SHORT_RE =
  /\b(add|save|put) (them|these|him|her|it|everyone) (all )?(to|in|into) my (character book|characters book)\b/i;
const CHARACTER_BOOK_ADD_NAMED_RE =
  /\b(add|save|put)\s+.{1,80}\b(to|in|into)\s+my\s+(character book|characters book)\b/i;
const CHARACTER_BOOK_DELETE_RE =
  /\b(delete|remove)\s+.{1,80}\b(from\s+)?my\s+(character book|characters book|characters)\b|\b(delete|remove)\s+(?:the\s+)?(?:person|character)\s+.{1,60}$/i;
const CHARACTER_BOOK_RENAME_RE =
  /\b(rename)\s+(?:the\s+)?(?:person|character)\s+.{1,60}\bto\b\s+.{1,60}$/i;

export function isCharacterBookWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isEntityReclassifyWriteRequest(text)) return false;
  return (
    CHARACTER_BOOK_WRITE_RE.test(text) ||
    CHARACTER_BOOK_WRITE_SHORT_RE.test(text) ||
    CHARACTER_BOOK_ADD_NAMED_RE.test(text) ||
    CHARACTER_BOOK_DELETE_RE.test(text) ||
    CHARACTER_BOOK_RENAME_RE.test(text)
  );
}

const GROUP_CREATE_RE =
  /\b(?:make|create|start|set\s*up|spin\s*up)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(group|crew|squad|collective|clique|org(?:anization)?)\b/i;
const GROUP_FOR_RE =
  /\b(group|crew|squad|collective)\s+for\s+(?:that|this|them|her|him|those|these)\b/i;
const GROUP_ADD_MEMBERS_RE =
  /\badd\s+.{0,80}\bto\s+(?:the|that|this|my)\s+(?:group|crew|squad|org(?:anization)?)\b/i;
const GROUP_ROSTER_CUE_RE =
  /\b(?:so far we have|here(?:'s| is) the roster|roster(?:\s+is|:)|members?(?:\s+are|\s+include|:)|the members)\b/i;
const GROUP_DELETE_RE =
  /\b(delete|remove)\s+(?:the\s+)?(?:group|crew|squad|org(?:anization)?)\s+.{1,80}$|\b(delete|remove)\s+.{1,80}\bfrom\s+my\s+(groups?|organizations?)\s+book\b/i;

/** Rough count of name-like tokens in a list ("A, B, and C"). */
export function countListedNameLikeTokens(message: string): number {
  const cleaned = message
    .replace(/\b(so far we have|here(?:'s| is) the roster|roster(?:\s+is|:)|members?(?:\s+are|\s+include|:)|the members)\b/gi, ' ')
    .replace(/\b(make|create|start|set\s*up|a|an|the|new|group|crew|squad|for|that|this|them)\b/gi, ' ');
  return cleaned
    .split(/\s*,\s*|\s+and\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && /[A-Za-z]/.test(p) && !/^(also|too|etc|now|well)$/i.test(p))
    .length;
}

/**
 * Explicit "make/create a group" OR supplying a membership roster list for a
 * group that was just requested ("So far we have A, B, and C").
 */
export function isOrganizationGroupWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  // Wrong-book corrections go to reclassify, not a fresh group create.
  if (isEntityReclassifyWriteRequest(text)) return false;
  if (
    GROUP_CREATE_RE.test(text) ||
    GROUP_FOR_RE.test(text) ||
    GROUP_ADD_MEMBERS_RE.test(text) ||
    GROUP_DELETE_RE.test(text)
  ) {
    return true;
  }
  // Roster provision: list cue + at least two name-like tokens.
  if (GROUP_ROSTER_CUE_RE.test(text) && countListedNameLikeTokens(text) >= 2) {
    return true;
  }
  return false;
}

const GROUP_FOLLOW_UP_RE =
  /\b(?:i\s+)?(?:just|already)\s+gave\s+you\s+(?:the|a|that)?\s*roster\b|\byou\s+(?:already\s+)?have\s+(?:the|that)\s+roster\b|\b(?:use|add)\s+(?:that|the|those)\s+(?:roster|members|people)\b|\b(?:can|could|would|will)\s+you\s+(?:do|make|create|finish|save|try)\s+(?:(?:it|that|the group)\s*)?(?:now|again)\b|\b(?:individual|listed|those|these)\s+(?:characters?|people|members?)\b/i;

/**
 * Continue a recent group write when the user refers to the already supplied
 * roster instead of repeating every name. The history requirement prevents a
 * generic "can you do it now?" from being stolen from ordinary conversation.
 */
export function isOrganizationGroupFollowUpRequest(
  message: string,
  history: Array<{ role: string; content: string }> = [],
): boolean {
  const text = message.trim();
  if (!text || !GROUP_FOLLOW_UP_RE.test(text)) return false;
  return history.slice(-10).some((item) => {
    if (isOrganizationGroupWriteRequest(item.content)) return true;
    if (item.role !== 'assistant') return false;
    return /\b(?:created|updated|renamed|roster|name|call|deleted)\b.{0,80}\b(?:group|crew|squad|members?)\b|\b(?:group|crew|squad)\b.{0,80}\b(?:roster|members?|name|call)\b/i.test(
      item.content,
    );
  });
}

/** Target book tokens used by wrong-book reclassify phrasing. */
const RECLASSIFY_TARGET =
  'groups?|crews?|squads?|collectives?|org(?:anization)?s?|person|people|characters?|projects?|skills?|events?|places?|locations?';
const RECLASSIFY_SOURCE =
  'places?|locations?|person|people|characters?|groups?|crews?|squads?|org(?:anization)?s?|projects?|skills?|events?';

/** "X is a group, not a place" / "X is a group not a place" */
const RECLASSIFY_IS_NOT_RE = new RegExp(
  `\\b(.{1,80}?)\\s+is\\s+(?:a\\s+|an\\s+)?(${RECLASSIFY_TARGET})\\b\\s*[,.]?\\s*(?:not|n't)\\s+(?:a\\s+|an\\s+)?(${RECLASSIFY_SOURCE})\\b`,
  'i',
);
/** "X is not a place" / "X isn't a location" */
const RECLASSIFY_NOT_A_RE = new RegExp(
  `\\b(.{1,80}?)\\s+is(?:n't|\\s+not)\\s+(?:a\\s+|an\\s+)?(${RECLASSIFY_SOURCE})\\b`,
  'i',
);
const RECLASSIFY_SHOULD_BE_RE = new RegExp(
  `\\b(.{1,80}?)\\s+should\\s+be\\s+(?:a\\s+|an\\s+)?(${RECLASSIFY_TARGET})\\b`,
  'i',
);
const RECLASSIFY_MOVE_TO_RE = new RegExp(
  `\\b(?:move|reclassify|change)\\s+(.{1,80}?)\\s+(?:to|into|as)\\s+(?:a\\s+|an\\s+|my\\s+|the\\s+)?(${RECLASSIFY_TARGET})(?:\\s+book)?\\b`,
  'i',
);
const RECLASSIFY_WRONG_BOOK_RE = new RegExp(
  `\\b(.{1,80}?)\\s+(?:belongs\\s+in|goes\\s+(?:in|into))\\s+(?:the\\s+|my\\s+)?(${RECLASSIFY_TARGET})(?:\\s+book)?\\b`,
  'i',
);

/**
 * Explicit wrong-book correction: "X is a group, not a place", "move X to my
 * Groups book", "X should be a project".
 */
export function isEntityReclassifyWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  // Pure "make a group for that" stays group-write (no named entity correction).
  if (GROUP_CREATE_RE.test(text) && !/\bnot\s+(?:a\s+|an\s+)?(place|location|person|character)\b/i.test(text)) {
    return false;
  }
  return (
    RECLASSIFY_IS_NOT_RE.test(text) ||
    RECLASSIFY_NOT_A_RE.test(text) ||
    RECLASSIFY_SHOULD_BE_RE.test(text) ||
    RECLASSIFY_MOVE_TO_RE.test(text) ||
    RECLASSIFY_WRONG_BOOK_RE.test(text)
  );
}

const LOCATION_CREATE_RE =
  /\b(?:add|save|put|create)\s+(.{1,80}?)\s+(?:as|to|into)\s+(?:a\s+|an\s+|my\s+)?(?:place|location)(?:\s+book)?\b/i;
const LOCATION_DELETE_RE =
  /\b(?:delete|remove)\s+(?:the\s+)?(?:place|location)\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+(?:my\s+)?(?:places?|locations?)(?:\s+book)?\b/i;
const LOCATION_RENAME_RE =
  /\b(?:rename)\s+(?:the\s+)?(?:place|location)\s+(.{1,60}?)\s+to\s+(.{1,60})$/i;
const LOCATION_UPDATE_ALIASES_RE =
  /\b(?:also\s+called|alias(?:es)?\s+(?:for|of)|add\s+alias(?:es)?\s+(?:for|to))\s+(.{1,60})\b/i;

export function isLocationWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isEntityReclassifyWriteRequest(text)) return false;
  return (
    LOCATION_CREATE_RE.test(text) ||
    LOCATION_DELETE_RE.test(text) ||
    LOCATION_RENAME_RE.test(text) ||
    LOCATION_UPDATE_ALIASES_RE.test(text)
  );
}

const PROJECT_CREATE_RE =
  /\b(?:add|save|put|create)\s+(.{1,80}?)\s+(?:as|to|into)\s+(?:a\s+|an\s+|my\s+)?project(?:\s+book)?\b/i;
const PROJECT_DELETE_RE =
  /\b(?:delete|remove)\s+(?:the\s+)?project\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+(?:my\s+)?projects?(?:\s+book)?\b/i;
const PROJECT_RENAME_RE =
  /\b(?:rename)\s+(?:the\s+)?project\s+(.{1,60}?)\s+to\s+(.{1,60})$/i;

export function isProjectWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isEntityReclassifyWriteRequest(text)) return false;
  return PROJECT_CREATE_RE.test(text) || PROJECT_DELETE_RE.test(text) || PROJECT_RENAME_RE.test(text);
}

const SKILL_CREATE_RE =
  /\b(?:add|save|put|create)\s+(.{1,80}?)\s+(?:as|to|into)\s+(?:a\s+|an\s+|my\s+)?skill(?:\s+book)?\b/i;
const SKILL_DELETE_RE =
  /\b(?:delete|remove)\s+(?:the\s+)?skill\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+(?:my\s+)?skills?(?:\s+book)?\b/i;
const SKILL_RENAME_RE =
  /\b(?:rename)\s+(?:the\s+)?skill\s+(.{1,60}?)\s+to\s+(.{1,60})$/i;

export function isSkillWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isEntityReclassifyWriteRequest(text)) return false;
  return SKILL_CREATE_RE.test(text) || SKILL_DELETE_RE.test(text) || SKILL_RENAME_RE.test(text);
}

const QUEST_CREATE_RE =
  /\b(?:add|save|put|create)\s+(.{1,80}?)\s+(?:as|to|into)\s+(?:a\s+|an\s+|my\s+)?quest(?:\s+log)?\b/i;
const QUEST_DELETE_RE =
  /\b(?:delete|remove)\s+(?:the\s+)?quest\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+(?:my\s+)?quests?(?:\s+log)?\b/i;
const QUEST_RENAME_RE =
  /\b(?:rename)\s+(?:the\s+)?quest\s+(.{1,60}?)\s+to\s+(.{1,60})$/i;
const QUEST_STATUS_RE =
  /\b(?:mark|set)\s+(?:the\s+)?quest\s+(.{1,60}?)\s+(?:as\s+)?(active|blocked|done|completed|cancelled|paused)\b/i;

export function isQuestWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isEntityReclassifyWriteRequest(text)) return false;
  return (
    QUEST_CREATE_RE.test(text) ||
    QUEST_DELETE_RE.test(text) ||
    QUEST_RENAME_RE.test(text) ||
    QUEST_STATUS_RE.test(text)
  );
}

const FAMILY_WRITE_RE =
  /\b(?:mark|set|add)\s+(.{1,60}?)\s+(?:as\s+)?(?:my\s+)?(mom|mother|dad|father|brother|sister|cousin|uncle|aunt|grandma|grandmother|grandpa|grandfather|sibling|parent|child|son|daughter|niece|nephew)\b/i;
const FAMILY_ADD_MEMBER_RE =
  /\badd\s+(.{1,60}?)\s+(?:to|into)\s+(?:my\s+)?(?:family(?:\s+tree)?|kin)\b/i;

export function isFamilyWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return FAMILY_WRITE_RE.test(text) || FAMILY_ADD_MEMBER_RE.test(text);
}

const ROMANCE_STATUS_RE =
  /\b(?:mark|set)\s+(.{1,60}?)\s+(?:as\s+)?(dating|ex|broke\s*up|no\s*contact|complicated|crush|partner|married)\b/i;
const ROMANCE_BREAKUP_RE =
  /\b(?:we\s+)?(?:broke\s*up|ended\s+(?:things|it)|are\s+no\s+longer\s+dating)\s+(?:with\s+)?(.{1,60})$/i;
const ROMANCE_DELETE_RE =
  /\b(?:delete|remove)\s+(?:the\s+)?(?:romance|relationship|dating)\s+(?:record\s+)?(?:for|with)\s+(.{1,60})$/i;

export function isRomanceWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return ROMANCE_STATUS_RE.test(text) || ROMANCE_BREAKUP_RE.test(text) || ROMANCE_DELETE_RE.test(text);
}

export function isClosedScopeQuery(message: string): { closedScope: boolean; reason?: ClosedScopeReason } {
  if (isEntityReclassifyWriteRequest(message)) {
    return { closedScope: true, reason: 'entity_reclassify_write_request' };
  }
  if (isOrganizationGroupWriteRequest(message)) {
    return { closedScope: true, reason: 'organization_group_write_request' };
  }
  if (isLocationWriteRequest(message)) {
    return { closedScope: true, reason: 'location_write_request' };
  }
  if (isProjectWriteRequest(message)) {
    return { closedScope: true, reason: 'project_write_request' };
  }
  if (isSkillWriteRequest(message)) {
    return { closedScope: true, reason: 'skill_write_request' };
  }
  if (isQuestWriteRequest(message)) {
    return { closedScope: true, reason: 'quest_write_request' };
  }
  if (isFamilyWriteRequest(message)) {
    return { closedScope: true, reason: 'family_write_request' };
  }
  if (isRomanceWriteRequest(message)) {
    return { closedScope: true, reason: 'romance_write_request' };
  }
  if (isCastRosterQuery(message)) return { closedScope: true, reason: 'cast_roster_query' };
  if (isCharacterBookWriteRequest(message)) return { closedScope: true, reason: 'character_book_write_request' };
  return { closedScope: false };
}

/**
 * Whether a pinned focus entity is actually relevant to the current message
 * — a plain substring check against the entity's name/aliases. Used to gate
 * whether a stale focus chip's entityContext gets attached to an outgoing
 * closed-scope message; ordinary (non-closed-scope) messages never call this
 * and keep the existing "always honor the pin" behavior.
 */
export function isFocusEntityRelevant(message: string, focusEntityName: string, aliases: string[] = []): boolean {
  const names = [focusEntityName, ...aliases].filter(Boolean).map((n) => n.toLowerCase());
  if (names.length === 0) return false;
  const text = message.toLowerCase();
  return names.some((n) => n.length > 1 && text.includes(n));
}
