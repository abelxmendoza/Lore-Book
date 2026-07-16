/**
 * Epistemic labels for autobiographical claims — humor/speculation must not
 * become confirmed factual knowledge.
 */

export type ClaimEpistemicLabel =
  | 'factual'
  | 'direct_statement'
  | 'humorous_speculation'
  | 'subjective_reaction'
  | 'non_factual';

export type LabeledClaim = {
  text: string;
  label: ClaimEpistemicLabel;
  confidence: number;
  reasons: string[];
};

const HUMOR_RE = /\b(hilarious|funny|joke|trolling|lol|lmao|haha)\b/i;
const SPECULATION_RE = /\b(i feel like|feels like|almost certainly|probably|maybe|might be|as if)\b/i;
const COINCIDENCE_RE = /\b(coincidence|same name|names? match|accidentally)\b/i;

export function labelClaimEpistemics(text: string): LabeledClaim[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.map((sentence) => {
    const reasons: string[] = [];
    if (HUMOR_RE.test(sentence)) reasons.push('humor_cue');
    if (SPECULATION_RE.test(sentence)) reasons.push('speculative_framing');
    if (COINCIDENCE_RE.test(sentence)) reasons.push('coincidence_framing');

    if (reasons.includes('speculative_framing') && (reasons.includes('humor_cue') || reasons.includes('coincidence_framing'))) {
      return {
        text: sentence,
        label: 'humorous_speculation',
        confidence: 0.9,
        reasons,
      };
    }
    if (reasons.includes('speculative_framing')) {
      return {
        text: sentence,
        label: 'non_factual',
        confidence: 0.85,
        reasons,
      };
    }
    if (reasons.includes('humor_cue')) {
      return {
        text: sentence,
        label: 'subjective_reaction',
        confidence: 0.8,
        reasons,
      };
    }
    return {
      text: sentence,
      label: 'direct_statement',
      confidence: 0.7,
      reasons: ['default_direct'],
    };
  });
}
