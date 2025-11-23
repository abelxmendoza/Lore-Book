/**
 * Fuzzy matching using Levenshtein distance
 * Simple implementation for V1
 */
export class FuzzyMatcher {
  /**
   * Calculate similarity between two strings (0-1)
   * Uses Jaro-Winkler-like algorithm
   */
  similarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    // Simple Jaro-Winkler approximation
    const jaro = this.jaroDistance(a, b);
    const prefix = this.commonPrefix(a, b, 4);
    return jaro + (prefix * 0.1 * (1 - jaro));
  }

  /**
   * Check if two strings are duplicates
   */
  isDuplicate(a: string, b: string): boolean {
    return this.similarity(a, b) >= 0.88; // Good threshold
  }

  /**
   * Jaro distance calculation
   */
  private jaroDistance(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;

    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    if (matchWindow < 0) return 0.0;

    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, s2.length);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    // Find transpositions
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    return (
      (matches / s1.length +
        matches / s2.length +
        (matches - transpositions / 2) / matches) /
      3.0
    );
  }

  /**
   * Common prefix length (up to maxLen)
   */
  private commonPrefix(s1: string, s2: string, maxLen: number): number {
    let prefix = 0;
    for (let i = 0; i < Math.min(maxLen, s1.length, s2.length); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }
    return prefix;
  }
}

