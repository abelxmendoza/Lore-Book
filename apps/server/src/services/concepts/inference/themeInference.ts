import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { ConceptCandidate } from './conceptInferenceTypes';
import { buildConceptContext } from './conceptProvenanceService';

const THEMES: Array<{
  pattern: RegExp;
  displayName: string;
  conceptType: ConceptCandidate['conceptType'];
  emotional?: boolean;
}> = [
  { pattern: /\bsocial reputation\b/i, displayName: 'Social Reputation', conceptType: 'social_concept', emotional: true },
  { pattern: /\bstatus anxiety\b/i, displayName: 'Status Anxiety', conceptType: 'fear_or_anxiety', emotional: true },
  { pattern: /\bfeeling rejected\b/i, displayName: 'Feeling Rejected', conceptType: 'theme', emotional: true },
  { pattern: /\bbeing remembered\b/i, displayName: 'Being Remembered', conceptType: 'theme' },
  { pattern: /\bidentity confusion\b/i, displayName: 'Identity Confusion', conceptType: 'identity_theme', emotional: true },
  { pattern: /\bbelonging\b/i, displayName: 'Belonging', conceptType: 'theme', emotional: true },
  { pattern: /\bnarrative identity\b/i, displayName: 'Narrative Identity', conceptType: 'identity_theme' },
];

const EMOTIONAL_WEIGHT =
  /\b(?:anxious|rejected|embarrassed|ashamed|proud|scared|lonely|insecure|reputation|status)\b/i;

export function inferThemes(
  text: string,
  opts: { priorMentionCounts?: Record<string, number> } = {},
): ConceptCandidate[] {
  const out: ConceptCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, conceptType, emotional } of THEMES) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    const prior = opts.priorMentionCounts?.[key] ?? 0;
    const hasEmotional = emotional || EMOTIONAL_WEIGHT.test(text);
    if (prior < 1 && !hasEmotional) continue;

    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      conceptType,
      context: buildConceptContext(text, displayName, {
        emotionalContext: text.match(EMOTIONAL_WEIGHT)?.[0],
        repeatedTheme: prior >= 1,
        userStance: /\bcare about|worry|fear\b/i.test(text) ? 'fears' : 'explores',
      }),
      evidencePhrases: [text.match(pattern)?.[0] ?? displayName],
      sourceMessageIds: [],
      confidence: prior >= 1 ? 0.88 : 0.8,
      inferredNotConfirmed: true,
      requiresReview: true,
      promotionStatus: 'candidate',
    });
  }

  return out;
}
