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
  | 'household_write_request'
  | 'romance_write_request'
  | 'event_write_request'
  | 'life_arc_write_request';

// General-purpose ReDoS-safe "short filler phrase" token pattern, replacing
// every `.{0,N}` / `.{1,N}` construct below that sat directly against a
// `\s+`/`\b` boundary — `.` also matches whitespace, so a dot-group
// immediately followed by `\s+`/`\b` has to try every possible split point
// across a run of whitespace, which CodeQL flags as a polynomial-time ReDoS
// risk on uncontrolled chat-message input (same class of bug as NAME_TOKENS
// and HOUSEHOLD_PHRASE_TOKENS further down, generalized here for the many
// other write-detectors in this file that predate that fix). A token class
// that never matches whitespace itself removes the ambiguity entirely,
// regardless of how many words it's bounded to.
function phraseTokens(maxExtraWords: number): string {
  return `[a-zA-Z0-9][a-zA-Z0-9'’./&+-]*?(?:\\s+[a-zA-Z0-9][a-zA-Z0-9'’./&+-]*?){0,${maxExtraWords}}?`;
}
const PHRASE_TINY = phraseTokens(2); // ~replaces .{0,20}/.{1,20}
const PHRASE_SHORT = phraseTokens(4); // ~replaces .{0,40}/.{1,40}
const PHRASE_MED = phraseTokens(7); // ~replaces .{1,60}
const PHRASE_LONG = phraseTokens(12); // ~replaces .{1,80}/.{0,80}

/**
 * Same shape, but for a `.{0,N}` used as an optional inter-clause FILLER gap
 * (e.g. `word\b.{0,40}\bword`) rather than a captured name/entity phrase.
 * `.` also matches whitespace, so the original naturally absorbed both the
 * words AND the separating spaces up to the next literal; a word-token class
 * can't do that in one step, so this puts a MANDATORY trailing `\s+` after
 * 0-N optional "space + word" repetitions — that's what actually reaches the
 * next required literal, since word tokens alone stop right at the end of
 * the last word, one space short of it.
 */
function fillerGap(maxExtraWords: number): string {
  return `(?:\\s+[a-zA-Z0-9][a-zA-Z0-9'’./&+-]*?){0,${maxExtraWords}}\\s+`;
}

/**
 * A captured phrase where the ORIGINAL had an explicit `\s+` before it but
 * only a `\b` (no explicit `\s+`) after — e.g. `\s+(.{1,80})\b(from|to)`.
 * Word tokens alone stop right at the end of the last word, one space short
 * of the next literal, so this bakes the same mandatory trailing `\s+` in.
 */
function phraseThenGap(maxExtraWords: number): string {
  return `${phraseTokens(maxExtraWords)}\\s+`;
}

/**
 * Deliberately narrow: a window/thread-scoped noun ("in this story/thread/
 * chat/conversation", "so far") combined with a new-vs-returning signal.
 * Distinct in shape from CHARACTER_LIST_RE (apps/server's whole-life roster
 * pattern, "who's in my story") — that pattern does not match this shape.
 */
const CAST_ROSTER_RE = new RegExp(
  `\\b(who(?:'s| is| are)?\\s+(?:new|returning|recurring)\\b${fillerGap(4)}\\b(this (story|thread|chat|conversation)|so far)\\b)`,
  'i',
);
const CAST_ROSTER_NEW_VS_RETURNING_RE = new RegExp(
  `\\bnew\\s+(?:vs\\.?|versus|or)\\s+returning\\b${fillerGap(4)}\\b(people|characters|cast)\\b`,
  'i',
);
const CAST_ROSTER_MENTIONED_RE = new RegExp(
  `\\bwho(?:'s| have i)\\b${fillerGap(2)}\\b(mentioned|introduced|talked about)\\b${fillerGap(2)}\\bin this (story|thread|chat)\\b`,
  'i',
);
const CAST_ROSTER_RECOGNIZE_RE = new RegExp(
  `\\b(who(?:'s| do i)?\\s+(?:recognize|seen before|know already))\\b${fillerGap(4)}\\b(this (story|thread|chat|conversation))\\b`,
  'i',
);

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

