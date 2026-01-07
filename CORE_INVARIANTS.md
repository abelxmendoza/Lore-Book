# Core Invariants (Constitutional)

**Version:** 1.0  
**Last Updated:** 2025-01-16  
**Purpose:** Define LoreKeeper's epistemic guarantees. These files are constitutional - any change must justify why it doesn't violate these invariants.

---

## Constitutional Files

These files define LoreKeeper's core epistemic guarantees. Modifications require explicit justification.

### 1. `apps/server/src/services/compiler/irCompiler.ts`

**Invariant:** Dialog compilation is the only path to memory creation. No memory mutation outside the chat loop.

**Guarantees:**
- Every `EntryIR` has a `source_utterance_id`
- Utterances are immutable after creation
- Compilation happens at ingestion, not retroactively
- All epistemic classification happens during compilation

**Change Process:**
- [ ] Identify which guarantee is touched
- [ ] Justify why change doesn't allow memory mutation outside chat
- [ ] Add test: `entry_ir` entries without `source_utterance_id` should be zero
- [ ] Update this document if guarantee changes

---

### 2. `apps/server/src/services/compiler/epistemicTypeChecker.ts`

**Invariant:** Beliefs never become facts. Type safety prevents silent promotion.

**Guarantees:**
- No code path promotes `BELIEF` → `FACT`
- Low-confidence `FACT` entries are downgraded to `BELIEF`
- `EXPERIENCE` and `FEELING` are never downgraded
- Type checking happens at compile time, not runtime

**Change Process:**
- [ ] Identify which guarantee is touched
- [ ] Justify why change doesn't allow belief→fact promotion
- [ ] Add test: Query for `FACT` entries with `previous_knowledge_type = 'BELIEF'` should be zero
- [ ] Update this document if guarantee changes

---

### 3. `apps/server/src/services/beliefRealityReconciliationService.ts`

**Invariant:** Uncertainty is preserved, not erased. Belief lifecycle tracks evolution against evidence.

**Guarantees:**
- All beliefs have a resolution status (UNRESOLVED, SUPPORTED, CONTRADICTED, etc.)
- Contradicting evidence is never deleted
- Confidence scores are required and validated (0.0-1.0)
- Belief evolution is tracked, not rewritten

**Change Process:**
- [ ] Identify which guarantee is touched
- [ ] Justify why change doesn't erase uncertainty
- [ ] Add test: `belief_resolutions` with non-empty `contradicting_units` should never become empty
- [ ] Update this document if guarantee changes

---

### 4. `apps/server/src/contracts/contractEnforcer.ts`

**Invariant:** All memory access is contract-gated. No system consumes memory without explicit epistemic rules.

**Guarantees:**
- Every memory consumer must declare a contract
- Contracts filter by knowledge type, canon status, and confidence
- Non-canon entries are excluded from analytics by default
- Contracts are system-owned, not LLM-generated

**Change Process:**
- [ ] Identify which guarantee is touched
- [ ] Justify why change doesn't allow unfiltered memory access
- [ ] Add test: All analytics services should use contract enforcer or explicitly filter by `canon_status`
- [ ] Update this document if guarantee changes

---

## Change Review Process

Before modifying any constitutional file:

1. **Identify the Invariant**
   - Which guarantee does this change touch?
   - What is the current behavior?
   - What will the new behavior be?

2. **Justify Epistemic Safety**
   - Why does this change not violate the invariant?
   - What new guarantees are needed?
   - What edge cases are handled?

3. **Add Falsifiable Test**
   - Write a test that would fail if the invariant is violated
   - Include SQL queries or code path analysis
   - Document expected results

4. **Update Documentation**
   - Update this file if guarantees change
   - Update `HOSTILE_REVIEW_RESPONSE.md` if claims change
   - Update relevant service documentation

5. **Review**
   - Get explicit approval for constitutional changes
   - Document the decision and rationale
   - Add to change log

---

## Related Files (Protected, Not Constitutional)

These files implement the guarantees but can be modified more freely:

- `apps/server/src/services/narrativeDiffEngineService.ts` - Implements belief evolution tracking
- `apps/server/src/services/compiler/types.ts` - Type definitions (can extend, not break)
- `apps/server/src/contracts/sensemakingContract.ts` - Contract definitions (can add, not remove guarantees)
- `apps/server/src/services/canonDetectionService.ts` - Heuristic detection (non-authoritative)

---

## Violation Examples (What NOT to Do)

❌ **Adding a direct write path to `entry_ir` that bypasses `irCompiler`**
- Violates: Dialog compilation invariant
- Risk: Memory mutation outside chat loop

❌ **Allowing `BELIEF` entries to be promoted to `FACT` based on confidence**
- Violates: Type safety invariant
- Risk: Silent belief→fact promotion

❌ **Deleting `contradicting_units` when belief becomes SUPPORTED**
- Violates: Uncertainty preservation invariant
- Risk: Uncertainty erased, history rewritten

❌ **Allowing analytics to access memory without contract filtering**
- Violates: Contract gating invariant
- Risk: Non-canon content pollutes analytics

---

## Testing the Invariants

Run these tests regularly to ensure invariants hold:

```sql
-- Test 1: All entries have source utterances
SELECT COUNT(*) FROM entry_ir WHERE source_utterance_id IS NULL;
-- Expected: 0 (or all system-generated with explicit certainty_source)

-- Test 2: No belief→fact promotions
SELECT COUNT(*) FROM entry_ir 
WHERE knowledge_type = 'FACT' 
  AND compiler_flags->>'previous_knowledge_type' = 'BELIEF'
  AND compiler_flags->>'downgrade_reason' IS NULL;
-- Expected: 0

-- Test 3: Contradictions preserved
SELECT id, contradicting_units FROM belief_resolutions 
WHERE array_length(contradicting_units, 1) > 0
  AND updated_at > created_at;
-- Expected: All rows should still have non-empty contradicting_units

-- Test 4: Canon filtering in analytics
-- Manual code review: All analytics services should filter by canon_status
```

---

**Last Updated:** 2025-01-16  
**Next Review:** When any constitutional file is modified

