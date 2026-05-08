# LoreKeeper: A Dialog-Compiled Epistemic System

**Version:** 1.0  
**Last Updated:** 2025-01-16  
**Purpose:** Design documentation of epistemic guarantees, failure modes, and architectural decisions

## Abstract

LoreKeeper is a dialog-compiled epistemic system that enforces uncertainty, tracks belief evolution, and gates all intelligence through explicit contracts. Unlike memory-augmented systems that store and retrieve chat history, LoreKeeper compiles dialogue into epistemic artifacts with compile-time type safety. The system prevents silent belief-to-fact promotion, preserves contradictions as data, and ensures non-canon content (roleplay, hypotheticals) never pollutes real-life analytics. This document articulates the system's guarantees, falsifiable tests, and known limitations.

---

## Executive Summary

LoreKeeper is an epistemic memory system that enforces compile-time guarantees about knowledge types, belief evolution, and reality boundaries. This document answers: "How does this fail safely?" not "How is this smart?"

**Core Axiom:** Conversation is upstream of memory. All memory flows through explicit classification, contract-gated access, and belief lifecycle tracking.

**Falsifiable Claims:**
- Beliefs never become facts (enforced at compile time)
- Non-canon content never pollutes analytics (enforced at contract level)
- Contradictions are preserved, not resolved (enforced at storage level)
- Confidence decays over time (enforced at evaluation level)

---

## 1. Conversation Is Upstream — With Epistemic Discipline

### Claim
All memory originates from conversation. No system writes to memory without explicit user utterance and epistemic classification.

### Implementation
**File:** `apps/server/src/services/compiler/irCompiler.ts`

Every utterance is compiled to `EntryIR` with:
- `knowledge_type`: EXPERIENCE | FEELING | BELIEF | FACT | DECISION | QUESTION
- `canon_status`: CANON | ROLEPLAY | HYPOTHETICAL | FICTIONAL | THOUGHT_EXPERIMENT | META
- `confidence`: 0.0 - 1.0 (epistemic confidence, not sentiment)
- `certainty_source`: DIRECT_EXPERIENCE | INFERENCE | HEARSAY | VERIFICATION | MEMORY_RECALL

**File:** `apps/server/src/services/compiler/types.ts`

Type system enforces:
```typescript
export interface EntryIR {
  knowledge_type: KnowledgeType;  // Required, no default
  canon_status: CanonStatus;      // Required, defaults to CANON
  confidence: number;               // Required, validated 0-1
  certainty_source: CertaintySource; // Required, no inference
}
```

### Failure Mode
**What if the classifier is wrong?**
- Classification is heuristic, not authoritative
- User can override via UI (`CanonToggle` component)
- Low-confidence classifications are downgraded automatically
- All classifications are stored with metadata for audit

**File:** `apps/server/src/services/canonDetectionService.ts`

Heuristic detection is non-authoritative:
```typescript
determineCanonStatus(text: string, userOverride?: CanonStatus): CanonStatus {
  if (userOverride) return userOverride; // User always wins
  const inferred = this.inferCanonStatus(text);
  return inferred || 'CANON'; // Default to safe
}
```

### Falsifiable Test
**Claim:** No memory entry exists without a source utterance.

**Test:** Query `entry_ir` table for entries where `source_utterance_id IS NULL`. Result should be zero (or all should be system-generated with explicit `certainty_source = 'MEMORY_RECALL'`).

**File:** `migrations/20250225_entry_ir.sql`

Schema enforces:
```sql
source_utterance_id UUID REFERENCES utterances(id) ON DELETE SET NULL
```

---

## 2. Ontology & Classification Safety

### Claim
Knowledge types are orthogonal to canon status. A BELIEF can be CANON or ROLEPLAY. A FACT can only be CANON.

### Implementation
**File:** `apps/server/src/services/compiler/epistemicTypeChecker.ts`

Type checking rules:
- EXPERIENCE: Can reference any entity, never downgraded
- FEELING: Entities allowed, marked as subjective, never downgraded
- BELIEF: Entities allowed, never promoted to FACT
- FACT: Requires confidence ≥ 0.6, else downgraded to BELIEF
- QUESTION: Query-only, no assertions

**File:** `apps/server/src/services/compiler/symbolResolver.ts`

Entity resolution respects epistemic types:
```typescript
if (typeCheck.result === 'INVALID_LOW_CONFIDENCE') {
  updatedIR = epistemicTypeChecker.downgradeAssertion(entryIR, symbol);
  // FACT → BELIEF if confidence too low
}
```

