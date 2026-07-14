/**
 * Query scope planning — deterministic intent + domain detection, no LLM.
 * Produces the ResponseScopePlan that gates everything downstream.
 */

import { domainPolicyFor } from './responseDomainPolicy';
import { CORRECTION_RE, resolveResponseMode } from './responseModeResolver';
import type { EntityRef, ResponseScopePlan, ScopeIntent } from './responseScopeTypes';

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

export function planResponseScope(
  message: string,
  opts: { previousIntent?: ScopeIntent } = {},
): ResponseScopePlan {
  const responseMode = resolveResponseMode(message);
  let intent = detectScopeIntent(message);
  // A bare correction ("you forgot Kaustubh") often names people without
  // domain words — inherit the intent of the answer being corrected.
  const isCorrection = CORRECTION_RE.test(message);
  if (isCorrection && intent === 'general' && opts.previousIntent) {
    intent = opts.previousIntent;
  }

  const policy = domainPolicyFor(intent);

  return {
    intent,
    responseMode,
    allowedDomains: policy.allowed,
    blockedDomains: policy.blocked,
    primaryEntities: extractCandidateEntities(message),
    isCorrection,
    correctionNames: isCorrection ? extractCorrectionNames(message) : [],
    maxEvidenceItems: responseMode === 'audit' ? 100 : 12,
    maxCharactersReturned: responseMode === 'audit' ? 200 : 15,
    includeProvenanceSummary: responseMode === 'debug_inspector' || responseMode === 'audit',
    includeUncertainty: true,
  };
}