const CHARACTER_BOOK_WRITE_RE = new RegExp(
  `\\b(make sure|please make sure|be sure|can you)${fillerGap(9)}\\b(in|added to|saved (?:in|to)|goes into|is in) my (character book|characters book|lorebook of characters)\\b`,
  'i',
);
const CHARACTER_BOOK_WRITE_SHORT_RE =
  /\b(add|save|put) (them|these|him|her|it|everyone) (all )?(to|in|into) my (character book|characters book)\b/i;
const CHARACTER_BOOK_ADD_NAMED_RE = new RegExp(
  `\\b(add|save|put)\\s+${phraseThenGap(11)}\\b(to|in|into)\\s+my\\s+(character book|characters book)\\b`,
  'i',
);
const CHARACTER_BOOK_DELETE_RE = new RegExp(
  `\\b(delete|remove)\\s+${phraseThenGap(11)}\\b(from\\s+)?my\\s+(character book|characters book|characters)\\b|\\b(delete|remove)\\s+(?:the\\s+)?(?:person|character)\\s+.{1,60}$`,
  'i',
);
const CHARACTER_BOOK_RENAME_RE = new RegExp(
  `\\b(rename)\\s+(?:the\\s+)?(?:person|character)\\s+${phraseThenGap(7)}\\bto\\b\\s+.{1,60}$`,
  'i',
);

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
const GROUP_ADD_MEMBERS_RE = new RegExp(
  `\\badd\\s+(?:${phraseThenGap(12)})?\\bto\\s+(?:the|that|this|my)\\s+(?:group|crew|squad|org(?:anization)?)\\b`,
  'i',
);
const GROUP_ROSTER_CUE_RE =
  /\b(?:so far we have|here(?:'s| is) the roster|roster(?:\s+is|:)|members?(?:\s+are|\s+include|:)|the members)\b/i;
const GROUP_DELETE_RE = new RegExp(
  `\\b(delete|remove)\\s+(?:the\\s+)?(?:group|crew|squad|org(?:anization)?)\\s+.{1,80}$|\\b(delete|remove)\\s+${phraseThenGap(12)}\\bfrom\\s+my\\s+(groups?|organizations?)\\s+book\\b`,
  'i',
);
const GROUP_HIERARCHY_NOUN = 'subgroup|department|division|branch|team|child group|job|role|position';
const GROUP_SITE_NOUN = 'location|site|office|lab|warehouse|depot';
const GROUP_RELATIONSHIP_WRITE_RE = new RegExp(
  `^(?:please\\s+)?(?:` +
    `(?:make|mark|set)\\s+${phraseTokens(12)}\\s+(?:as\\s+|a\\s+|the\\s+)?(?:${GROUP_HIERARCHY_NOUN})\\s+(?:of|under|inside|within|at|with)\\s+.{1,80}` +
    `|${phraseTokens(12)}\\s+(?:is|should be)\\s+(?:a\\s+|the\\s+)?(?:${GROUP_HIERARCHY_NOUN})\\s+(?:of|under|inside|within|at|with|for)\\s+.{1,80}` +
    `|${phraseTokens(12)}\\s+(?:belongs|sits|rolls up)\\s+(?:to|under|inside|within)\\s+.{1,80}` +
    `|(?:connect|link)\\s+${phraseTokens(12)}\\s+(?:to|with|and)\\s+.{1,80}` +
    `|(?:disconnect|unlink)\\s+${phraseTokens(12)}\\s+from\\s+.{1,80}` +
    `|(?:add|make)\\s+${phraseTokens(12)}\\s+(?:as\\s+)?(?:a\\s+)?(?:${GROUP_SITE_NOUN})\\s+(?:of|for|under)\\s+.{1,80}` +
    `|${phraseTokens(12)}\\s+has\\s+(?:a\\s+|an\\s+)?(?:${GROUP_SITE_NOUN})\\s+(?:in|at|called)\\s+.{1,80}` +
  `)[.!?]*$`,
  'i',
);

const GROUP_CLASSIFY_TYPE_NOUN =
  'family|household|company|employer|workplace|crew|band|club|community|scene|nonprofit|institution|school|brand|vendor|software|collective|martial\\s+arts|public\\s+entity|friend\\s+group|sports\\s+team|team';
const GROUP_CLASSIFY_IS_RE = new RegExp(
  `\\b(${phraseTokens(12)})\\s+(?:is|should be)\\s+(?:a\\s+|an\\s+|the\\s+)?(${GROUP_CLASSIFY_TYPE_NOUN})\\b(?!\\s+(?:of|under|inside|within|at|with|for)\\b)`,
  'i',
);
const GROUP_CLASSIFY_MARK_RE = new RegExp(
  `\\b(?:mark|set|make|classify)\\s+(${phraseTokens(12)})\\s+(?:as\\s+)?(?:a\\s+|an\\s+|the\\s+)?(${GROUP_CLASSIFY_TYPE_NOUN})\\b(?!\\s+(?:of|under|inside|within|at|with|for)\\b)`,
  'i',
);
const GROUP_STANCE_RE = new RegExp(
  `\\b(?:put|move|mark|set)\\s+(${phraseTokens(12)})\\s+(?:in(?:to)?|as|under)\\s+(?:the\\s+)?(mine|close to|their world|mentioned)\\b`,
  'i',
);
const GROUP_MEMBERSHIP_RE =
  /\b(?:i(?:'m|\s+am)?|we(?:'re|\s+are)?)\s+(?:a\s+)?(member|founder|leader|alumnus|fan|collaborator)\s+(?:of|at|with)\s+.{1,80}$/i;
const GROUP_I_BELONG_RE = /\bi\s+belong\s+to\s+.{1,80}$/i;
const GROUP_CLOSE_TO_RE = /\bi(?:'m|\s+am)\s+close\s+to\s+.{1,80}$/i;
const GROUP_FORMER_RE = /\bi\s+used\s+to\s+(?:be\s+(?:in|a member of)|belong to)\s+.{1,80}$/i;

export function isOrganizationClassificationWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    GROUP_CLASSIFY_IS_RE.test(text) ||
    GROUP_CLASSIFY_MARK_RE.test(text) ||
    GROUP_STANCE_RE.test(text) ||
    GROUP_MEMBERSHIP_RE.test(text) ||
    GROUP_I_BELONG_RE.test(text) ||
    GROUP_CLOSE_TO_RE.test(text) ||
    GROUP_FORMER_RE.test(text)
  );
}
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
    GROUP_DELETE_RE.test(text) ||
    GROUP_RELATIONSHIP_WRITE_RE.test(text) ||
    isOrganizationClassificationWriteRequest(text)
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
  `\\b(${phraseTokens(12)})\\s+is\\s+(?:a\\s+|an\\s+)?(${RECLASSIFY_TARGET})\\b\\s*[,.]?\\s*(?:not|n't)\\s+(?:a\\s+|an\\s+)?(${RECLASSIFY_SOURCE})\\b`,
  'i',
);
/** "X is not a place" / "X isn't a location" */
const RECLASSIFY_NOT_A_RE = new RegExp(
  `\\b(${phraseTokens(12)})\\s+is(?:n't|\\s+not)\\s+(?:a\\s+|an\\s+)?(${RECLASSIFY_SOURCE})\\b`,
  'i',
);
const RECLASSIFY_SHOULD_BE_RE = new RegExp(
  `\\b(${phraseTokens(12)})\\s+should\\s+be\\s+(?:a\\s+|an\\s+)?(${RECLASSIFY_TARGET})\\b`,
  'i',
);
const RECLASSIFY_MOVE_TO_RE = new RegExp(
  `\\b(?:move|reclassify|change)\\s+(${phraseTokens(12)})\\s+(?:to|into|as)\\s+(?:a\\s+|an\\s+|my\\s+|the\\s+)?(${RECLASSIFY_TARGET})(?:\\s+book)?\\b`,
  'i',
);
const RECLASSIFY_WRONG_BOOK_RE = new RegExp(
  `\\b(${phraseTokens(12)})\\s+(?:belongs\\s+in|goes\\s+(?:in|into))\\s+(?:the\\s+|my\\s+)?(${RECLASSIFY_TARGET})(?:\\s+book)?\\b`,
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

const LOCATION_CREATE_RE = new RegExp(
  `\\b(?:add|save|put|create)\\s+(${phraseTokens(12)})\\s+(?:as|to|into)\\s+(?:a\\s+|an\\s+|my\\s+)?(?:place|location)(?:\\s+book)?\\b`,
  'i',
);
const LOCATION_DELETE_RE = new RegExp(
  `\\b(?:delete|remove)\\s+(?:the\\s+)?(?:place|location)\\s+(.{1,80})$|\\b(?:delete|remove)\\s+(${phraseTokens(12)})\\s+from\\s+(?:my\\s+)?(?:places?|locations?)(?:\\s+book)?\\b`,
  'i',
);
const LOCATION_RENAME_RE = new RegExp(
  `\\b(?:rename)\\s+(?:the\\s+)?(?:place|location)\\s+(${phraseTokens(7)})\\s+to\\s+(.{1,60})$`,
  'i',
);
const LOCATION_UPDATE_ALIASES_RE = new RegExp(
  `\\b(?:also\\s+called|alias(?:es)?\\s+(?:for|of)|add\\s+alias(?:es)?\\s+(?:for|to))\\s+(${phraseTokens(7)})\\b`,
  'i',
);

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

const PROJECT_CREATE_RE = new RegExp(
  `\\b(?:add|save|put|create)\\s+(${phraseTokens(12)})\\s+(?:as|to|into)\\s+(?:a\\s+|an\\s+|my\\s+)?project(?:\\s+book)?\\b`,
  'i',
);
const PROJECT_DELETE_RE = new RegExp(
  `\\b(?:delete|remove)\\s+(?:the\\s+)?project\\s+(.{1,80})$|\\b(?:delete|remove)\\s+(${phraseTokens(12)})\\s+from\\s+(?:my\\s+)?projects?(?:\\s+book)?\\b`,
  'i',
);
const PROJECT_RENAME_RE = new RegExp(
  `\\b(?:rename)\\s+(?:the\\s+)?project\\s+(${phraseTokens(7)})\\s+to\\s+(.{1,60})$`,
  'i',
);

export function isProjectWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isEntityReclassifyWriteRequest(text)) return false;
  return PROJECT_CREATE_RE.test(text) || PROJECT_DELETE_RE.test(text) || PROJECT_RENAME_RE.test(text);
}