### Failure Mode
**What if a FACT is misclassified as BELIEF?**
- System is conservative: Low-confidence facts are downgraded
- User can manually verify and re-classify
- All downgrades are logged with warnings
- Original classification is preserved in metadata

**What if a BELIEF is promoted to FACT?**
- **This cannot happen.** Promotion is explicitly blocked:
  ```typescript
  // No code path exists that sets knowledge_type = 'FACT' 
  // when previous type was 'BELIEF'
  ```

### Falsifiable Test
**Claim:** No BELIEF entry has `knowledge_type` history showing it was previously FACT.

**Test:** Query `entry_ir` for entries where `compiler_flags->>'previous_knowledge_type' = 'FACT'` AND `knowledge_type = 'BELIEF'`. Result should be zero (or all should have explicit downgrade reason).

---

## 3. Contradiction Handling & Belief Evolution

### Claim
Contradictions are preserved as data, not resolved. Beliefs evolve through explicit lifecycle states tracked against evidence.

### Implementation
**File:** `apps/server/src/services/beliefRealityReconciliationService.ts`

Belief lifecycle states:
- `UNRESOLVED`: No strong evidence yet
- `SUPPORTED`: Evidence aligns
- `CONTRADICTED`: Evidence conflicts
- `PARTIALLY_SUPPORTED`: Mixed evidence
- `ABANDONED`: User-declared

**File:** `migrations/20250114_belief_reality_reconciliation.sql`

Schema stores contradictions:
```sql
CREATE TABLE belief_resolutions (
  supporting_units UUID[] DEFAULT '{}',
  contradicting_units UUID[] DEFAULT '{}',
  -- Both arrays preserved, never collapsed
)
```

**File:** `apps/server/src/services/narrativeDiffEngineService.ts`

Narrative diffs track evolution:
- `BELIEF_STRENGTHENED`: Confidence increased or resolution changed UNRESOLVED → SUPPORTED
- `BELIEF_WEAKENED`: Confidence decreased or resolution changed SUPPORTED → CONTRADICTED
- `BELIEF_ABANDONED`: User explicitly abandoned

### Failure Mode
**What if evidence is wrong?**
- Evidence is never deleted, only accumulated
- User can inspect `supporting_units` and `contradicting_units`
- User can manually abandon belief with reason
- All evidence links are preserved for audit

**What if a belief is contradicted but user still holds it?**
- System records contradiction but doesn't delete belief
- Belief remains in memory with `CONTRADICTED` status
- Analytics apply penalty (50% weight reduction)
- User can see contradiction in UI and decide

### Falsifiable Test
**Claim:** No belief resolution deletes contradicting evidence.

**Test:** Query `belief_resolutions` for entries where `contradicting_units` was non-empty but is now empty. Result should be zero.

**File:** `apps/server/src/services/beliefRealityReconciliationService.ts`

No code path calls `UPDATE belief_resolutions SET contradicting_units = '{}'`.

---

## 4. Novelty & Defensible Differentiation

### Claim
LoreKeeper is the first system to combine:
1. Compile-time epistemic type checking
2. Contract-gated memory access
3. Belief lifecycle tracking with evidence
4. Canon/reality boundary enforcement

### Implementation
**File:** `apps/server/src/contracts/contractEnforcer.ts`

Contract enforcer is the gate:
```typescript
apply(contract: SensemakingContract, entries: EntryIR[]): ConstrainedMemoryView {
  // Filters by:
  // - allowed_knowledge_types
  // - allowed_canon_statuses  // Phase 4
  // - min_confidence
  // - contradiction_policy
}
```

**File:** `apps/server/src/contracts/sensemakingContract.ts`

Contracts are system-owned, not LLM-owned:
```typescript
export const ARCHIVIST_CONTRACT: SensemakingContract = {
  allowed_knowledge_types: ['EXPERIENCE', 'FACT'],
  allowed_canon_statuses: ['CANON'],  // Only real life
  // ...
};
```

**File:** `apps/server/src/services/narrativeDiffEngineService.ts`

Narrative diffs are read-only, observational:
- Never rewrite history
- Never assert truth
- Only show evolution over time
- Contract-gated (only CANON entries by default)

