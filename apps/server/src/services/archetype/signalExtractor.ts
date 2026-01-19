import { logger } from '../../logger';

import type { ArchetypeSignal } from './types';

/**
 * Extracts archetype signals from journal entries
 * Based on pseudocode patterns
 */
export class ArchetypeSignalExtractor {
  private readonly archetypePatterns = [
    { archetype: 'Warrior', regex: /(fought|trained|battle|pressure|grind|compete|fight|combat)/i },
    { archetype: 'Rebel', regex: /(break rules|against system|fuck it|rebel|defy|resist)/i },
    { archetype: 'Hermit', regex: /(alone|isolated|need space|solitude|withdraw|retreat)/i },
    { archetype: 'Creator', regex: /(coded|built|designed|created|made|crafted|developed)/i },
    { archetype: 'Lover', regex: /(connection|romantic|attracted|love|intimacy|passion)/i },
    { archetype: 'Seeker', regex: /(learning|searching|exploring|discover|quest|journey)/i },
    { archetype: 'Protector', regex: /(protect|defend|kept safe|guard|shield|safeguard)/i },
    { archetype: 'Leader', regex: /(led|organized|charge|direct|command|manage|guide)/i },
    { archetype: 'Outlaw', regex: /(kicked out|trouble|chaos|rebel|outcast|exile)/i },
    { archetype: 'Sage', regex: /(insight|truth|wisdom|understand|realize|enlighten)/i },
    { archetype: 'Shadow_Self', regex: /(rage|self sabotage|dark|destructive|toxic|negative)/i },
  ];

  /**
   * Calculate base confidence for an entry
   */
  private baseConfidence(entry: any): number {
    let confidence = 0.5;

    // Adjust based on sentiment if available
    if (entry.sentiment !== undefined && entry.sentiment !== null) {
      confidence += entry.sentiment * 0.2;
    }

    // Adjust based on intensity if available
    if (entry.intensity !== undefined && entry.intensity !== null) {
      confidence += entry.intensity * 0.3;
    }

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Extract archetype signals from entries
   */
  extract(entries: any[]): ArchetypeSignal[] {
    const signals: ArchetypeSignal[] = [];

    try {
      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const timestamp = entry.date || entry.created_at || entry.timestamp;
        const confidence = this.baseConfidence(entry);

        for (const pattern of this.archetypePatterns) {
          if (pattern.regex.test(content)) {
            signals.push({
              id: `archetype_${entry.id}_${pattern.archetype}_${Date.now()}_${Math.random()}`,
              entry_id: entry.id,
              label: pattern.archetype,
              confidence,
              evidence: content.substring(0, 200),
              timestamp,
              metadata: {
                source_entry_id: entry.id,
              },
            });
          }
        }
      }

      logger.debug({ signals: signals.length, entries: entries.length }, 'Extracted archetype signals');

      return signals;
    } catch (error) {
      logger.error({ error }, 'Failed to extract archetype signals');
      return [];
    }
  }
}

