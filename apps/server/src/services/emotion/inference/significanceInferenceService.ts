import { scoreEmotionalWeight } from './emotionalWeightScorer';
import type { NarrativeSignificanceType, SignificanceMetadata } from './emotionInferenceTypes';
import { attachEmotionToNearestTarget } from './emotionAttachmentService';

const SIGNIFICANCE_PATTERNS: Array<{
  re: RegExp;
  significanceType: NarrativeSignificanceType;
}> = [
  { re: /\bchanged everything\b/i, significanceType: 'turning_point' },
  { re: /\bnever forgot\b/i, significanceType: 'identity_shaping_memory' },
  { re: /\bfirst time\b/i, significanceType: 'turning_point' },
  { re: /\b(?:biggest|main thing)\b/i, significanceType: 'high_impact' },
  { re: /\bimportant to me\b/i, significanceType: 'high_impact' },
  { re: /\bi still think about\b/i, significanceType: 'unresolved_wound' },
  {
    re: /\bnever had (?:friends|another friend) like him\b/i,
    significanceType: 'meaningful_bond',
  },
  { re: /\b(?:ghosted|blocked|betrayal)\b/i, significanceType: 'unresolved_wound' },
  { re: /\b(?:every time|always|again and again)\b/i, significanceType: 'recurring_pattern' },
];

export function inferSignificanceFromText(
  text: string,
  knownEntities?: Parameters<typeof attachEmotionToNearestTarget>[2],
): SignificanceMetadata[] {
  const out: SignificanceMetadata[] = [];
  const weight = scoreEmotionalWeight(text);

  for (const { re, significanceType } of SIGNIFICANCE_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    out.push({
      significanceType,
      evidencePhrases: [match[0]],
      emotionalWeight: weight,
      attachedTo: attachEmotionToNearestTarget(text, match[0], knownEntities),
    });
  }

  return out;
}

export function attachSignificanceToSignals<T extends { significance?: SignificanceMetadata }>(
  signals: T[],
  significance: SignificanceMetadata[],
): T[] {
  if (significance.length === 0) return signals;
  const primary = significance[0];
  return signals.map((signal) => ({
    ...signal,
    significance: signal.significance ?? primary,
  }));
}
