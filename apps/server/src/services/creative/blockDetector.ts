import { logger } from '../../logger';
import type { CreativeBlock, CreativeBlockType, CreativeMedium } from './types';

/**
 * Detects creative blocks from journal entries
 */
export class BlockDetector {
  /**
   * Detect creative blocks
   */
  detect(entries: any[]): CreativeBlock[] {
    const blocks: CreativeBlock[] = [];

    try {
      const patterns: Array<{ type: CreativeBlockType; regex: RegExp; confidence: number }> = [
        { type: 'emotional', regex: /(not in the mood|low energy|sad|overthinking|depressed|anxious|stressed)/i, confidence: 0.8 },
        { type: 'perfectionism', regex: /(not good enough|redoing|can't finish|not perfect|keep redoing|never satisfied)/i, confidence: 0.85 },
        { type: 'overwhelm', regex: /(too much|overwhelmed|burnt out|exhausted|can't handle|too many projects)/i, confidence: 0.8 },
        { type: 'lack_of_clarity', regex: /(don't know where to start|unclear|confused|stuck|don't know what to do)/i, confidence: 0.75 },
        { type: 'time', regex: /(no time|busy|schedule|too busy|no time for|can't find time)/i, confidence: 0.7 },
        { type: 'identity', regex: /(i'm not creative|i lost my touch|i can't|i'm not good at|not a creative person)/i, confidence: 0.8 },
        { type: 'motivation', regex: /(unmotivated|no motivation|don't feel like|lack motivation|not inspired)/i, confidence: 0.75 },
        { type: 'technical', regex: /(can't figure out|stuck on|technical issue|bug|problem|error)/i, confidence: 0.7 },
      ];

      // Medium detection for blocks
      const mediumPatterns: Array<{ medium: CreativeMedium; regex: RegExp }> = [
        { medium: 'coding', regex: /(coding|programming|developing|code)/i },
        { medium: 'art', regex: /(art|drawing|sketching|painting)/i },
        { medium: 'music', regex: /(music|song|beat|composing)/i },
        { medium: 'writing', regex: /(writing|drafting|scripting)/i },
        { medium: 'video', regex: /(video|editing|filming)/i },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Check for block patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            // Detect medium if mentioned
            let medium: CreativeMedium | undefined;
            for (const mediumPattern of mediumPatterns) {
              if (mediumPattern.regex.test(contentLower)) {
                medium = mediumPattern.medium;
                break;
              }
            }

            // Check if block is resolved (mentioned later in entry or in subsequent entries)
            const resolved = /(got past|overcame|solved|resolved|worked through|got through|pushed through)/i.test(contentLower);

            blocks.push({
              id: `block_${entry.id}_${pattern.type}_${Date.now()}`,
              type: pattern.type,
              evidence: content.substring(0, 300),
              confidence: pattern.confidence,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              medium,
              resolved,
              resolved_at: resolved ? (entry.date || entry.created_at || entry.timestamp || new Date().toISOString()) : undefined,
              metadata: {
                source_entry_id: entry.id,
              },
            });
            break; // Only count each entry once
          }
        }
      }

      logger.debug({ blocks: blocks.length, entries: entries.length }, 'Detected creative blocks');

      return blocks;
    } catch (error) {
      logger.error({ error }, 'Failed to detect creative blocks');
      return [];
    }
  }

  /**
   * Get block distribution by type
   */
  getBlockDistribution(blocks: CreativeBlock[]): Record<CreativeBlockType, number> {
    const distribution: Record<string, number> = {};

    blocks.forEach((block) => {
      distribution[block.type] = (distribution[block.type] || 0) + 1;
    });

    return distribution as Record<CreativeBlockType, number>;
  }
}

