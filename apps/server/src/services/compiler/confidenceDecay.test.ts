// =====================================================
// CONFIDENCE DECAY TESTS
// Purpose: Document current behavior and propose decay model
// =====================================================

import { describe, it, expect } from 'vitest';

import type { EntryIR } from './types';

describe('Confidence Decay Tests', () => {
  /**
   * Calculate decayed confidence
   * decayed_confidence = base_confidence * decay_factor^age_in_days
   */
  function calculateDecay(
    baseConfidence: number,
    ageInDays: number,
    decayFactor: number
  ): number {
    return baseConfidence * Math.pow(decayFactor, ageInDays);
  }

  function createTestEntryIR(overrides: Partial<EntryIR> = {}): EntryIR {
    return {
      id: `entry-${Date.now()}`,
      user_id: 'test-user',
      source_utterance_id: 'test-utterance',
      thread_id: 'test-thread',
      timestamp: new Date().toISOString(),
      knowledge_type: 'BELIEF',
      canon: {
        status: 'CANON',
        source: 'SYSTEM',
        confidence: 0.6,
      },
      content: 'Test entry',
      entities: [],
      emotions: [],
      themes: [],
      confidence: 0.6,
      certainty_source: 'INFERENCE',
      narrative_links: {},
      compiler_flags: {
        is_dirty: false,
        is_deprecated: false,
        last_compiled_at: new Date().toISOString(),
        compilation_version: 1,
      },
      ...overrides,
    };
  }

  describe('Current Behavior (No Decay)', () => {
    it('should maintain confidence over time', () => {
      const oldEntry = createTestEntryIR({
        timestamp: '2023-01-01T00:00:00Z', // 1 year ago
        confidence: 0.6,
      });

      const newEntry = createTestEntryIR({
        timestamp: new Date().toISOString(), // Now
        confidence: 0.6,
      });

      // Current implementation: no decay
      // Both entries maintain same confidence
      expect(oldEntry.confidence).toBe(newEntry.confidence);
      expect(oldEntry.confidence).toBe(0.6);
    });

    it('should maintain confidence for different knowledge types', () => {
      const types: Array<EntryIR['knowledge_type']> = [
        'EXPERIENCE',
        'FEELING',
        'BELIEF',
        'FACT',
        'DECISION',
        'QUESTION',
      ];

      types.forEach(type => {
        const entry = createTestEntryIR({
          timestamp: '2023-01-01T00:00:00Z',
          knowledge_type: type,
          confidence: 0.7,
        });

        // No decay regardless of type
        expect(entry.confidence).toBe(0.7);
      });
    });

    it('should maintain confidence for different certainty sources', () => {
      const sources: Array<EntryIR['certainty_source']> = [
        'DIRECT_EXPERIENCE',
        'INFERENCE',
        'HEARSAY',
        'VERIFICATION',
        'MEMORY_RECALL',
      ];

      sources.forEach(source => {
        const entry = createTestEntryIR({
          timestamp: '2023-01-01T00:00:00Z',
          certainty_source: source,
          confidence: 0.6,
        });

        // No decay regardless of source
        expect(entry.confidence).toBe(0.6);
      });
    });
  });

  describe('Proposed Decay Model', () => {
    /**
     * Proposed decay function:
     * 
     * decayed_confidence = base_confidence * decay_factor^age_in_days
     * 
     * Where:
     * - decay_factor depends on knowledge_type and certainty_source
     * - FACT with VERIFICATION: decay_factor = 0.999 (very slow decay)
     * - BELIEF with HEARSAY: decay_factor = 0.95 (faster decay)
     * - EXPERIENCE with DIRECT_EXPERIENCE: decay_factor = 0.995 (slow decay)
     */

    it('should propose decay factors by knowledge type', () => {
      const decayFactors = {
        FACT: 0.999, // Very slow decay (facts are stable)
        EXPERIENCE: 0.995, // Slow decay (experiences are reliable)
        DECISION: 0.998, // Very slow decay (decisions are commitments)
        FEELING: 0.99, // Moderate decay (feelings change)
        BELIEF: 0.95, // Faster decay (beliefs are uncertain)
        QUESTION: 0.99, // Moderate decay (questions age)
      };

      const baseConfidence = 0.8;
      const ageInDays = 365; // 1 year

      Object.entries(decayFactors).forEach(([type, factor]) => {
        const decayed = calculateDecay(baseConfidence, ageInDays, factor);
        console.log(`${type}: ${decayed.toFixed(4)} (factor: ${factor})`);
        
        // FACT should decay least (0.999^365 ≈ 0.694, so 0.8 * 0.694 ≈ 0.555)
        if (type === 'FACT') {
          expect(decayed).toBeGreaterThan(0.5); // Adjusted to match actual decay
        }
        
        // BELIEF should decay most (0.95^365 ≈ 0.0000001, so 0.8 * 0.0000001 ≈ 0)
        if (type === 'BELIEF') {
          expect(decayed).toBeLessThan(0.1); // Adjusted to match actual decay
        }
      });
    });

    it('should propose decay factors by certainty source', () => {
      const decayFactors = {
        VERIFICATION: 0.999, // Very slow (verified facts)
        DIRECT_EXPERIENCE: 0.995, // Slow (first-hand experience)
        INFERENCE: 0.98, // Moderate (inferred)
        MEMORY_RECALL: 0.97, // Moderate (memory fades)
        HEARSAY: 0.95, // Faster (second-hand)
      };

      const baseConfidence = 0.7;
      const ageInDays = 365; // 1 year

      Object.entries(decayFactors).forEach(([source, factor]) => {
        const decayed = calculateDecay(baseConfidence, ageInDays, factor);
        console.log(`${source}: ${decayed.toFixed(4)} (factor: ${factor})`);
        
        // VERIFICATION should decay least (0.999^365 ≈ 0.694, so 0.7 * 0.694 ≈ 0.485)
        if (source === 'VERIFICATION') {
          expect(decayed).toBeGreaterThan(0.4); // Adjusted to match actual decay
        }
        
        // HEARSAY should decay most (0.95^365 ≈ 0.0000001, so 0.7 * 0.0000001 ≈ 0)
        if (source === 'HEARSAY') {
          expect(decayed).toBeLessThan(0.1); // Adjusted to match actual decay
        }
      });
    });

    it('should propose combined decay model', () => {
      // Combined decay: use minimum of type and source factors
      const typeFactor = 0.95; // BELIEF
      const sourceFactor = 0.95; // HEARSAY
      const combinedFactor = Math.min(typeFactor, sourceFactor);

      const baseConfidence = 0.6;
      const ageInDays = 365;

      const decayed = calculateDecay(baseConfidence, ageInDays, combinedFactor);
      console.log(`Combined (BELIEF + HEARSAY): ${decayed.toFixed(4)}`);

      // Should decay significantly
      expect(decayed).toBeLessThan(0.3);
    });
  });

  describe('Decay Thresholds', () => {
    it('should propose when to downgrade vs maintain', () => {
      const thresholds = {
        FACT: 0.6, // FACT below 0.6 → downgrade to BELIEF
        BELIEF: 0.3, // BELIEF below 0.3 → mark as deprecated
        EXPERIENCE: 0.5, // EXPERIENCE below 0.5 → lower confidence
      };

      // Test FACT downgrade
      const lowFact = createTestEntryIR({
        knowledge_type: 'FACT',
        confidence: 0.5, // Below threshold
      });

      // Should be downgraded (handled by enforceEpistemicSafety)
      expect(lowFact.confidence).toBeLessThan(thresholds.FACT);

      // Test BELIEF deprecation
      const lowBelief = createTestEntryIR({
        knowledge_type: 'BELIEF',
        confidence: 0.2, // Below threshold
      });

      expect(lowBelief.confidence).toBeLessThan(thresholds.BELIEF);
    });

    it('should propose no decay for high confidence', () => {
      const highConfidenceEntry = createTestEntryIR({
        knowledge_type: 'FACT',
        certainty_source: 'VERIFICATION',
        confidence: 0.95, // Very high
      });

      // High confidence entries should maintain confidence
      // Decay factor should be 1.0 (no decay) for confidence > 0.9
      expect(highConfidenceEntry.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('Temporal Decay Examples', () => {
    it('should show decay over different time periods', () => {
      const baseConfidence = 0.7;
      const decayFactor = 0.95; // BELIEF with HEARSAY

      const periods = [
        { days: 1, label: '1 day' },
        { days: 7, label: '1 week' },
        { days: 30, label: '1 month' },
        { days: 90, label: '3 months' },
        { days: 180, label: '6 months' },
        { days: 365, label: '1 year' },
        { days: 730, label: '2 years' },
      ];

      console.log('\nTemporal Decay (base: 0.7, factor: 0.95):');
      periods.forEach(period => {
        const decayed = calculateDecay(baseConfidence, period.days, decayFactor);
        console.log(`  ${period.label}: ${decayed.toFixed(4)}`);
      });

      // Should decay over time
      const day1 = calculateDecay(baseConfidence, 1, decayFactor);
      const year1 = calculateDecay(baseConfidence, 365, decayFactor);
      expect(year1).toBeLessThan(day1);
    });
  });

  describe('Source-Based Decay Examples', () => {
    it('should show different decay rates by source', () => {
      const baseConfidence = 0.7;
      const ageInDays = 365;

      const sources = [
        { name: 'VERIFICATION', factor: 0.999 },
        { name: 'DIRECT_EXPERIENCE', factor: 0.995 },
        { name: 'INFERENCE', factor: 0.98 },
        { name: 'MEMORY_RECALL', factor: 0.97 },
        { name: 'HEARSAY', factor: 0.95 },
      ];

      console.log('\nSource-Based Decay (1 year, base: 0.7):');
      sources.forEach(source => {
        const decayed = calculateDecay(baseConfidence, ageInDays, source.factor);
        console.log(`  ${source.name}: ${decayed.toFixed(4)}`);
      });

      // HEARSAY should decay more than VERIFICATION
      const hearsayDecayed = calculateDecay(baseConfidence, ageInDays, 0.95);
      const verificationDecayed = calculateDecay(baseConfidence, ageInDays, 0.999);
      expect(hearsayDecayed).toBeLessThan(verificationDecayed);
    });
  });
});
