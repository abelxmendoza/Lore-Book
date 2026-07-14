/**
 * Response mode resolution — chat vs focused recall vs audit vs debug.
 *
 * The critical rule: corrections ("you forgot X") and normal memory questions
 * are CHAT-facing modes. Diagnostics and audits only fire when the user
 * explicitly asks for system internals.
 */

import type { ResponseMode } from './responseScopeTypes';

/** Explicit requests for retrieval internals — the only path to debug output. */
const DEBUG_INSPECTOR_RE =
  /\b(why did you (retrieve|remember|pull|surface|bring up)|show (me )?(the )?(sources?|retrieval|provenance|debug|diagnostics?)\b|debug (mode|inspector)|memory layers?\b|system state)\b/i;

/** Explicit requests for exhaustive inventories. */
const AUDIT_RE =
  /\b(show me everything (you|lorebook) (know|knows|have|has)|everything you know about|recall everything|full (audit|memory|character) (report|dump|list)|list (all|every) (character|memor|person|entit))/i;

const SUMMARY_RE = /\b(summar(y|ize|ise)|recap|tl;?dr)\b/i;

/** Memory questions that deserve a focused, grounded answer. */
const FOCUSED_RECALL_RE =
  /\b(who(?:'s| is| are| was| were)\b|what do (you|i) (know|remember)|do you (remember|know)|what('s| is) my\b|where (do|did) i\b|when (did|was)\b|what am i\b|remind me\b|what did i (say|tell)\b)/i;

/** Corrections to a previous answer — always conversational, never diagnostic. */
export const CORRECTION_RE =
  /\b(you (forgot|missed|left out|skipped)|don'?t forget|you'?re missing|(that|this) (is|was) (wrong|incorrect)|actually,? (it|that|he|she|they)\b|not (accurate|right|correct)\b)/i;

export function resolveResponseMode(message: string): ResponseMode {
  const text = message.trim();
  // Corrections are checked before debug patterns: "you forgot X" must update
  // the answer, not dump retrieval internals.
  if (CORRECTION_RE.test(text)) return 'focused_recall';
  if (AUDIT_RE.test(text)) return 'audit';
  if (DEBUG_INSPECTOR_RE.test(text)) return 'debug_inspector';
  if (SUMMARY_RE.test(text)) return 'summary';
  if (FOCUSED_RECALL_RE.test(text)) return 'focused_recall';
  return 'chat';
}

export function isChatFacingMode(mode: ResponseMode): boolean {
  return mode === 'chat' || mode === 'focused_recall' || mode === 'summary';
}
