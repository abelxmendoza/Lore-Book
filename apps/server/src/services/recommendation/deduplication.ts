import { differenceInDays } from 'date-fns';
import type { Recommendation } from './types';

/**
 * Deduplicate recommendations to prevent spam
 */
export function deduplicateRecommendations(
  recommendations: Recommendation[]
): Recommendation[] {
  if (recommendations.length === 0) return [];

  const seen = new Map<string, Recommendation>();
  const now = new Date();

  for (const rec of recommendations) {
    // Create a key based on type, title, and source
    const key = `${rec.type}:${rec.title.toLowerCase().trim()}:${rec.source_engine || 'unknown'}`;

    const existing = seen.get(key);

    if (!existing) {
      // First time seeing this recommendation
      seen.set(key, rec);
    } else {
      // Duplicate found - keep the one with higher confidence/priority
      const existingScore = existing.priority * existing.confidence;
      const currentScore = rec.priority * rec.confidence;

      if (currentScore > existingScore) {
        seen.set(key, rec);
      }
    }
  }

  // Also filter by time window - don't show same recommendation within 7 days
  const recentRecommendations = new Set<string>();
  const deduplicated: Recommendation[] = [];

  for (const rec of Array.from(seen.values())) {
    const key = `${rec.type}:${rec.title.toLowerCase().trim()}`;
    
    if (!recentRecommendations.has(key)) {
      deduplicated.push(rec);
      recentRecommendations.add(key);
    }
  }

  return deduplicated;
}

/**
 * Check if recommendation is similar to existing ones
 */
export function isSimilarRecommendation(
  newRec: Recommendation,
  existing: Recommendation[],
  similarityThreshold: number = 0.8
): boolean {
  const newKey = `${newRec.type}:${newRec.title.toLowerCase().trim()}`;

  for (const existingRec of existing) {
    const existingKey = `${existingRec.type}:${existingRec.title.toLowerCase().trim()}`;

    // Exact match
    if (newKey === existingKey) {
      return true;
    }

    // Similarity check (simple word overlap)
    const newWords = new Set(newRec.title.toLowerCase().split(/\s+/));
    const existingWords = new Set(existingRec.title.toLowerCase().split(/\s+/));

    const intersection = new Set([...newWords].filter(w => existingWords.has(w)));
    const union = new Set([...newWords, ...existingWords]);
    const similarity = intersection.size / union.size;

    if (similarity >= similarityThreshold && newRec.type === existingRec.type) {
      return true;
    }
  }

  return false;
}

