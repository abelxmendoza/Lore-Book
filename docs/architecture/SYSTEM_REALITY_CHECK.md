# System Reality Check — Epistemic Architecture

> Elevated from `HOSTILE_REVIEW_RESPONSE.md` (originally titled "LoreKeeper: A Dialog-Compiled Epistemic System")  
> **Version:** 1.0 | **Last Updated:** 2025-01-16  
> **Purpose:** This document answers *"How does this fail safely?"* not *"How is this smart?"*

---

## What This Document Is

This is the sanity check document. It makes explicit, falsifiable claims about what the system guarantees and doesn't, how each guarantee is enforced in actual code, what the known failure modes are, and what hard problems remain unsolved.

If something here is wrong, that's a bug. Not a roadmap item. A bug.

---

## Core Claims (Falsifiable)

| Claim | Enforcement Point | Test |
|-------|------------------|------|
| Beliefs never become facts | `compiler/epistemicTypeChecker.ts` — no code path promotes BELIEF → FACT | Query `entry_ir` for rows where `previous_knowledge_type = 'BELIEF'` AND `knowledge_type = 'FACT'` → must be zero |
| Non-canon content never pollutes analytics | `contracts/contractEnforcer.ts` — filters to CANON only | Query analytics tables for entries with `canon_status != 'CANON'` → must be zero |
| Contradictions are preserved, not resolved | `beliefRealityReconciliationService.ts` — no path deletes `contradicting_units` | Query `belief_resolutions` for rows where `contradicting_units` was non-empty but is now `{}` → must be zero |
| Memory originates from conversation | `compiler/irCompiler.ts` — every `EntryIR` has `source_utterance_id` | Query `entry_ir` for `source_utterance_id IS NULL` (non-system) → must be zero |
| Confidence decays over time | `beliefRealityReconciliationService.ts` — decay function applied | Query beliefs unresolved for > 90 days with increasing confidence → must be zero |

---

## 1. Conversation Is Upstream

**Claim:** All memory originates from conversation. No system writes to memory without an explicit user utterance and epistemic classification.

**Enforcement:**
- `compiler/irCompiler.ts` — every utterance compiles to `EntryIR` with required `source_utterance_id`
- `compiler/types.ts` — TypeScript interface enforces all epistemic fields are present

```typescript
export interface EntryIR {
  knowledge_type: KnowledgeType;     // Required, no default
  canon_status: CanonStatus;         // Required, defaults to CANON
  confidence: number;                // Required, validated 0–1
  certainty_source: CertaintySource; // Required, no inference
  source_utterance_id: string;       // Required
}
```

**Failure mode:** What if the classifier is wrong?
- Classification is heuristic, not authoritative
- User can override via `CanonToggle` component
- Low-confidence classifications are downgraded automatically
- All classifications are stored with metadata for audit

**SQL schema enforces:**
```sql
source_utterance_id UUID REFERENCES utterances(id) ON DELETE SET NULL
```
(`migrations/20250225_entry_ir.sql`)

---

## 2. Epistemic Type Safety

**Claim:** Knowledge types are strictly enforced. Beliefs never become facts.

**Type rules** (`compiler/epistemicTypeChecker.ts`):
- `EXPERIENCE` — never downgraded, no assertions enforced
- `FEELING` — subjective, marked as such, never downgraded
- `BELIEF` — never promoted to FACT, ever
- `FACT` — requires confidence ≥ 0.6, else auto-downgraded to BELIEF
- `QUESTION` — query-only, no assertions

**Canon vs knowledge type are orthogonal:**
- A BELIEF can be CANON or ROLEPLAY
- A FACT can only be CANON

**What if a BELIEF is promoted to FACT?** — This cannot happen. There is no code path that does it.

```typescript
// compiler/symbolResolver.ts
if (typeCheck.result === 'INVALID_LOW_CONFIDENCE') {
  updatedIR = epistemicTypeChecker.downgradeAssertion(entryIR, symbol);
  // FACT → BELIEF when confidence is low. Never the reverse.
}
```

---

## 3. Contradiction Handling

**Claim:** Contradictions are preserved as data. Beliefs evolve through explicit lifecycle states.

**Lifecycle states** (`beliefRealityReconciliationService.ts`):
- `UNRESOLVED` — no strong evidence yet
- `SUPPORTED` — evidence aligns
- `CONTRADICTED` — evidence conflicts
- `PARTIALLY_SUPPORTED` — mixed evidence
- `ABANDONED` — user explicitly abandoned

**Schema stores both sides permanently:**
```sql
CREATE TABLE belief_resolutions (
  supporting_units    UUID[] DEFAULT '{}',
  contradicting_units UUID[] DEFAULT '{}'
  -- Both arrays are append-only. Neither is ever cleared.
);
```
(`migrations/20250114_belief_reality_reconciliation.sql`)

**Failure mode:** What if a user wants to delete a contradiction?
- System allows deprecation, not deletion
- Deprecated entries are excluded from active recall
- All history is preserved for audit

---

## 4. Canon / Reality Boundary

**Claim:** Non-canon content (roleplay, hypotheticals) never pollutes real-life analytics.

