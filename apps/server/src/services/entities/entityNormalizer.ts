/**
 * Normalizes entity names for comparison
 */
export class EntityNormalizer {
  /**
   * Normalize entity name (lowercase, remove punctuation, trim whitespace)
   */
  normalize(raw: string): string {
    return raw
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .toLowerCase();
  }
}