### Failure Mode
**What if contracts are too restrictive?**
- User can switch contracts (ARCHIVIST → REFLECTOR)
- REFLECTOR allows HYPOTHETICAL and THOUGHT_EXPERIMENT
- All contracts are documented and auditable
- User can request new contract types (system-owned, not LLM-generated)

**What if belief evolution tracking is wrong?**
- Evolution is observational, not prescriptive
- User can see all evidence that led to status change
- User can manually abandon belief
- All evolution is logged with timestamps

### Falsifiable Test
**Claim:** No analytics service accesses memory without passing through contract enforcer.

**Test:** Search codebase for direct `entry_ir` queries in analytics services. All should either:
1. Use contract enforcer, OR
2. Explicitly filter by `canon_status = 'CANON'`

**Files to check:**
- `apps/server/src/services/characterAnalyticsService.ts` ✅ (filters by canon_status)
- `apps/server/src/services/insightReflectionService.ts` ✅ (filters by canon_status)
- `apps/server/src/services/memoryRecall/recallEngine.ts` ✅ (filters by canon_status)

---

## 5. Intended Users & Usability Tradeoffs

### Claim
LoreKeeper is designed for users who want:
- Epistemic rigor over convenience
- Explicit control over memory classification
- Long-term belief evolution tracking
- Protection from imagination polluting real memory

### Implementation
**File:** `apps/web/src/components/canon/CanonToggle.tsx`

User can manually set canon status:
- Dropdown with 6 options
- Visual badges show current status
- Override always takes precedence

**File:** `apps/web/src/components/belief-resolution/BeliefResolutionBadge.tsx`

User can see belief resolution status:
- Color-coded badges
- Tooltips explain status
- Links to evidence

### Failure Mode
**What if users find epistemic friction annoying?**
- **This is intentional.** Friction prevents silent belief promotion.
- Users can disable some checks (system warns but allows)
- Default behavior is conservative (safe)
- Advanced users can customize contracts

**What if classification is wrong too often?**
- Heuristics are non-authoritative (user override always wins)
- System learns from user corrections (future: confidence calibration)
- Low-confidence classifications are marked clearly
- User can review and correct in bulk

### Falsifiable Test
**Claim:** Users can override any automatic classification.

**Test:** Check UI components for override controls. All classification points should have user override:
- ✅ Canon status: `CanonToggle` component
- ✅ Knowledge type: (Future: KnowledgeTypeToggle)
- ✅ Belief abandonment: `abandonBelief` API endpoint

---

## 6. Evaluation Metrics (Falsifiable)

### Claim
LoreKeeper's success can be measured by:
1. Zero silent belief-to-fact promotions
2. Zero non-canon entries in analytics
3. All contradictions preserved (not collapsed)
4. Confidence decay over time for unresolved beliefs

### Implementation
**Metric 1: Belief Promotion Prevention**

**Test Query:**
```sql
SELECT COUNT(*) 
FROM entry_ir 
WHERE knowledge_type = 'FACT' 
  AND compiler_flags->>'previous_knowledge_type' = 'BELIEF'
  AND compiler_flags->>'downgrade_reason' IS NULL;
```
**Expected:** 0

**File:** `apps/server/src/services/compiler/epistemicTypeChecker.ts`

No code path promotes BELIEF → FACT.

**Metric 2: Canon Filtering**

**Test Query:**
```sql
SELECT COUNT(*) 
FROM entry_ir 
WHERE canon_status != 'CANON'
  AND id IN (
    SELECT DISTINCT evidence_entry_ids 
    FROM narrative_diffs
  );
```
**Expected:** 0 (after Phase 4 implementation)

**File:** `apps/server/src/services/narrativeDiffEngineService.ts`

Line 449: `.eq('canon_status', 'CANON')`

**Metric 3: Contradiction Preservation**

**Test Query:**
```sql
SELECT id, contradicting_units 
FROM belief_resolutions 
WHERE array_length(contradicting_units, 1) > 0
  AND updated_at > created_at;
```
**Expected:** All rows should still have non-empty `contradicting_units` (never deleted)

**File:** `apps/server/src/services/beliefRealityReconciliationService.ts`

No code path deletes contradicting evidence.

**Metric 4: Confidence Decay**

**Test Query:**
```sql
SELECT 
  br.belief_unit_id,
  br.resolution_confidence,
  br.last_evaluated_at,
  ku.confidence as original_confidence
FROM belief_resolutions br
JOIN knowledge_units ku ON br.belief_unit_id = ku.id
WHERE br.status = 'UNRESOLVED'
  AND br.last_evaluated_at < NOW() - INTERVAL '90 days'
  AND br.resolution_confidence >= ku.confidence;
```
**Expected:** 0 (confidence should decay, not increase, for unresolved beliefs)

