// =====================================================
// EPISTEMIC LATTICE TESTS
// Purpose: Verify invariants and lattice properties
// =====================================================

import { describe, it, expect } from 'vitest';

import {
  epistemicLatticeService,
  EpistemicLattice,
  EpistemicViolation,
} from './epistemicLattice';
import type { EntryIR } from './types';

describe('Epistemic Lattice', () => {
  describe('Promotion Rules', () => {
    it('should allow EXPERIENCE → FACT with proof', () => {
      const allowed = epistemicLatticeService.isPromotionAllowed('EXPERIENCE', 'FACT');
      expect(allowed).toBe(true);
    });

    it('should allow BELIEF → FACT with proof', () => {
      const allowed = epistemicLatticeService.isPromotionAllowed('BELIEF', 'FACT');
      expect(allowed).toBe(true);
    });

    it('should forbid FEELING → FACT', () => {
      const allowed = epistemicLatticeService.isPromotionAllowed('FEELING', 'FACT');
      expect(allowed).toBe(false);
    });

    it('should forbid QUESTION → FACT', () => {
      const allowed = epistemicLatticeService.isPromotionAllowed('QUESTION', 'FACT');
      expect(allowed).toBe(false);
    });

    it('should forbid DECISION → FACT', () => {
      const allowed = epistemicLatticeService.isPromotionAllowed('DECISION', 'FACT');
      expect(allowed).toBe(false);
    });
  });

  describe('Type Checking', () => {
    it('should reject promotion without proof', () => {
      const attempt = {
        from: 'EXPERIENCE' as const,
        to: 'FACT' as const,
      };

      expect(() => {
        epistemicLatticeService.epistemicTypeCheck(attempt);
      }).toThrow(EpistemicViolation);
    });

    it('should reject promotion with low confidence proof', () => {
      const attempt = {
        from: 'EXPERIENCE' as const,
        to: 'FACT' as const,
        proof: {
          rule_id: 'EXPERIENCE_TO_FACT',
          source_entries: [],
          confidence: 0.5, // Below threshold
          generated_at: new Date().toISOString(),
          generated_by: 'SYSTEM' as const,
        },
      };

      expect(() => {
        epistemicLatticeService.epistemicTypeCheck(attempt);
      }).toThrow(EpistemicViolation);
    });

    it('should accept valid promotion with proof', () => {
      const attempt = {
        from: 'EXPERIENCE' as const,
        to: 'FACT' as const,
        proof: {
          rule_id: 'EXPERIENCE_TO_FACT',
          source_entries: ['entry1', 'entry2'],
          confidence: 0.8,
          generated_at: new Date().toISOString(),
          generated_by: 'SYSTEM' as const,
        },
      };

      expect(() => {
        epistemicLatticeService.epistemicTypeCheck(attempt);
      }).not.toThrow();
    });
  });

  describe('Automatic Downgrading', () => {
    it('should downgrade FACT with low confidence to BELIEF', () => {
      const entry: EntryIR = {
        id: 'test-entry',
        user_id: 'test-user',
        source_utterance_id: 'test-utterance',
        thread_id: 'test-thread',
        timestamp: new Date().toISOString(),
        knowledge_type: 'FACT',
        canon_status: 'CANON',
        content: 'Test content',
        entities: [],
        emotions: [],
        themes: [],
        confidence: 0.5, // Below threshold
        certainty_source: 'INFERENCE',
        narrative_links: {},
        compiler_flags: {
          is_dirty: false,
          is_deprecated: false,
          last_compiled_at: new Date().toISOString(),
          compilation_version: 1,
        },
      };

      const result = epistemicLatticeService.enforceEpistemicSafety(entry);

      expect(result.knowledge_type).toBe('BELIEF');
      expect(result.compiler_flags.downgraded_from_fact).toBe(true);
    });

    it('should not downgrade FACT with high confidence', () => {
      const entry: EntryIR = {
        id: 'test-entry',
        user_id: 'test-user',
        source_utterance_id: 'test-utterance',
        thread_id: 'test-thread',
        timestamp: new Date().toISOString(),
        knowledge_type: 'FACT',
        canon_status: 'CANON',
        content: 'Test content',
        entities: [],
        emotions: [],
        themes: [],
        confidence: 0.8, // Above threshold
        certainty_source: 'VERIFICATION',
        narrative_links: {},
        compiler_flags: {
          is_dirty: false,
          is_deprecated: false,
          last_compiled_at: new Date().toISOString(),
          compilation_version: 1,
        },
      };

      const result = epistemicLatticeService.enforceEpistemicSafety(entry);

      expect(result.knowledge_type).toBe('FACT');
      expect(result.compiler_flags.downgraded_from_fact).toBeUndefined();
    });
  });

  describe('Downgrade Rules', () => {
    it('should always allow downgrades', () => {
      const allowed = epistemicLatticeService.isDowngradeAllowed('FACT', 'BELIEF');
      expect(allowed).toBe(true);
    });

    it('should allow downgrade from FACT to EXPERIENCE', () => {
      const allowed = epistemicLatticeService.isDowngradeAllowed('FACT', 'EXPERIENCE');
      expect(allowed).toBe(true);
    });
  });
});

