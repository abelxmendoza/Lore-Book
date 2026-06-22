import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { QuestLogCandidate } from './questLogInferenceTypes';
import { buildQuestLogContext } from './questLogProvenanceService';

const HABIT_RE =
  /\b(?:every\s+(?:weekend|week|day|morning)|(?:go for a run|train Muay Thai|practice Japanese|work on LoreBook))\b/gi;

const NAMED_HABITS: Array<{ pattern: RegExp; displayName: string }> = [
  { pattern: /\bgo for a run\b/i, displayName: 'Go for a run' },
  { pattern: /\btrain Muay Thai\b/i, displayName: 'Train Muay Thai' },
  { pattern: /\bpractice Japanese\b/i, displayName: 'Practice Japanese' },
  { pattern: /\bwork on LoreBook every weekend\b/i, displayName: 'Work on LoreBook every weekend' },
];

export function inferHabits(text: string): QuestLogCandidate[] {
  const out: QuestLogCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName } of NAMED_HABITS) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      displayName,
      itemType: 'habit',
      context: buildQuestLogContext(text, displayName, { statusHint: 'active' }),
      evidencePhrases: [pattern.source],
      sourceMessageIds: [],
      confidence: 0.84,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  if (HABIT_RE.test(text)) {
    const m = text.match(/\b(?:every\s+weekend|every\s+week)\b/i);
    if (m && /\bwork on LoreBook\b/i.test(text)) {
      const displayName = 'Work on LoreBook every weekend';
      const key = normalizeNameKey(displayName);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          displayName,
          itemType: 'habit',
          context: buildQuestLogContext(text, displayName, {
            projectContext: 'LoreBook',
            statusHint: 'active',
          }),
          evidencePhrases: [m[0]],
          sourceMessageIds: [],
          confidence: 0.85,
          inferredNotConfirmed: true,
          requiresReview: false,
          promotionStatus: 'candidate',
        });
      }
    }
  }

  return out;
}
