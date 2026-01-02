import { logger } from '../../logger';

/**
 * Segments long memories into multiple scenes
 */
export class SceneSegmenter {
  private readonly MIN_SEGMENT_LENGTH = 20;

  /**
   * Segment text into potential scenes
   * Uses paragraph breaks, ellipses, and dashes as delimiters
   */
  segment(text: string): string[] {
    try {
      // Split on multiple newlines, ellipses, or dashes
      const segments = text
        .split(/\n{2,}|\.{3,}|--+/g)
        .map((t) => t.trim())
        .filter((t) => t.length >= this.MIN_SEGMENT_LENGTH);

      // If no segments found, return the whole text
      if (segments.length === 0) {
        return [text.trim()];
      }

      return segments;
    } catch (error) {
      logger.error({ error }, 'Error segmenting scene');
      return [text.trim()];
    }
  }
}

