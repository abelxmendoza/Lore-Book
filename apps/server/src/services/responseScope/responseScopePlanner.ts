/**
 * Query scope planning — deterministic intent + domain detection, no LLM.
 * Produces the ResponseScopePlan that gates everything downstream.
 */

import { domainPolicyFor } from './responseDomainPolicy';
import { CORRECTION_RE, isFollowUpShaped, resolveResponseMode } from './responseModeResolver';
import type {
  ActiveConversationContext,
  EntityRef,
  ResponseScopePlan,
  ScopeIntent,
  ScopeSource,
} from './responseScopeTypes';

const WORK_INTENT_RE =
  /\b(work|job|team|teammates?|coworkers?|colleagues?|manager|boss|lead(?:s)?\b|shift|on[- ]?site|office|warehouse|employer|company i work|my (role|position|title)\b|career|employed)\b/i;
const FAMILY_INTENT_RE =
  /\b(family|families|relatives?|mom|dad|mother|father|grandm(a|other)|grandpa|grandfather|abuel[oa]|t[ií][oa]s?\b|uncle|aunt|cousins?|siblings?|brothers?|sisters?|household)\b/i;
const RELATIONSHIP_INTENT_RE =
  /\b(dating|romance|romantic|crush(es)?|girlfriend|boyfriend|partner|love life|relationship with|ex(es)?\b|situationship)\b/i;
const PROJECT_INTENT_RE = /\b(project|feature|building|shipping|codebase|repo|app i'?m (building|making)|startup)\b/i;
const PLACE_INTENT_RE = /\b(where (is|was|do|did)|place|venue|located|location of|neighborhood|city|address)\b/i;
const EVENT_INTENT_RE = /\b(event|show|concert|party|festival|happened (at|on)|that night|last (night|weekend))\b/i;
const BIOGRAPHY_INTENT_RE = /\b(my (story|life|bio|biography)|about me|who am i)\b/i;

const STOPWORD_NAMES = new Set([
  'i', 'im', "i'm", 'the', 'who', 'what', 'when', 'where', 'why', 'how', 'you',
  'my', 'me', 'is', 'was', 'are', 'and', 'or', 'on', 'at', 'in', 'a', 'an',
  'did', 'do', 'does', 'lorebook', 'ok', 'okay', 'hey', 'also', 'but',
]);

const SENTENCE_BLEED_TOKENS = new Set(['also', 'and', 'but', 'or', 'so', 'then', 'you', 'your', 'we', 'our']);

function isPlausibleEntityCandidate(name: string): boolean {
  const tokens = name.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // Acronyms such as USC are useful facts, but are not people to add to a
  // corrected roster. Organization names with normal casing still pass.
  if (name.length > 1 && name === name.toUpperCase()) return false;
  // Reject sentence bleed such as "Also You" without rejecting a legitimate
  // capitalized name that happens to begin a sentence.
  if (tokens.some((token) => SENTENCE_BLEED_TOKENS.has(token))) return false;
  return true;
}

/** Capitalized tokens/phrases likely to be proper names in the question. */
export function extractCandidateEntities(message: string): EntityRef[] {
  const found = new Map<string, EntityRef>();
  const re = /\b([A-ZÁÉÍÓÚÑ][\w'’-]+(?:\s+(?:de|del|la|los|las|y|van|von|the)?\s*[A-ZÁÉÍÓÚÑ][\w'’-]+){0,4})\b/g;
  // Skip sentence-leading capitals unless they repeat mid-sentence patterns —
  // cheap heuristic: drop candidates that are stopwords when lowercased.
  for (const match of message.matchAll(re)) {
    const name = match[1].trim();
    const key = name.toLowerCase();
    if (STOPWORD_NAMES.has(key)) continue;
    if (!isPlausibleEntityCandidate(name)) continue;
    if (!found.has(key)) found.set(key, { name });
  }
  return [...found.values()];
}

/** Names listed in a correction: "you forgot A, B, and C". */
export function extractCorrectionNames(message: string): string[] {
  if (!CORRECTION_RE.test(message)) return [];
  return extractCandidateEntities(message).map((e) => e.name);
}

export function detectScopeIntent(message: string): ScopeIntent {
  // Order matters: work beats place/event ("who's on my team at Amazon" also
  // matches place-ish patterns); relationship beats family ("dating").
  if (WORK_INTENT_RE.test(message)) return 'work';
  if (RELATIONSHIP_INTENT_RE.test(message)) return 'relationship';
  if (FAMILY_INTENT_RE.test(message)) return 'family';
  if (PROJECT_INTENT_RE.test(message)) return 'project';
  if (BIOGRAPHY_INTENT_RE.test(message)) return 'biography';
  if (EVENT_INTENT_RE.test(message)) return 'event';
  if (PLACE_INTENT_RE.test(message)) return 'place';
  return 'general';
}

/**
 * Find the most recent explicit user intent that a context-free correction can
 * inherit. General chatter and the correction itself are intentionally skipped.
 */
export function inferPreviousScopeIntent(
  history: ReadonlyArray<{ role: string; content: string }>,
): ScopeIntent | undefined {
  let skippedTrailingCorrection = false;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.role !== 'user' || !entry.content.trim()) continue;

    const intent = detectScopeIntent(entry.content);
    // Some callers include the current user turn in history. Skip that one
    // context-free correction, then inspect exactly the user turn it follows.
    if (!skippedTrailingCorrection && intent === 'general' && CORRECTION_RE.test(entry.content)) {
      skippedTrailingCorrection = true;
      continue;
    }

    return intent === 'general' ? undefined : intent;
  }

  return undefined;
}

export function planResponseScope(
  message: string,
  opts: { previousIntent?: ScopeIntent; activeContext?: ActiveConversationContext } = {},
): ResponseScopePlan {
  const responseMode = resolveResponseMode(message);
  let intent = detectScopeIntent(message);
  let scopeSource: ScopeSource = 'message';
  // Context-free follow-ups ("you forgot Kavi", "what about Joss?") name
  // people without domain words — they inherit the conversation's active
  // context. An explicit intent in the message itself always wins.
  const isCorrection = CORRECTION_RE.test(message);
  if (intent === 'general') {
    if (isCorrection && opts.previousIntent) {
      intent = opts.previousIntent;
      scopeSource = 'inherited_correction';
    } else if (opts.activeContext && isFollowUpShaped(message)) {
      intent = opts.activeContext.intent;
      scopeSource = isCorrection ? 'inherited_correction' : 'inherited_follow_up';
    }
  }

  const policy = domainPolicyFor(intent);

  // A follow-up keeps the entities already in play so entity-relevance checks
  // don't strand it ("tell me more about them" carries the answer's names).
  const primaryEntities = extractCandidateEntities(message);
  if (scopeSource !== 'message' && opts.activeContext) {
    const seen = new Set(primaryEntities.map((e) => e.name.toLowerCase()));
    for (const entity of opts.activeContext.entities) {
      const key = entity.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      primaryEntities.push(entity);
    }
  }

  return {
    intent,
    responseMode,
    scopeSource,
    allowedDomains: policy.allowed,
    blockedDomains: policy.blocked,
    primaryEntities,
    isCorrection,
    correctionNames: isCorrection ? extractCorrectionNames(message) : [],
    maxEvidenceItems: responseMode === 'audit' ? 100 : 12,
    maxCharactersReturned: responseMode === 'audit' ? 200 : 15,
    includeProvenanceSummary: responseMode === 'debug_inspector' || responseMode === 'audit',
    includeUncertainty: true,
  };
}
