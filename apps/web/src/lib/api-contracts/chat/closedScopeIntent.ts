/**
 * Shared closed-scope query predicates — imported by both apps/web and
 * apps/server via @lorebook/api-contracts, so routing decisions made on the
 * client (which context to attach) and the server (which mode to route to,
 * which evidence to accept) stay in lockstep off one definition.
 */

export type ClosedScopeReason = 'cast_roster_query' | 'entity_query' | 'character_book_write_request';

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

export function isCharacterBookWriteRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return CHARACTER_BOOK_WRITE_RE.test(text) || CHARACTER_BOOK_WRITE_SHORT_RE.test(text);
}

export function isClosedScopeQuery(message: string): { closedScope: boolean; reason?: ClosedScopeReason } {
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
