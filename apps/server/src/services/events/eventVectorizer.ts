/**
 * Vector similarity calculator for events
 * Uses cosine similarity
 */
export class EventVectorizer {
  /**
   * Calculate cosine similarity between two vectors (0 to 1)
   */
  similarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    if (a.length === 0) {
      return 0;
    }

    // Calculate dot product
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    // Calculate cosine similarity
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
}