const SKILL_CREATE_RE = new RegExp(
  `\\b(?:add|save|put|create)\\s+(${phraseTokens(12)})\\s+(?:as|to|into)\\s+(?:a\\s+|an\\s+|my\\s+)?skill(?:\\s+book)?\\b`,
  'i',
);
const SKILL_DELETE_RE = new RegExp(
  `\\b(?:delete|remove)\\s+(?:the\\s+)?skill\\s+(.{1,80})$|\\b(?:delete|remove)\\s+(${phraseTokens(12)})\\s+from\\s+(?:my\\s+)?skills?(?:\\s+book)?\\b`,
  'i',
);
const SKILL_RENAME_RE = new RegExp(
  `\\b(?:rename)\\s+(?:the\\s+)?skill\\s+(${phraseTokens(7)})\\s+to\\s+(.{1,60})$`,
  'i',
);
const SKILL_MERGE_RE =
  /\b(?:merge|fold)\s+(?:the\s+)?(?:skill\s+)?([a-zA-Z][a-zA-Z0-9'’./&+-]*(?:\s+[a-zA-Z][a-zA-Z0-9'’./&+-]*){0,5})\s+into\s+(?:the\s+)?(?:skill\s+)?([a-zA-Z][a-zA-Z0-9'’./&+-]*(?:\s+[a-zA-Z][a-zA-Z0-9'’./&+-]*){0,5})\b/i;