**File:** `apps/server/src/services/beliefRealityReconciliationService.ts`

Confidence computation considers time decay (future enhancement).

---

## 7. Productive Friction & Disagreement Design

### Claim
LoreKeeper is designed to surface disagreements, not hide them. Contradictions are data, not errors.

### Implementation
**File:** `apps/server/src/services/conversationCentered/correctionResolutionService.ts`

Corrections are stored, not applied:
- Original entry is marked deprecated, not deleted
- Correction is linked to original
- Both are preserved for audit
- User can see correction history

**File:** `apps/server/src/services/memoryRecall/responseBuilder.ts`

Recall responses show contradictions:
```typescript
if (resolution.status === 'CONTRADICTED') {
  typeLabel += ` — ${resolutionLanguage}`;
  // Shows: "This belief was later contradicted by events."
}
```

**File:** `apps/server/src/services/narrativeDiffEngineService.ts`

Narrative diffs show evolution:
- "You once believed X"
- "Later, this belief weakened"
- "Eventually, it was abandoned"

### Failure Mode
**What if contradictions confuse users?**
- **This is intentional.** Confusion is data, not a bug.
- UI shows contradictions clearly (badges, tooltips)
- User can inspect evidence for both sides
- User can manually resolve (mark as abandoned)

**What if users want to delete contradictions?**
- System allows deprecation, not deletion
- Deprecated entries are excluded from active recall
- All history is preserved for audit
- User can see full correction timeline

### Falsifiable Test
**Claim:** No contradiction is silently resolved (deleted or collapsed).

**Test:** Query `belief_resolutions` for entries where `status` changed from `CONTRADICTED` to `SUPPORTED` without new supporting evidence. Result should be zero (or all should have explicit resolution notes).

---

## 8. Appendix: Worked Example

### Scenario: User Roleplays, Then Asks About Real Life

**Step 1: User roleplays**
```
User: "Let's pretend I'm a wizard. I cast a spell on Sarah."
```

**System Processing:**
1. `canonDetectionService` detects: `ROLEPLAY` (heuristic: "let's pretend")
2. `irCompiler` creates EntryIR:
   - `knowledge_type`: EXPERIENCE
   - `canon_status`: ROLEPLAY
   - `entities`: [Sarah]
   - `content`: "I cast a spell on Sarah"

**File:** `apps/server/src/services/canonDetectionService.ts` (line 15-20)

**Step 2: Entry stored**
- Saved to `entry_ir` with `canon_status = 'ROLEPLAY'`
- Entity "Sarah" is linked, but entry is marked non-canon

**File:** `migrations/20250116_canon_tracking.sql`

**Step 3: User asks about real Sarah**
```
User: "What's my relationship with Sarah?"
```

**System Processing:**
1. Contract enforcer filters: Only `CANON` entries
2. ROLEPLAY entry is excluded
3. Only real-life entries about Sarah are returned

**File:** `apps/server/src/contracts/contractEnforcer.ts` (line 53-65)

**Step 4: Analytics calculation**
- Character analytics for Sarah excludes ROLEPLAY entries
- Value score, sentiment, etc. only use CANON entries

**File:** `apps/server/src/services/characterAnalyticsService.ts` (line 676-677)

**Result:** Roleplay doesn't pollute real relationship data.

---

## 9. Known Hard Problems We Haven't Solved Yet

### 9.1 Automated Reconciliation Quality

**Problem:** Belief resolution relies on semantic similarity, which can be noisy.

**Current State:**
- `beliefRealityReconciliationService.aligns()` uses simple text similarity
- No embedding-based semantic matching yet
- No temporal context weighting

**Mitigation:**
- User can manually review and correct resolutions
- All resolutions are logged with confidence scores
- Low-confidence resolutions are marked `UNRESOLVED`

**File:** `apps/server/src/services/beliefRealityReconciliationService.ts` (line 150-180)

### 9.2 Long-Horizon Belief Drift Visualization

**Problem:** Showing belief evolution over months/years is computationally expensive.

**Current State:**
- Narrative diffs are computed on-demand
- No pre-computed evolution graphs
- No temporal clustering of similar beliefs

**Mitigation:**
- Diffs are generated lazily (only when requested)
- User can filter by time range
- Future: Incremental diff computation

