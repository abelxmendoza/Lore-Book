import { logger } from '../../logger';
import { differenceInDays, parseISO } from 'date-fns';
import type { NarrativeSegment, NarrativeTransition } from './types';

/**
 * Connects narrative segments with transitions
 */
export class NarrativeConnector {
  /**
   * Generate transitions between segments
   */
  generateTransitions(segments: NarrativeSegment[]): NarrativeTransition[] {
    const transitions: NarrativeTransition[] = [];

    for (let i = 0; i < segments.length - 1; i++) {
      const from = segments[i];
      const to = segments[i + 1];

      const transition = this.createTransition(from, to, i);
      if (transition) {
        transitions.push(transition);
      }
    }

    logger.debug(
      { transitions: transitions.length, segments: segments.length },
      'Generated narrative transitions'
    );

    return transitions;
  }

  /**
   * Create transition between two segments
   */
  private createTransition(
    from: NarrativeSegment,
    to: NarrativeSegment,
    index: number
  ): NarrativeTransition | null {
    // Determine connection type
    const connectionType = this.determineConnectionType(from, to);
    const strength = this.calculateConnectionStrength(from, to, connectionType);

    if (strength < 0.2) {
      return null; // Too weak to connect
    }

    // Generate transition text
    const transitionText = this.generateTransitionText(
      from,
      to,
      connectionType,
      index
    );

    return {
      from_segment_id: from.id,
      to_segment_id: to.id,
      transition_text: transitionText,
      connection_type: connectionType,
      strength,
    };
  }

  /**
   * Determine connection type between segments
   */
  private determineConnectionType(
    from: NarrativeSegment,
    to: NarrativeSegment
  ): 'temporal' | 'thematic' | 'emotional' | 'causal' | 'character' {
    // Check for character connection
    const fromChars = new Set(from.characters || []);
    const toChars = new Set(to.characters || []);
    const charOverlap = new Set([...fromChars].filter(c => toChars.has(c)));
    if (charOverlap.size > 0) {
      return 'character';
    }

    // Check for thematic connection
    if (from.theme && to.theme) {
      const fromThemeWords = from.theme.toLowerCase().split(/[,\s]+/);
      const toThemeWords = to.theme.toLowerCase().split(/[,\s]+/);
      const themeOverlap = fromThemeWords.filter(w => toThemeWords.includes(w));
      if (themeOverlap.length > 0) {
        return 'thematic';
      }
    }

    // Check for emotional connection
    if (from.emotional_tone && to.emotional_tone) {
      const emotionalShift = this.getEmotionalShift(
        from.emotional_tone,
        to.emotional_tone
      );
      if (emotionalShift !== 'stable') {
        return 'emotional';
      }
    }

    // Check for causal connection (temporal proximity + theme similarity)
    const daysDiff = differenceInDays(parseISO(to.start_date), parseISO(from.end_date));
    if (daysDiff <= 7 && from.theme && to.theme) {
      return 'causal';
    }

    // Default to temporal
    return 'temporal';
  }

  /**
   * Calculate connection strength
   */
  private calculateConnectionStrength(
    from: NarrativeSegment,
    to: NarrativeSegment,
    type: string
  ): number {
    let strength = 0;

    switch (type) {
      case 'character':
        const fromChars = new Set(from.characters || []);
        const toChars = new Set(to.characters || []);
        const charOverlap = new Set([...fromChars].filter(c => toChars.has(c)));
        strength = charOverlap.size / Math.max(fromChars.size, toChars.size, 1);
        break;

      case 'thematic':
        if (from.theme && to.theme) {
          const fromThemeWords = from.theme.toLowerCase().split(/[,\s]+/);
          const toThemeWords = to.theme.toLowerCase().split(/[,\s]+/);
          const themeOverlap = fromThemeWords.filter(w => toThemeWords.includes(w));
          strength = themeOverlap.length / Math.max(fromThemeWords.length, toThemeWords.length, 1);
        }
        break;

      case 'emotional':
        const shift = this.getEmotionalShift(
          from.emotional_tone || 'neutral',
          to.emotional_tone || 'neutral'
        );
        strength = shift !== 'stable' ? 0.6 : 0.3;
        break;

      case 'causal':
        const daysDiff = differenceInDays(parseISO(to.start_date), parseISO(from.end_date));
        strength = Math.max(0, 1 - daysDiff / 30); // Closer = stronger
        break;

      case 'temporal':
        const temporalDiff = differenceInDays(parseISO(to.start_date), parseISO(from.end_date));
        strength = Math.max(0, 1 - temporalDiff / 90); // Closer = stronger
        break;
    }

    return Math.min(strength, 1.0);
  }

  /**
   * Get emotional shift direction
   */
  private getEmotionalShift(from: string, to: string): 'rising' | 'falling' | 'stable' {
    const toneOrder = ['negative', 'slightly_negative', 'neutral', 'slightly_positive', 'positive'];
    const fromIndex = toneOrder.indexOf(from);
    const toIndex = toneOrder.indexOf(to);

    if (toIndex > fromIndex) return 'rising';
    if (toIndex < fromIndex) return 'falling';
    return 'stable';
  }

  /**
   * Generate transition text
   */
  private generateTransitionText(
    from: NarrativeSegment,
    to: NarrativeSegment,
    type: string,
    index: number
  ): string {
    const daysDiff = differenceInDays(parseISO(to.start_date), parseISO(from.end_date));

    switch (type) {
      case 'character':
        const sharedChars = (from.characters || []).filter(c => (to.characters || []).includes(c));
        if (sharedChars.length > 0) {
          return `As time passed, ${sharedChars[0]}${sharedChars.length > 1 ? ' and others' : ''} continued to be part of the story.`;
        }
        break;

      case 'thematic':
        return `The focus shifted, but the underlying themes remained connected.`;

      case 'emotional':
        const shift = this.getEmotionalShift(
          from.emotional_tone || 'neutral',
          to.emotional_tone || 'neutral'
        );
        if (shift === 'rising') {
          return `Things began to look up.`;
        } else if (shift === 'falling') {
          return `The mood shifted, and challenges emerged.`;
        }
        return `The emotional landscape remained steady.`;

      case 'causal':
        if (daysDiff <= 3) {
          return `This led directly to what came next.`;
        }
        return `In the days that followed, the consequences began to unfold.`;

      case 'temporal':
        if (daysDiff <= 1) {
          return `The next day brought new developments.`;
        } else if (daysDiff <= 7) {
          return `A week later, the story continued.`;
        } else if (daysDiff <= 30) {
          return `As the days turned into weeks, new chapters unfolded.`;
        }
        return `Time passed, and the narrative moved forward.`;
    }

    return `The story continued.`;
  }
}