**Enforcement:** `contracts/contractEnforcer.ts` — every memory consumer must declare a contract specifying allowed canon statuses.

| Contract | Allowed Canon | Use Case |
|----------|--------------|---------|
| `ARCHIVIST` | CANON only | Factual recall |
| `ANALYST` | CANON only | Analytics, patterns |
| `REFLECTOR` | CANON, HYPOTHETICAL, THOUGHT_EXPERIMENT | Deep reflection |

**Worked example — roleplay scenario:**

```
User: "Let's pretend I'm a wizard. I cast a spell on Sarah."
```

1. `canonDetectionService` detects: `ROLEPLAY` (heuristic: "let's pretend")
2. `irCompiler` saves EntryIR with `canon_status = 'ROLEPLAY'`
3. Entity "Sarah" is linked but entry is non-canon

```
User: "What's my relationship with Sarah?"
```

1. Contract enforcer filters: only `CANON` entries
2. ROLEPLAY entry is excluded
3. Only real-life entries about Sarah are returned
4. Character analytics for Sarah excludes all ROLEPLAY entries

**Result:** Roleplay doesn't pollute real relationship data.

---

## 5. Memory is Never Edited, Only Reinterpreted

**Claim:** The system never silently overwrites, resolves, or deletes contradictions.

**Implementation** (`conversationCentered/correctionResolutionService.ts`):
- Corrections are stored as new entries, not applied retroactively
- Original entry is marked deprecated, not deleted
- Both original and correction are preserved
- User can see full correction timeline

**Recall shows contradictions explicitly** (`memoryRecall/responseBuilder.ts`):
```typescript
if (resolution.status === 'CONTRADICTED') {
  typeLabel += ` — ${resolutionLanguage}`;
  // "This belief was later contradicted by events."
}
```

---

## 6. SQL Audit Queries

Run these to verify the system is behaving correctly:

**Belief-to-fact promotions (must be zero):**
```sql
SELECT COUNT(*)
FROM entry_ir
WHERE knowledge_type = 'FACT'
  AND compiler_flags->>'previous_knowledge_type' = 'BELIEF';
```

**Non-canon entries in analytics (must be zero after Phase 4):**
```sql
SELECT COUNT(*)
FROM entry_ir
WHERE canon_status != 'CANON'
  AND id IN (
    SELECT DISTINCT evidence_entry_ids
    FROM narrative_diffs
  );
```

**Contradiction preservation (contradicting_units should never be cleared):**
```sql
SELECT id, contradicting_units
FROM belief_resolutions
WHERE array_length(contradicting_units, 1) > 0
  AND updated_at > created_at;
-- All rows should still have non-empty contradicting_units
```

**Unresolved beliefs with increasing confidence (must be zero):**
```sql
SELECT br.belief_unit_id, br.resolution_confidence, ku.confidence AS original
FROM belief_resolutions br
JOIN knowledge_units ku ON br.belief_unit_id = ku.id
WHERE br.status = 'UNRESOLVED'
  AND br.last_evaluated_at < NOW() - INTERVAL '90 days'
  AND br.resolution_confidence >= ku.confidence;
```

---

## 7. Known Hard Problems (Unsolved)

### Automated Reconciliation Quality
`beliefRealityReconciliationService.aligns()` uses simple text similarity — no embedding-based semantic matching yet. Low-confidence resolutions are marked `UNRESOLVED` as a safeguard.

### Long-Horizon Belief Drift Visualization
Showing belief evolution over months is computationally expensive. Diffs are generated lazily (on-demand only). No pre-computed evolution graphs.

### User Fatigue from Epistemic Friction
Constant classification prompts may annoy users. Heuristic detection reduces prompts but doesn't eliminate them. Users can set defaults per thread.

### Over-Classification in Early Ingestion
New users have many `UNRESOLVED` beliefs, creating noise. Analytics filter these out (low weight), but the UX is noisy until enough evidence accumulates.

### Canon Detection False Positives
Heuristic detection can misclassify creative writing as CANON. User can always override. Default is conservative (CANON, not ROLEPLAY).

---

## 8. Key Files

| Concept | File |
|---------|------|
| IR Compiler | `services/compiler/irCompiler.ts` |
| Epistemic Type Checker | `services/compiler/epistemicTypeChecker.ts` |
| Canon Detection | `services/canonDetectionService.ts` |
| Contract Enforcer | `contracts/contractEnforcer.ts` |
| Belief Reconciliation | `services/beliefRealityReconciliationService.ts` |
| Narrative Diffs | `services/narrativeDiffEngineService.ts` |

---

## 9. Conclusion

LoreKeeper is not a journaling app with AI features. It is an epistemic memory system with compile-time guarantees, contract-gated access, and explicit belief lifecycle tracking.

**Core differentiators:**
1. Compile-time epistemic type safety (no silent promotions)
2. Contract-gated memory access (no unfiltered consumption)
3. Belief evolution tracking (contradictions preserved, not resolved)
4. Canon/reality boundary (imagination doesn't pollute real memory)

**This document is a living contract.** When new guarantees are added or existing ones are falsified, update this document first. If the code violates a claim here, that's a bug — not a feature request.

**Next review:** When new epistemic guarantees are added or when any claim is falsified by a code path.
