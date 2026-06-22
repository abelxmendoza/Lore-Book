import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { QuestLogCandidate } from './questLogInferenceTypes';
import { buildQuestLogContext } from './questLogProvenanceService';

const BLOCKER_RE =
  /\b([^,.!?]{4,80})\s+(?:is\s+)?(?:blocking(?:\s+production)?|still invalid|failed|broken|doesn'?t show)\b/gi;

const NAMED_BLOCKERS: Array<{ pattern: RegExp; displayName: string; reason: string }> = [
  {
    pattern: /\bSupabase egress is blocking production\b/i,
    displayName: 'Supabase egress blocking production',
    reason: 'Supabase egress',
  },
  { pattern: /\bauth is still invalid\b/i, displayName: 'Auth still invalid', reason: 'auth' },
  { pattern: /\bchips don'?t show\b/i, displayName: "Chips don't show", reason: 'chips' },
  { pattern: /\bDNS verification failed\b/i, displayName: 'DNS verification failed', reason: 'DNS verification' },
];

function collectMatches(text: string, re: RegExp): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

export function inferBlockers(text: string): QuestLogCandidate[] {
  const out: QuestLogCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, reason } of NAMED_BLOCKERS) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeBlocker(displayName, text, reason, pattern.source));
  }

  for (const match of collectMatches(text, BLOCKER_RE)) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (!displayName || seen.has(key)) continue;
    seen.add(key);
    out.push(makeBlocker(displayName, text, displayName, match[0]));
  }

  return out;
}

function makeBlocker(
  displayName: string,
  text: string,
  reason: string,
  evidence: string,
): QuestLogCandidate {
  return {
    displayName,
    itemType: 'blocker',
    context: buildQuestLogContext(text, displayName, {
      statusHint: 'blocked',
      blockerReason: reason,
      urgency: 'now',
    }),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence: 0.89,
    inferredNotConfirmed: true,
    requiresReview: true,
    promotionStatus: 'candidate',
  };
}
