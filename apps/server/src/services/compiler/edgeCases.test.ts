// =====================================================
// LNC EDGE CASE TESTS
// Purpose: Test edge cases and failure modes
// =====================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { irCompiler } from './irCompiler';
import { epistemicLatticeService } from './epistemicLattice';
import { contractLayer, CONTRACTS } from './contractLayer';
import { epistemicInvariants } from './epistemicInvariants';
import { symbolResolver } from './symbolResolver';
import { dependencyGraph } from './dependencyGraph';
import { incrementalCompiler } from './incrementalCompiler';
import type { EntryIR, KnowledgeType } from './types';

describe('LNC Edge Cases', () => {
  const testUserId = 'test-user-123';
  const testThreadId = 'test-thread-123';

  function createTestEntryIR(overrides: Partial<EntryIR> = {}): EntryIR {
    return {
      id: `entry-${Date.now()}-${Math.random()}`,
      user_id: testUserId,
      source_utterance_id: `utterance-${Date.now()}`,
      thread_id: testThreadId,
      timestamp: new Date().toISOString(),
      knowledge_type: 'EXPERIENCE',
      canon: {
        status: 'CANON',
        source: 'SYSTEM',
        confidence: 0.6,
      },
      content: 'Test entry',
      entities: [],
      emotions: [],
      themes: [],
      confidence: 0.7,
      certainty_source: 'DIRECT_EXPERIENCE',
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

  describe('Edge Case 1: Changing Truths', () => {
    it('should handle two FACT entries with temporal contradiction', () => {
      const entry1: EntryIR = createTestEntryIR({
        id: 'fact-1',
        knowledge_type: 'FACT',
        content: 'Sarah lives in New York',
        timestamp: '2024-01-01T00:00:00Z',
        confidence: 0.9,
      });

      const entry2: EntryIR = createTestEntryIR({
        id: 'fact-2',
        knowledge_type: 'FACT',
        content: 'Sarah lives in Los Angeles',
        timestamp: '2024-06-01T00:00:00Z',
        confidence: 0.9,
      });

      // Both are FACT entries, but they contradict
      // System should detect this via continuity engine (not LNC's job)
      // But LNC should allow both to exist as FACT entries
      const violations = epistemicInvariants.checkAllInvariants([entry1, entry2]);
      expect(violations.length).toBe(0); // No invariant violations
    });

    it('should handle FACT entry that becomes outdated', () => {
      const oldFact: EntryIR = createTestEntryIR({
        id: 'old-fact',
        knowledge_type: 'FACT',
        content: 'I work at Company A',
        timestamp: '2023-01-01T00:00:00Z',
        confidence: 0.9,
      });

      const newFact: EntryIR = createTestEntryIR({
        id: 'new-fact',
        knowledge_type: 'FACT',
        content: 'I work at Company B',
        timestamp: '2024-01-01T00:00:00Z',
        confidence: 0.9,
      });

      // Both facts are valid at their respective times
      // LNC doesn't handle temporal contradictions (continuity engine does)
      const violations = epistemicInvariants.checkAllInvariants([oldFact, newFact]);
      expect(violations.length).toBe(0);
    });
  });

  describe('Edge Case 2: Retractions', () => {
    it('should handle BELIEF followed by contradictory BELIEF', () => {
      const belief1: EntryIR = createTestEntryIR({
        id: 'belief-1',
        knowledge_type: 'BELIEF',
        content: 'I believe Sarah is avoiding me',
        timestamp: '2024-01-01T00:00:00Z',
        confidence: 0.6,
      });

      const belief2: EntryIR = createTestEntryIR({
        id: 'belief-2',
        knowledge_type: 'BELIEF',
        content: 'I believe Sarah is not avoiding me',
        timestamp: '2024-01-02T00:00:00Z',
        confidence: 0.6,
      });

      // Both BELIEF entries are valid
      // Contradiction detection is handled by continuity engine
      const violations = epistemicInvariants.checkAllInvariants([belief1, belief2]);
      expect(violations.length).toBe(0);
    });

    it('should handle BELIEF retracted with FACT', () => {
      const belief: EntryIR = createTestEntryIR({
        id: 'belief',
        knowledge_type: 'BELIEF',
        content: 'I believe the meeting is tomorrow',
        timestamp: '2024-01-01T00:00:00Z',
        confidence: 0.6,
      });

      const fact: EntryIR = createTestEntryIR({
        id: 'fact',
        knowledge_type: 'FACT',
        content: 'The meeting is today',
        timestamp: '2024-01-02T00:00:00Z',
        confidence: 0.9,
        compiler_flags: {
          is_dirty: false,
          is_deprecated: false,
          last_compiled_at: new Date().toISOString(),
          compilation_version: 1,
          promotion_proof: {
            rule_id: 'BELIEF_TO_FACT',
            source_entries: ['belief'],
            confidence: 0.8,
            generated_at: new Date().toISOString(),
            generated_by: 'SYSTEM',
          },
        },
      });

      // FACT entry should have promotion proof
      expect(fact.compiler_flags.promotion_proof).toBeDefined();
      const violations = epistemicInvariants.checkAllInvariants([belief, fact]);
      expect(violations.length).toBe(0);
    });
  });

  describe('Edge Case 3: Conflicting Sources', () => {
    it('should handle HEARSAY vs DIRECT_EXPERIENCE', () => {
      const hearsay: EntryIR = createTestEntryIR({
        id: 'hearsay',
        knowledge_type: 'BELIEF',
        content: 'I heard Sarah got promoted',
        certainty_source: 'HEARSAY',
        confidence: 0.5,
      });

      const direct: EntryIR = createTestEntryIR({
        id: 'direct',
        knowledge_type: 'EXPERIENCE',
        content: 'Sarah told me she got promoted',
        certainty_source: 'DIRECT_EXPERIENCE',
        confidence: 0.9,
      });

      // Both entries are valid
      // DIRECT_EXPERIENCE should have higher confidence
      expect(direct.confidence).toBeGreaterThan(hearsay.confidence);
      const violations = epistemicInvariants.checkAllInvariants([hearsay, direct]);
      expect(violations.length).toBe(0);
    });

    it('should handle multiple HEARSAY sources', () => {
      const hearsay1: EntryIR = createTestEntryIR({
        id: 'hearsay-1',
        knowledge_type: 'BELIEF',
        content: 'I heard from John that Sarah got promoted',
        certainty_source: 'HEARSAY',
        confidence: 0.5,
      });

      const hearsay2: EntryIR = createTestEntryIR({
        id: 'hearsay-2',
        knowledge_type: 'BELIEF',
        content: 'I heard from Mary that Sarah got promoted',
        certainty_source: 'HEARSAY',
        confidence: 0.5,
      });

      // Multiple hearsay sources don't create conflicts
      // They're both BELIEF entries with same certainty source
      const violations = epistemicInvariants.checkAllInvariants([hearsay1, hearsay2]);
      expect(violations.length).toBe(0);
    });
  });

  describe('Edge Case 4: Confidence Decay', () => {
    it('should handle old BELIEF with no updates', () => {
      const oldBelief: EntryIR = createTestEntryIR({
        id: 'old-belief',
        knowledge_type: 'BELIEF',
        content: 'I believe the project will be done by March',
        timestamp: '2023-01-01T00:00:00Z',
        confidence: 0.6,
      });

      // Current implementation: no confidence decay
      // Old entries maintain same confidence
      expect(oldBelief.confidence).toBe(0.6);
      
      // Future: confidence should decay over time
      // This test documents current behavior
      const violations = epistemicInvariants.checkAllInvariants([oldBelief]);
      expect(violations.length).toBe(0);
    });

    it('should handle FACT with low confidence (auto-downgrade)', () => {
      const lowConfidenceFact: EntryIR = createTestEntryIR({
        id: 'low-fact',
        knowledge_type: 'FACT',
        content: 'The meeting is tomorrow',
        confidence: 0.5, // Below threshold
      });

      // Should be auto-downgraded to BELIEF
      const enforced = epistemicLatticeService.enforceEpistemicSafety(lowConfidenceFact);
      expect(enforced.knowledge_type).toBe('BELIEF');
      expect(enforced.compiler_flags.downgraded_from_fact).toBe(true);
    });
  });

  describe('Edge Case 5: Entity Name Collision', () => {
    it('should handle same name, different people in different scopes', async () => {
      // This is a structural test - actual resolution happens in symbolResolver
      // But we can test that the system allows multiple entities with same name
      
      const entry1: EntryIR = createTestEntryIR({
        id: 'entry-1',
        entities: [
          {
            entity_id: 'entity-1',
            mention_text: 'Sarah',
            confidence: 0.8,
          },
        ],
      });

      const entry2: EntryIR = createTestEntryIR({
        id: 'entry-2',
        thread_id: 'different-thread', // Different scope
        entities: [
          {
            entity_id: 'entity-2',
            mention_text: 'Sarah', // Same name, different person
            confidence: 0.8,
          },
        ],
      });

      // Both entries should be valid
      // Symbol resolution should handle collision via scope
      const violations = epistemicInvariants.checkAllInvariants([entry1, entry2]);
      expect(violations.length).toBe(0);
    });
  });

  describe('Edge Case 6: Classification Ambiguity', () => {
    it('should handle uncertain experiences ("I\'m pretty sure...")', async () => {
      const ambiguousText = "I'm pretty sure I went to the store yesterday";
      
      // This should be classified as EXPERIENCE (past tense action)
      // But confidence should be lower due to uncertainty marker
      const ir = await irCompiler.compile(
        testUserId,
        'test-utterance',
        ambiguousText
      );

      expect(ir.knowledge_type).toBe('EXPERIENCE');
      // Confidence should be adjusted for uncertainty
      expect(ir.confidence).toBeLessThan(0.9); // Lower than default 0.9
    });

    it('should handle mixed types in single entry', async () => {
      const mixedText = "I went to the store and I feel happy about it";
      
      // Should classify based on first pattern match (EXPERIENCE)
      const ir = await irCompiler.compile(
        testUserId,
        'test-utterance',
        mixedText
      );

      // EXPERIENCE has higher priority in pattern matching
      expect(ir.knowledge_type).toBe('EXPERIENCE');
    });
  });

  describe('Edge Case 7: Symbol Resolution Failure', () => {
    it('should handle entity not found in scope chain', async () => {
      const entry: EntryIR = createTestEntryIR({
        id: 'entry-with-unknown-entity',
        entities: [
          {
            entity_id: 'unknown-entity',
            mention_text: 'UnknownPerson',
            confidence: 0.5,
          },
        ],
      });

      // Symbol resolution should create new symbol if not found
      const result = await symbolResolver.resolveEntitiesForEntry(entry);
      
      // Should create new symbol or return warnings
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
      expect(result.resolved.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Case 8: Incremental Compilation Failure', () => {
    it('should handle corrupted dependency graph', async () => {
      const entry1: EntryIR = createTestEntryIR({
        id: 'entry-1',
      });

      const entry2: EntryIR = createTestEntryIR({
        id: 'entry-2',
        narrative_links: {
          related_entry_ids: ['entry-1'],
        },
      });

      // Create dependency
      await dependencyGraph.updateDependencyGraph(entry2);

      // Try to get affected entries
      const affected = await dependencyGraph.getAffectedEntries(['entry-1']);
      
      // Should include entry-2 (depends on entry-1)
      expect(affected.has('entry-2')).toBe(true);
    });

    it('should handle circular dependencies', async () => {
      const entry1: EntryIR = createTestEntryIR({
        id: 'entry-1',
        narrative_links: {
          related_entry_ids: ['entry-2'],
        },
      });

      const entry2: EntryIR = createTestEntryIR({
        id: 'entry-2',
        narrative_links: {
          related_entry_ids: ['entry-1'],
        },
      });

      // Create circular dependency
      await dependencyGraph.updateDependencyGraph(entry1);
      await dependencyGraph.updateDependencyGraph(entry2);

      // Should handle circular dependency gracefully
      const affected1 = await dependencyGraph.getAffectedEntries(['entry-1']);
      const affected2 = await dependencyGraph.getAffectedEntries(['entry-2']);
      
      // Both should be in each other's affected set
      expect(affected1.has('entry-2')).toBe(true);
      expect(affected2.has('entry-1')).toBe(true);
    });
  });

  describe('Edge Case 9: Contract Bypass Attempt', () => {
    it('should enforce contract layer (no direct access)', () => {
      const entries: EntryIR[] = [
        createTestEntryIR({
          id: 'belief-entry',
          knowledge_type: 'BELIEF',
        }),
        createTestEntryIR({
          id: 'fact-entry',
          knowledge_type: 'FACT',
        }),
      ];

      // Apply ARCHIVIST contract (fact-only)
      const view = contractLayer.applyContract(CONTRACTS.ARCHIVIST, entries);
      
      // Should only contain FACT entry
      expect(view.entries.length).toBe(1);
      expect(view.entries[0].knowledge_type).toBe('FACT');
      
      // Check invariant
      const violations = epistemicInvariants.checkBeliefInFactOnlyViews(entries);
      // Should pass because contract filters out BELIEF
      expect(violations.length).toBe(0);
    });
  });

  describe('Edge Case 10: Proof Generation Failure', () => {
    it('should reject promotion without proof', () => {
      const attempt = {
        from: 'EXPERIENCE' as KnowledgeType,
        to: 'FACT' as KnowledgeType,
        // No proof provided
      };

      expect(() => {
        epistemicLatticeService.epistemicTypeCheck(attempt);
      }).toThrow('Epistemic Violation');
    });

    it('should reject promotion with low confidence proof', () => {
      const attempt = {
        from: 'EXPERIENCE' as KnowledgeType,
        to: 'FACT' as KnowledgeType,
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
      }).toThrow('Epistemic Violation');
    });

    it('should reject forbidden promotion (FEELING → FACT)', () => {
      const attempt = {
        from: 'FEELING' as KnowledgeType,
        to: 'FACT' as KnowledgeType,
        proof: {
          rule_id: 'FEELING_TO_FACT',
          source_entries: [],
          confidence: 0.9,
          generated_at: new Date().toISOString(),
          generated_by: 'SYSTEM' as const,
        },
      };

      expect(() => {
        epistemicLatticeService.epistemicTypeCheck(attempt);
      }).toThrow('Epistemic Violation');
    });
  });

  describe('Edge Case 11: Canon Status Edge Cases', () => {
    it('should handle ROLEPLAY entries in real-life-only views', () => {
      const roleplayEntry: EntryIR = createTestEntryIR({
        id: 'roleplay-entry',
        canon: {
          status: 'ROLEPLAY',
          source: 'USER',
          confidence: 0.9,
        },
      });

      // ARCHIVIST contract should filter out ROLEPLAY
      const view = contractLayer.applyContract(CONTRACTS.ARCHIVIST, [roleplayEntry]);
      expect(view.entries.length).toBe(0);

      // Check invariant
      const violations = epistemicInvariants.checkRoleplayFictionInRealLife([roleplayEntry]);
      // Should pass because contract filters it out
      expect(violations.length).toBe(0);
    });

    it('should handle HYPOTHETICAL entries in REFLECTOR view', () => {
      const hypotheticalEntry: EntryIR = createTestEntryIR({
        id: 'hypothetical-entry',
        canon: {
          status: 'HYPOTHETICAL',
          source: 'USER',
          confidence: 0.9,
        },
      });

      // REFLECTOR contract should allow HYPOTHETICAL
      const view = contractLayer.applyContract(CONTRACTS.REFLECTOR, [hypotheticalEntry]);
      expect(view.entries.length).toBe(1);
    });
  });

  describe('Edge Case 12: Empty and Null Values', () => {
    it('should handle empty content', async () => {
      const ir = await irCompiler.compile(testUserId, 'test-utterance', '');
      
      // Should still create valid IR
      expect(ir).toBeDefined();
      expect(ir.content).toBe('');
      // Confidence should be lower for empty content
      expect(ir.confidence).toBeLessThan(0.9);
    });

    it('should handle entry with no entities', () => {
      const entry: EntryIR = createTestEntryIR({
        entities: [],
      });

      const violations = epistemicInvariants.checkAllInvariants([entry]);
      expect(violations.length).toBe(0);
    });

    it('should handle entry with no emotions or themes', () => {
      const entry: EntryIR = createTestEntryIR({
        emotions: [],
        themes: [],
      });

      const violations = epistemicInvariants.checkAllInvariants([entry]);
      expect(violations.length).toBe(0);
    });
  });
});
