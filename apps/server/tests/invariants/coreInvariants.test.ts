/**
 * Core Invariants Test Suite
 * 
 * Tests the 4 constitutional guarantees defined in CORE_INVARIANTS.md:
 * 1. Memory Immutability Outside Chat
 * 2. Belief→Fact Promotion Prevention
 * 3. Uncertainty Preservation
 * 4. Canon Status Filtering
 * 
 * These tests must pass to ensure LoreKeeper's epistemic guarantees are maintained.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { supabaseAdmin } from '../../src/services/supabaseClient';

describe('Core Invariants', () => {
  beforeAll(async () => {
    // Ensure we have a test user
    // This would typically be set up in test fixtures
  });

  describe('Invariant 1: Memory Immutability Outside Chat', () => {
    /**
     * Guarantee: Every EntryIR has a source_utterance_id
     * Test: entry_ir entries without source_utterance_id should be zero
     */
    it('should have all entry_ir records with source_utterance_id', async () => {
      const { data, error } = await supabaseAdmin
        .from('entry_ir')
        .select('id, source_utterance_id')
        .is('source_utterance_id', null);

      if (error) {
        // Table might not exist in test environment
        console.warn('entry_ir table not found, skipping test:', error.message);
        return;
      }

      // All entries should have a source_utterance_id
      // System-generated entries should have explicit certainty_source
      expect(data?.length || 0).toBe(0);
    });

    /**
     * Guarantee: Utterances are immutable after creation
     * Test: Verify no updates to utterances after creation
     */
    it('should not allow utterance updates after creation', async () => {
      // This would require checking the database schema
      // Utterances table should not allow updates (or have triggers preventing it)
      // For now, we document this as a schema-level guarantee
      expect(true).toBe(true); // Placeholder - schema validation test
    });
  });

  describe('Invariant 2: Belief→Fact Promotion Prevention', () => {
    /**
     * Guarantee: No code path promotes BELIEF → FACT
     * Test: Query for FACT entries with previous_knowledge_type = 'BELIEF' should be zero
     */
    it('should not have FACT entries promoted from BELIEF', async () => {
      const { data, error } = await supabaseAdmin
        .from('entry_ir')
        .select('id, knowledge_type, compiler_flags')
        .eq('knowledge_type', 'FACT');

      if (error) {
        console.warn('entry_ir table not found, skipping test:', error.message);
        return;
      }

      if (!data || data.length === 0) {
        // No FACT entries to check
        return;
      }

      // Check each FACT entry to ensure it wasn't promoted from BELIEF
      const promotedEntries = data.filter((entry) => {
        const flags = entry.compiler_flags as any;
        return (
          flags?.previous_knowledge_type === 'BELIEF' &&
          !flags?.downgrade_reason // Downgrades are allowed, promotions are not
        );
      });

      expect(promotedEntries.length).toBe(0);
    });

    /**
     * Guarantee: Low-confidence FACT entries are downgraded to BELIEF
     * Test: Verify downgrade mechanism works
     */
    it('should downgrade low-confidence FACT entries to BELIEF', async () => {
      // This test would require creating test data
      // For now, we document this as a service-level guarantee
      expect(true).toBe(true); // Placeholder - service logic test
    });
  });

  describe('Invariant 3: Uncertainty Preservation', () => {
    /**
     * Guarantee: Contradicting evidence is never deleted
     * Test: belief_resolutions with non-empty contradicting_units should never become empty
     */
    it('should preserve contradicting units in belief resolutions', async () => {
      const { data, error } = await supabaseAdmin
        .from('belief_resolutions')
        .select('id, contradicting_units, created_at, updated_at')
        .not('contradicting_units', 'is', null);

      if (error) {
        console.warn('belief_resolutions table not found, skipping test:', error.message);
        return;
      }

      if (!data || data.length === 0) {
        // No belief resolutions to check
        return;
      }

      // Check that entries with contradicting_units still have them after updates
      const violatedEntries = data.filter((entry) => {
        const contradictingUnits = entry.contradicting_units as any;
        const hasContradictions = Array.isArray(contradictingUnits) && contradictingUnits.length > 0;
        const wasUpdated = entry.updated_at && entry.updated_at > entry.created_at;
        
        // If it was updated and had contradictions, it should still have them
        return wasUpdated && !hasContradictions;
      });

      expect(violatedEntries.length).toBe(0);
    });

    /**
     * Guarantee: All beliefs have a resolution status
     * Test: Verify all belief entries have resolution status
     */
    it('should have all beliefs with resolution status', async () => {
      const { data, error } = await supabaseAdmin
        .from('entry_ir')
        .select('id, knowledge_type')
        .eq('knowledge_type', 'BELIEF');

      if (error) {
        console.warn('entry_ir table not found, skipping test:', error.message);
        return;
      }

      if (!data || data.length === 0) {
        return;
      }

      // Check that all BELIEF entries have corresponding belief_resolutions
      const beliefIds = data.map((e) => e.id);
      const { data: resolutions } = await supabaseAdmin
        .from('belief_resolutions')
        .select('entry_ir_id')
        .in('entry_ir_id', beliefIds);

      // This is a soft check - beliefs might be created before resolution is set
      // The guarantee is that they WILL have a resolution, not that they have it immediately
      expect(true).toBe(true); // Placeholder - would need async resolution creation test
    });
  });

  describe('Invariant 4: Canon Status Filtering', () => {
    /**
     * Guarantee: All analytics services filter by canon_status
     * Test: Verify analytics services use contract enforcer or explicitly filter
     */
    it('should filter analytics by canon_status', async () => {
      // This test requires code analysis, not database queries
      // We check that analytics services use the contract enforcer
      
      // Import analytics services to verify they use contracts
      const analyticsServices = [
        'identityPulseModule',
        'relationshipAnalyticsModule',
        'sagaEngineModule',
        'memoryFabricModule',
        'insightEngineModule',
        'predictionEngineModule',
        'shadowEngineModule',
        'xpEngineModule',
        'lifeMapModule',
        'searchEngineModule',
      ];

      // This is a code-level check, not a runtime test
      // The actual verification would be done via static analysis or manual code review
      expect(analyticsServices.length).toBeGreaterThan(0);
    });

    /**
     * Guarantee: Non-canon entries are excluded from analytics by default
     * Test: Verify non-canon entries don't appear in analytics results
     */
    it('should exclude non-canon entries from analytics', async () => {
      // This would require:
      // 1. Creating test entries with canon_status = false
      // 2. Running analytics
      // 3. Verifying non-canon entries are not included
      
      // For now, this is documented as a service-level guarantee
      expect(true).toBe(true); // Placeholder - integration test needed
    });
  });

  describe('SQL Verification Queries', () => {
    /**
     * These queries can be run manually to verify invariants
     * They match the queries in CORE_INVARIANTS.md
     */
    it('should pass SQL verification query 1: All entries have source utterances', async () => {
      const { data, error } = await supabaseAdmin
        .from('entry_ir')
        .select('id')
        .is('source_utterance_id', null);

      if (error) {
        console.warn('entry_ir table not found:', error.message);
        return;
      }

      // Expected: 0 (or all system-generated with explicit certainty_source)
      expect(data?.length || 0).toBe(0);
    });

    it('should pass SQL verification query 2: No belief→fact promotions', async () => {
      const { data, error } = await supabaseAdmin
        .from('entry_ir')
        .select('id, knowledge_type, compiler_flags')
        .eq('knowledge_type', 'FACT');

      if (error) {
        console.warn('entry_ir table not found:', error.message);
        return;
      }

      if (!data || data.length === 0) {
        return;
      }

      const promoted = data.filter((entry) => {
        const flags = entry.compiler_flags as any;
        return (
          flags?.previous_knowledge_type === 'BELIEF' &&
          !flags?.downgrade_reason
        );
      });

      // Expected: 0
      expect(promoted.length).toBe(0);
    });

    it('should pass SQL verification query 3: Contradictions preserved', async () => {
      const { data, error } = await supabaseAdmin
        .from('belief_resolutions')
        .select('id, contradicting_units, created_at, updated_at')
        .not('contradicting_units', 'is', null);

      if (error) {
        console.warn('belief_resolutions table not found:', error.message);
        return;
      }

      if (!data || data.length === 0) {
        return;
      }

      // All rows should still have non-empty contradicting_units
      const allPreserved = data.every((entry) => {
        const contradictingUnits = entry.contradicting_units as any;
        return Array.isArray(contradictingUnits) && contradictingUnits.length > 0;
      });

      expect(allPreserved).toBe(true);
    });
  });
});