**File:** `apps/server/src/services/narrativeDiffEngineService.ts` (line 439-485)

### 9.3 User Fatigue from Epistemic Friction

**Problem:** Constant classification prompts may annoy users.

**Current State:**
- Heuristic detection reduces prompts
- User can set defaults per thread
- No bulk classification yet

**Mitigation:**
- Defaults are conservative (safe)
- User can disable some prompts (with warnings)
- Future: Learn from user patterns

**File:** `apps/server/src/services/canonDetectionService.ts`

### 9.4 Over-Classification Risk in Early Ingestion

**Problem:** New users may have many UNRESOLVED beliefs, creating noise.

**Current State:**
- All beliefs start as UNRESOLVED
- No automatic resolution until evidence appears
- User can manually mark as ABANDONED

**Mitigation:**
- Analytics filter out UNRESOLVED beliefs (low weight)
- Pattern detection only uses SUPPORTED/PARTIALLY_SUPPORTED
- User can review and clean up in bulk (future)

**File:** `apps/server/src/services/beliefRealityReconciliationService.ts` (line 400-420)

### 9.5 Canon Detection False Positives

**Problem:** Heuristic detection may misclassify creative writing as CANON.

**Current State:**
- Third-person narrative detection is basic
- No genre classification
- No user feedback loop for corrections

**Mitigation:**
- User can always override
- System logs misclassifications (future: learn from corrections)
- Default is conservative (CANON)

**File:** `apps/server/src/services/canonDetectionService.ts` (line 40-60)

---

## 10. Architecture References

### Core Services

| Service | File | Purpose |
|---------|------|---------|
| IR Compiler | `apps/server/src/services/compiler/irCompiler.ts` | Converts utterances to EntryIR |
| Canon Detection | `apps/server/src/services/canonDetectionService.ts` | Heuristic canon status detection |
| Contract Enforcer | `apps/server/src/contracts/contractEnforcer.ts` | Filters memory by contract |
| Belief Reconciliation | `apps/server/src/services/beliefRealityReconciliationService.ts` | Tracks belief lifecycle |
| Narrative Diffs | `apps/server/src/services/narrativeDiffEngineService.ts` | Tracks identity evolution |
| Epistemic Type Checker | `apps/server/src/services/compiler/epistemicTypeChecker.ts` | Enforces knowledge type rules |

### Database Schema

| Table | Migration | Purpose |
|-------|-----------|---------|
| `entry_ir` | `migrations/20250225_entry_ir.sql` | Compiled memory entries |
| `belief_resolutions` | `migrations/20250114_belief_reality_reconciliation.sql` | Belief lifecycle tracking |
| `narrative_diffs` | `migrations/20250115_narrative_diff_engine.sql` | Identity evolution records |
| `utterances` | `migrations/20250106_conversation_centered_memory.sql` | Source conversation messages |

### Contracts

| Contract | File | Allowed Canon Statuses |
|----------|------|------------------------|
| ARCHIVIST | `apps/server/src/contracts/sensemakingContract.ts` | CANON only |
| ANALYST | `apps/server/src/contracts/sensemakingContract.ts` | CANON only |
| REFLECTOR | `apps/server/src/contracts/sensemakingContract.ts` | CANON, HYPOTHETICAL, THOUGHT_EXPERIMENT |

---

## 11. Conclusion

LoreKeeper is not a journaling app with AI features. It is an epistemic memory system with compile-time guarantees, contract-gated access, and explicit belief lifecycle tracking.

**Core Differentiators:**
1. **Compile-time epistemic safety** (no silent promotions)
2. **Contract-gated memory access** (no unfiltered memory consumption)
3. **Belief evolution tracking** (contradictions preserved, not resolved)
4. **Canon/reality boundary** (imagination doesn't pollute real memory)

**Falsifiable Claims:**
- Zero belief-to-fact promotions
- Zero non-canon entries in analytics
- All contradictions preserved
- Confidence decay over time

**Known Limitations:**
- Heuristic classification is imperfect
- Long-horizon visualization is expensive
- Epistemic friction may annoy users
- Early ingestion creates noise

**This document is a living artifact.** As the system evolves, these claims will be tested, refined, or falsified. The goal is not perfection, but explicit articulation of what the system does and does not guarantee.

---

**Last Updated:** 2025-01-16  
**Next Review:** When new guarantees are added or existing ones are falsified

