/**
 * Identity-congruent retrieval weighting.
 *
 * Memories that reinforce the user's stable identity dimensions retrieve more easily.
 * This reflects the well-documented autobiographical memory finding that identity-congruent
 * information has a retrieval advantage — people recall events that "fit" their self-concept.
 *
 * Implementation:
 * - IdentityCoreProfile.dimensions gives us named identity vectors with scores
 * - We match entry content/tags against dimension keywords
 * - Matching entries get a mild multiplicative boost (1.0–1.25)
 * - No psychological interpretation — this is pure retrieval probability adjustment
 *
 * The boost is intentionally small. Identity should tip the balance between
 * otherwise-similar candidates, not override semantic/temporal relevance.
 */

import type { IdentityCoreProfile } from '../identityCore/identityTypes';
import type { MemoryEntry } from '../../types';

// Fallback keyword signals for common identity dimension names.
// The engine stores actual signals on each dimension — these are defaults
// for dimensions whose names don't appear literally in entry content.
const DIMENSION_KEYWORD_SIGNALS: Record<string, string[]> = {
  warrior:    ['fight', 'battle', 'discipline', 'hard', 'tough', 'gym', 'train', 'compete', 'push', 'grit'],
  creator:    ['build', 'create', 'design', 'make', 'art', 'music', 'write', 'code', 'project', 'craft'],
  rebel:      ['refuse', 'challenge', 'against', 'different', 'own way', 'reject', 'break rules'],
  builder:    ['built', 'built a', 'building', 'engineering', 'system', 'architecture', 'shipped'],
  explorer:   ['explore', 'discover', 'travel', 'curious', 'venture', 'new place', 'first time'],
  protector:  ['protect', 'family', 'care', 'keep safe', 'responsibility', 'support'],
  achiever:   ['goal', 'achieve', 'success', 'win', 'accomplish', 'milestone', 'finish'],
  learner:    ['study', 'learned', 'understand', 'insight', 'read', 'course', 'skill'],
  connector:  ['connected', 'people', 'relationship', 'friend', 'together', 'community'],
  roboticist: ['robot', 'robotics', 'automation', 'actuator', 'sensor', 'mechatronic'],
};

/**
 * Returns a retrieval weight multiplier for an entry given the user's identity profile.
 * Range: 0.80 (weak identity fit) to 1.25 (strong identity fit).
 * Returns 1.0 when no profile is available.
 */
export function computeIdentityWeight(
  entry: MemoryEntry,
  profile: IdentityCoreProfile | null | undefined
): number {
  if (!profile?.dimensions?.length) return 1.0;

  const content = ((entry as any).corrected_content ?? entry.content ?? '').toLowerCase();
  const tags = (entry.tags ?? []).map(t => t.toLowerCase());

  let maxBoost = 0;

  for (const dim of profile.dimensions) {
    if (dim.score < 0.3) continue; // Only use dimensions the engine is confident in

    const name = dim.name.toLowerCase();
    let matched = false;

    // 1. Dimension name appears directly in content or tags
    if (content.includes(name) || tags.some(t => t.includes(name))) {
      matched = true;
    }

    // 2. Known keyword signals for this dimension name
    if (!matched) {
      const signals = DIMENSION_KEYWORD_SIGNALS[name] ?? [];
      if (signals.some(s => content.includes(s) || tags.some(t => t.includes(s)))) {
        matched = true;
      }
    }

    // 3. Check the first 5 stored signal texts from the engine
    if (!matched && dim.signals?.length) {
      for (const sig of dim.signals.slice(0, 5)) {
        const words = (sig.text ?? '').toLowerCase().split(/\W+/).filter(w => w.length > 4);
        if (words.some(w => content.includes(w))) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      // Proportional to dimension score: a 0.9-score dimension boosts more than a 0.3-score one
      maxBoost = Math.max(maxBoost, dim.score * 0.25);
    }
  }

  // Returns 1.0–1.25; a 0.3-score match gives 1.075, a 0.9-score match gives 1.225
  return Math.min(1.25, 1.0 + maxBoost);
}