export function isSkillWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isEntityReclassifyWriteRequest(text)) return false;
  return (
    SKILL_CREATE_RE.test(text) ||
    SKILL_DELETE_RE.test(text) ||
    SKILL_RENAME_RE.test(text) ||
    SKILL_MERGE_RE.test(text)
  );
}

const QUEST_CREATE_RE = new RegExp(
  `\\b(?:add|save|put|create)\\s+(${phraseTokens(12)})\\s+(?:as|to|into)\\s+(?:a\\s+|an\\s+|my\\s+)?quest(?:\\s+log)?\\b`,
  'i',
);
const QUEST_DELETE_RE = new RegExp(
  `\\b(?:delete|remove)\\s+(?:the\\s+)?quest\\s+(.{1,80})$|\\b(?:delete|remove)\\s+(${phraseTokens(12)})\\s+from\\s+(?:my\\s+)?quests?(?:\\s+log)?\\b`,
  'i',
);
const QUEST_RENAME_RE = new RegExp(
  `\\b(?:rename)\\s+(?:the\\s+)?quest\\s+(${phraseTokens(7)})\\s+to\\s+(.{1,60})$`,
  'i',
);
const QUEST_STATUS_RE = new RegExp(
  `\\b(?:mark|set)\\s+(?:the\\s+)?quest\\s+(${phraseTokens(7)})\\s+(?:as\\s+)?(active|blocked|done|completed|cancelled|paused)\\b`,
  'i',
);

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

