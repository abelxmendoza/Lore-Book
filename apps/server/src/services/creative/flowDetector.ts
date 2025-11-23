import { logger } from '../../logger';
import type { FlowState, CreativeMedium } from './types';

/**
 * Detects flow states from journal entries
 */
export class FlowDetector {
  /**
   * Detect flow states from entries
   */
  detect(entries: any[]): FlowState[] {
    const flowStates: FlowState[] = [];

    try {
      // Flow state indicators
      const flowPatterns: Array<{ regex: RegExp; level: number; indicators: string[] }> = [
        { regex: /(locked in|flow|hyperfocused|dialed in|focused hard|in the zone|deep focus)/i, level: 0.9, indicators: ['focus', 'immersion', 'deep_work'] },
        { regex: /(really focused|concentrated|zoned in|tunnel vision)/i, level: 0.75, indicators: ['focus', 'concentration'] },
        { regex: /(focused|productive|getting work done|making progress)/i, level: 0.6, indicators: ['focus', 'productivity'] },
        { regex: /(lost track of time|hours flew by|time disappeared)/i, level: 0.85, indicators: ['time_distortion', 'immersion'] },
        { regex: /(everything clicked|everything flowed|smooth|effortless)/i, level: 0.8, indicators: ['fluidity', 'ease'] },
      ];

      // Medium detection for flow states
      const mediumPatterns: Array<{ medium: CreativeMedium; regex: RegExp }> = [
        { medium: 'coding', regex: /(coding|programming|developing|building)/i },
        { medium: 'art', regex: /(drawing|art|sketching|painting)/i },
        { medium: 'music', regex: /(music|song|beat|composing)/i },
        { medium: 'writing', regex: /(writing|drafting|scripting)/i },
        { medium: 'video', regex: /(video|editing|filming)/i },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Check for flow patterns
        for (const pattern of flowPatterns) {
          if (pattern.regex.test(contentLower)) {
            // Detect medium if mentioned
            let medium: CreativeMedium | undefined;
            for (const mediumPattern of mediumPatterns) {
              if (mediumPattern.regex.test(contentLower)) {
                medium = mediumPattern.medium;
                break;
              }
            }

            // Estimate duration if mentioned
            let duration_minutes: number | undefined;
            const durationMatch = contentLower.match(/(\d+)\s*(hours?|hrs?|h)/i);
            if (durationMatch) {
              duration_minutes = parseInt(durationMatch[1], 10) * 60;
            } else {
              const minutesMatch = contentLower.match(/(\d+)\s*(minutes?|mins?|m)/i);
              if (minutesMatch) {
                duration_minutes = parseInt(minutesMatch[1], 10);
              }
            }

            flowStates.push({
              id: `flow_${entry.id}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              level: pattern.level,
              indicators: pattern.indicators,
              medium,
              duration_minutes,
              metadata: {
                source_entry_id: entry.id,
              },
            });
            break; // Only count each entry once
          }
        }
      }

      logger.debug({ flowStates: flowStates.length, entries: entries.length }, 'Detected flow states');

      return flowStates;
    } catch (error) {
      logger.error({ error }, 'Failed to detect flow states');
      return [];
    }
  }

  /**
   * Get average flow level
   */
  getAverageFlowLevel(flowStates: FlowState[]): number {
    if (flowStates.length === 0) return 0;

    const total = flowStates.reduce((sum, f) => sum + f.level, 0);
    return total / flowStates.length;
  }
}

