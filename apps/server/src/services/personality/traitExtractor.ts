import { logger } from '../../logger';
import type { PersonalityTrait } from './types';

/**
 * Extracts personality traits from journal entries
 * Simple rule-based extraction for V1
 */
export class TraitExtractor {
  /**
   * Extract personality traits from entries
   */
  extract(entries: any[]): PersonalityTrait[] {
    const traits: Map<string, PersonalityTrait> = new Map();

    try {
      // Personality trait patterns
      const traitPatterns = [
        { trait: 'introverted', regex: /(i prefer|i like being alone|i'm more comfortable|quiet|solitude|alone time)/i },
        { trait: 'extroverted', regex: /(i love being around|i thrive on|social energy|people energize|i'm outgoing)/i },
        { trait: 'analytical', regex: /(i analyze|i think through|logical|systematic|i break down|i examine)/i },
        { trait: 'creative', regex: /(creative|artistic|imaginative|i create|i make|i design|i build)/i },
        { trait: 'empathetic', regex: /(i feel for|i understand|i relate|empathy|i care about|i connect with)/i },
        { trait: 'ambitious', regex: /(i want to achieve|goals|driven|motivated|i'm going to|i will succeed)/i },
        { trait: 'spontaneous', regex: /(i just decided|on a whim|impulsive|i felt like|spontaneously)/i },
        { trait: 'organized', regex: /(organized|planned|structured|i plan|systematic|orderly)/i },
        { trait: 'adventurous', regex: /(adventure|i try new|explore|i'm curious|i want to experience)/i },
        { trait: 'reflective', regex: /(i reflect|i think about|i contemplate|i ponder|i consider)/i },
        { trait: 'optimistic', regex: /(positive|optimistic|i believe|things will work|i'm hopeful)/i },
        { trait: 'pessimistic', regex: /(worried|concerned|doubt|i'm not sure|uncertain|anxious)/i },
        { trait: 'confident', regex: /(i'm confident|i know i can|i believe in myself|self-assured)/i },
        { trait: 'humble', regex: /(i'm not that|i don't think i'm|modest|humble|i'm just)/i },
        { trait: 'resilient', regex: /(i bounce back|i keep going|i don't give up|perseverance|resilient)/i },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const timestamp = entry.date || entry.created_at || entry.timestamp;

        for (const pattern of traitPatterns) {
          if (pattern.regex.test(content)) {
            const key = pattern.trait;

            if (!traits.has(key)) {
              traits.set(key, {
                id: `trait_${key}_${Date.now()}`,
                trait: key,
                evidence: content.substring(0, 200),
                confidence: 0.7,
                frequency: 1,
                first_detected: timestamp,
                last_detected: timestamp,
                metadata: {},
              });
            } else {
              const existing = traits.get(key)!;
              existing.frequency += 1;
              existing.last_detected = timestamp;
              // Increase confidence with more evidence
              existing.confidence = Math.min(1, existing.confidence + 0.1);
            }
          }
        }
      }

      logger.debug({ traits: traits.size, entries: entries.length }, 'Extracted personality traits');

      return Array.from(traits.values());
    } catch (error) {
      logger.error({ error }, 'Failed to extract personality traits');
      return [];
    }
  }
}