// Bounded, unambiguous "1-4 name-like words" — no lazy `.{1,60}?` next to a
// `\s+` boundary, which CodeQL flags as a polynomial-time ReDoS risk on
// uncontrolled (chat-message) input: `.` also matches whitespace, so a lazy
// dot-group immediately followed by `\s+` has to try every possible split
// point across a run of whitespace. A token class that never matches
// whitespace itself removes that ambiguity entirely.
// Lazy throughout (`*?`/`{0,3}?`) so this prefers the SHORTEST valid name —
// matching the original `.{1,60}?` semantics of deferring an optional
// trailing word ("'s", "as", "my") to its own group instead of swallowing it
// into the name. Laziness doesn't reopen the ReDoS risk: safety here comes
// from the token class never overlapping `\s`, not from greedy vs lazy.
const NAME_TOKENS = `[a-zA-Z][a-zA-Z'’.-]*?(?:\\s+[a-zA-Z][a-zA-Z'’.-]*?){0,3}?`;
const FAMILY_WRITE_RE = new RegExp(
  `\\b(?:mark|set|add)\\s+(${NAME_TOKENS})\\s+(?:as\\s+)?(?:my\\s+)?(mom|mother|dad|father|brother|sister|cousin|uncle|aunt|grandma|grandmother|grandpa|grandfather|sibling|parent|child|son|daughter|niece|nephew)\\b`,
  'i',
);
const FAMILY_ADD_MEMBER_RE = new RegExp(
  `\\badd\\s+(${NAME_TOKENS})\\s+(?:to|into)\\s+(?:my\\s+)?(?:family(?:\\s+tree)?|kin)\\b`,
  'i',
);
/** "change/set/correct Abuela's side to paternal" — side-only correction, no relation change. */
const FAMILY_SIDE_RE = new RegExp(
  `\\b(?:change|set|correct)\\s+(${NAME_TOKENS})(?:'s)?\\s+side\\s+to\\s+(maternal|paternal|both|other)\\b`,
  'i',
);
/** "remove/exclude X from my family (tree)" — soft, reversible (keeps the Character card). */
const FAMILY_EXCLUDE_RE = new RegExp(
  `\\b(?:remove|exclude)\\s+(${NAME_TOKENS})\\s+from\\s+(?:my\\s+)?family(?:\\s+tree)?\\b`,
  'i',
);
/**
 * "delete X" / "delete X from my family tree" / "remove X entirely" — a real,
 * cascading, permanent character delete. Deliberately distinct in shape from
 * FAMILY_EXCLUDE_RE (bare "remove X from my family tree" is the soft one) and
 * from CHARACTER_BOOK_DELETE_RE ("delete X from my character book"): the bare
 * form is capped at 4 name-shaped tokens and anchored to end-of-string so it
 * can't swallow an unrelated trailing clause, and the "family" form requires
 * the literal word "family" so it never matches a character-book delete.
 */
