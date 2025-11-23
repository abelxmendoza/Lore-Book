/**
 * Computes emotion intensity from text patterns
 */
export class EmotionIntensity {
  /**
   * Compute intensity score (0-1)
   */
  compute(text: string): number {
    const strongWords = /(very|super|extremely|really|so|too|intense|incredibly|absolutely)/i;
    const exclamations = (text.match(/!/g) || []).length;
    const caps = text === text.toUpperCase() && text.length > 8;
    const allCapsWords = (text.match(/\b[A-Z]{3,}\b/g) || []).length;

    let score = 0.4; // Base intensity

    if (strongWords.test(text)) {
      score += 0.2;
    }

    if (exclamations >= 2) {
      score += 0.2;
    } else if (exclamations === 1) {
      score += 0.1;
    }

    if (caps) {
      score += 0.2;
    } else if (allCapsWords > 0) {
      score += 0.1;
    }

    // Clamp between 0 and 1
    return Math.min(1, Math.max(0, score));
  }
}