const FAMILY_DELETE_BARE_RE = new RegExp(`\\bdelete\\s+(${NAME_TOKENS})[.!]?$`, 'i');
const FAMILY_DELETE_WITH_FAMILY_RE = new RegExp(
  `\\bdelete\\s+(${NAME_TOKENS})\\s+from\\s+(?:my\\s+)?family(?:\\s+tree)?\\s*[.!]?$`,
  'i',
);
const FAMILY_DELETE_ENTIRELY_RE = new RegExp(
  `\\bremove\\s+(${NAME_TOKENS})\\s+(?:entirely|permanently|as\\s+a\\s+(?:character|person)|for\\s+good)\\b`,
  'i',
);

export function isFamilyWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    FAMILY_WRITE_RE.test(text) ||
    FAMILY_ADD_MEMBER_RE.test(text) ||
    FAMILY_SIDE_RE.test(text) ||
    FAMILY_EXCLUDE_RE.test(text) ||
    FAMILY_DELETE_BARE_RE.test(text) ||
    FAMILY_DELETE_WITH_FAMILY_RE.test(text) ||
    FAMILY_DELETE_ENTIRELY_RE.test(text)
  );
}

// Household names/addresses run longer than person names (e.g. "Mom and
// Dad's House", "456 Oak Ave"), so this token class allows 1-6 words and
// digits, but keeps the same ReDoS-safe shape as NAME_TOKENS above: no lazy
// `.{1,80}?` next to a `\s+` boundary.
const HOUSEHOLD_PHRASE_TOKENS = `[a-zA-Z0-9][a-zA-Z0-9'’.-]*?(?:\\s+[a-zA-Z0-9][a-zA-Z0-9'’.-]*?){0,5}?`;
const HOUSEHOLD_CREATE_RE = new RegExp(
  `\\bcreate\\s+(?:a\\s+)?household\\s+(?:called|named)\\s+(${HOUSEHOLD_PHRASE_TOKENS})\\b`,
  'i',
);
const HOUSEHOLD_ADD_MEMBER_RE = new RegExp(
  `\\badd\\s+(${HOUSEHOLD_PHRASE_TOKENS})\\s+to\\s+(?:the\\s+)?(${HOUSEHOLD_PHRASE_TOKENS})\\s+household\\b`,
  'i',
);
const HOUSEHOLD_REMOVE_MEMBER_RE = new RegExp(
  `\\b(?:remove\\s+(${HOUSEHOLD_PHRASE_TOKENS})\\s+from|(${HOUSEHOLD_PHRASE_TOKENS})\\s+moved\\s+out\\s+of)\\s+(?:the\\s+)?(${HOUSEHOLD_PHRASE_TOKENS})\\s+household\\b`,
  'i',
);
const HOUSEHOLD_MOVE_RE = new RegExp(
  `\\bmove\\s+(?:the\\s+)?(${HOUSEHOLD_PHRASE_TOKENS})\\s+household\\s+to\\s+(${HOUSEHOLD_PHRASE_TOKENS})\\b`,
  'i',
);
const HOUSEHOLD_DELETE_RE = new RegExp(`\\bdelete\\s+(?:the\\s+)?(${HOUSEHOLD_PHRASE_TOKENS})\\s+household\\b`, 'i');

export function isHouseholdWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    HOUSEHOLD_CREATE_RE.test(text) ||
    HOUSEHOLD_ADD_MEMBER_RE.test(text) ||
    HOUSEHOLD_REMOVE_MEMBER_RE.test(text) ||
    HOUSEHOLD_MOVE_RE.test(text) ||
    HOUSEHOLD_DELETE_RE.test(text)
  );
}

const ROMANCE_STATUS_RE = new RegExp(
  `\\b(?:mark|set|make)\\s+(${phraseTokens(7)})\\s+(?:(?:as|to)\\s+)?(dating|ex|broke\\s*up|breakup|no\\s*contact|complicated|crush|partner|married|ended|ending|on\\s*(?:a\\s*)?break|paused|ghosted|blocked|unrequited|fading|faded|rekindled|active|inactive)\\b`,
  'i',
);
const ROMANCE_BREAKUP_RE =
  /\b(?:we\s+)?(?:broke\s*up|ended\s+(?:things|it)|are\s+no\s+longer\s+dating)\s+(?:with\s+)?(.{1,60})$/i;
const ROMANCE_LIFECYCLE_RE =
  /\b(.{1,60}?)\s+(?:and\s+i|and\s+me)?\s*(?:are|is|got|and\s+i\s+are)\s+(on\s*(?:a\s*)?break|complicated|paused|ghosted|blocked|unrequited|fading|faded|back\s*together|rekindled)\b/i;
const ROMANCE_DELETE_RE =
  /\b(?:delete|remove)\s+(?:the\s+)?(?:romance|relationship|dating)\s+(?:record\s+)?(?:for|with)\s+(.{1,60})$/i;

export function isRomanceWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    ROMANCE_STATUS_RE.test(text) ||
    ROMANCE_BREAKUP_RE.test(text) ||
    ROMANCE_LIFECYCLE_RE.test(text) ||
    ROMANCE_DELETE_RE.test(text)
  );
}

const EVENT_POST_RE =
  /\b(?:post|add|save|create)\s+(?:an?\s+)?(?:life\s*log\s+)?event\b/i;
const EVENT_PLAYED_AT_RE = new RegExp(
  `\\b(?:we|i)\\s+(?:played|hosted|threw)\\s+(?:a\\s+|an\\s+|the\\s+)?(${phraseTokens(12)})\\s+(?:at|@)\\s+.{1,60}$`,
  'i',
);
const EVENT_NAMED_HAPPENING_RE =
  /\b(?:we|i)\s+(?:went\s+to|had)\s+(?:a\s+|an\s+|the\s+)?(?:show|gig|concert|party|festival|event|birthday|wedding|meetup|open\s*mic)\s+(?:at|@)\s+.{1,60}$/i;
const EVENT_SAVE_AT_RE = new RegExp(
  `\\b(?:save|add|post)\\s+(?:an?\\s+)?event\\s+(?:called\\s+|named\\s+)?(${phraseTokens(12)})\\s+(?:at|@)\\s+.{1,60}$`,
  'i',
);

export function isEventWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isLocationWriteRequest(text) || isProjectWriteRequest(text) || isOrganizationGroupWriteRequest(text)) {
    return false;
  }
  return (
    EVENT_POST_RE.test(text) ||
    EVENT_PLAYED_AT_RE.test(text) ||
    EVENT_NAMED_HAPPENING_RE.test(text) ||
    EVENT_SAVE_AT_RE.test(text)
  );
}

const LIFE_ARC_RENAME_RE = new RegExp(
  `\\b(?:rename)\\s+(?:the\\s+|my\\s+)?arc\\s+(${phraseTokens(7)})\\s+to\\s+(.{1,60})$`,
  'i',
);
const LIFE_ARC_RELANE_RE = new RegExp(
  `\\b(?:move|put)\\s+(?:the\\s+|my\\s+)?arc\\s+(${phraseTokens(7)})\\s+(?:to|into)\\s+(?:my\\s+|the\\s+)?(${phraseTokens(3)})\\s+lane\\b`,
  'i',
);
const LIFE_ARC_REDATE_RE = new RegExp(
  `\\b(?:set|change)\\s+(?:the\\s+)?(?:dates?|time\\s*frame|when)\\s+(?:of|for)\\s+(?:the\\s+|my\\s+)?arc\\s+(${phraseTokens(7)})\\s+to\\s+(.{1,60})$`,
  'i',
);

export function isLifeArcWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isEntityReclassifyWriteRequest(text)) return false;
  return LIFE_ARC_RENAME_RE.test(text) || LIFE_ARC_RELANE_RE.test(text) || LIFE_ARC_REDATE_RE.test(text);
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
  if (isHouseholdWriteRequest(message)) {
    return { closedScope: true, reason: 'household_write_request' };
  }
  if (isRomanceWriteRequest(message)) {
    return { closedScope: true, reason: 'romance_write_request' };
  }
  if (isEventWriteRequest(message)) {
    return { closedScope: true, reason: 'event_write_request' };
  }
  if (isLifeArcWriteRequest(message)) {
    return { closedScope: true, reason: 'life_arc_write_request' };
  }
  if (isCastRosterQuery(message)) return { closedScope: true, reason: 'cast_roster_query' };
  if (isCharacterBookWriteRequest(message)) return { closedScope: true, reason: 'character_book_write_request' };
  return { closedScope: false };
}

/**
 * Whether a pinned focus entity is actually relevant to the current message
 * — a plain substring check against the entity's name/aliases. Used to gate
 * whether a stale focus chip's entityContext gets attached to an outgoing
 * closed-scope message. Named-subject conflicts are handled separately by
 * `messageConflictsWithPinnedFocus`.
 */
export function isFocusEntityRelevant(message: string, focusEntityName: string, aliases: string[] = []): boolean {
  const names = [focusEntityName, ...aliases].filter(Boolean).map((n) => n.toLowerCase());
  if (names.length === 0) return false;
  const text = message.toLowerCase();
  return names.some((n) => n.length > 1 && text.includes(n));
}

const PRONOUN_PERSON_QUERY_RE =
  /\bwho\s+(?:is|was|are|were)\s+(he|she|they|him|her|them)\b/i;

const TALK_ABOUT_RE =
  /\bI want to (?:talk|tell you) about\s+(.+?)(?:\s+as a romantic interest)?(?:\.|,|;|Help me\b|$)/i;

const WHO_IS_NAMED_RE =
  /\bwho\s+(?:is|was|are|were)\s+([A-ZÁÉÍÓÚÑ][\w.'-]{1,40}(?:\s+(?:de|del|la|los|las|y|van|von|di|da|le|el|the|a|an|T[ií]o|T[ií]a)\s+[A-ZÁÉÍÓÚÑ][\w.'-]{1,40}|\s+[A-ZÁÉÍÓÚÑ][\w.'-]{1,40}){0,6})/;

const PRONOUN_SUBJECTS = new Set([
  'he', 'she', 'they', 'him', 'her', 'them', 'his', 'hers', 'their', 'it',
]);

export function isPronounPersonQuery(message: string): boolean {
  return PRONOUN_PERSON_QUERY_RE.test(message.trim());
}

export function parseTalkAboutSubject(message: string): string | null {
  const match = message.match(TALK_ABOUT_RE);
  const raw = match?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  if (!raw || PRONOUN_SUBJECTS.has(raw.toLowerCase())) return null;
  return raw.replace(/\s+Help me\b.*$/i, '').trim() || null;
}

export function parseNamedWhoIsSubject(message: string): string | null {
  const match = message.match(WHO_IS_NAMED_RE);
  const raw = match?.[1]?.replace(/[?.!,]+$/g, '').trim() ?? '';
  if (!raw || PRONOUN_SUBJECTS.has(raw.toLowerCase())) return null;
  return raw;
}

export function parseNamedChatSubject(message: string): string | null {
  return parseTalkAboutSubject(message) || parseNamedWhoIsSubject(message);
}

export function subjectNamesMatch(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  const leftFirst = left.split(/\s+/)[0] ?? '';
  const rightFirst = right.split(/\s+/)[0] ?? '';
  if (leftFirst.length >= 3 && leftFirst === rightFirst) return true;
  if (left.length >= 4 && right.includes(left)) return true;
  if (right.length >= 4 && left.includes(right)) return true;
  return false;
}

/**
 * True when the message names a different person than the pinned focus chip.
 * Pronoun queries ("who is he") are not a named conflict by themselves.
 */
export function messageConflictsWithPinnedFocus(
  message: string,
  focusEntityName: string,
  aliases: string[] = [],
): boolean {
  const named = parseNamedChatSubject(message);
  if (!named) return false;
  const pins = [focusEntityName, ...aliases].filter(Boolean);
  if (pins.length === 0) return false;
  return !pins.some((pin) => subjectNamesMatch(named, pin));
}
