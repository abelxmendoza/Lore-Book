# Epistemic Lattice + Proof System (Phase 3.5)

## Overview

The Epistemic Lattice formalizes the knowledge type hierarchy and promotion rules with mathematical rigor. Every promotion requires proof, and invariants are enforced system-wide.

## Lattice Definition

### Partial Order ⊑

```
EXPERIENCE ⊑ FACT
BELIEF ⊑ FACT
```

**Allowed Promotions:**
- `EXPERIENCE → FACT` (with proof)
- `BELIEF → FACT` (with proof)

**Forbidden Promotions:**
- `FEELING → FACT` (never allowed)
- `FEELING → BELIEF` (never allowed)
- `QUESTION → FACT` (never allowed)
- `QUESTION → BELIEF` (never allowed)
- `QUESTION → EXPERIENCE` (never allowed)
- `DECISION → FACT` (never allowed)

**Downgrades:**
- Always allowed (safety mechanism)
- `FACT → BELIEF` (automatic if confidence < 0.6)
- `FACT → EXPERIENCE` (allowed)

## Proof-Carrying Data

Every promotion must carry a proof artifact:

```typescript
interface EpistemicProof {
  rule_id: string;              // e.g. "EXPERIENCE_TO_FACT"
  source_entries: string[];    // Evidence EntryIR IDs
  confidence: number;           // Proof confidence (≥ 0.6)
  generated_at: string;        // ISO timestamp
  generated_by: 'SYSTEM' | 'USER';
  reasoning?: string;          // Optional explanation
}
```

## Type Checking Rules

1. **Forbidden edges are absolute** - No proof can override
2. **Lattice ordering must be respected** - Only defined edges allowed
3. **Promotions require proof** - No proof = no promotion
4. **Proof confidence threshold** - Must be ≥ 0.6

## Automatic Downgrading

Safe failure mode: downgrade instead of error.

**Rule:** `FACT` with confidence < 0.6 → automatically downgraded to `BELIEF`

```typescript
if (entry.knowledge_type === 'FACT' && entry.confidence < 0.6) {
  return {
    ...entry,
    knowledge_type: 'BELIEF',
    compiler_flags: {
      ...entry.compiler_flags,
      downgraded_from_fact: true
    }
  };
}
```

## Formal Invariants

These invariants are testable and must never be violated:

### Invariant 1: BELIEF never in FACT-only views
- `ARCHIVIST` contract only allows `EXPERIENCE` + `FACT`
- `BELIEF` entries are filtered out

### Invariant 2: FEELING never contributes to analytics
- `ANALYST` contract only allows `EXPERIENCE`
- `FEELING` entries are filtered out

### Invariant 3: EXPERIENCE is the only pattern source
- Pattern detection uses `ANALYST` contract
- Only `EXPERIENCE` entries are used

### Invariant 4: No entry consumed without contract
- All memory access goes through `contractLayer.applyContract()`
- Structural enforcement at API level

### Invariant 5: All promotions are monotonic
- Promotions follow lattice ordering
- Proof required for all promotions

### Invariant 6: FEELING can never promote
- `FEELING` has no outgoing edges in lattice
- Hard exclusion enforced

## Integration Points

### Contract Layer
- Contracts enforce lattice constraints
- No bypass possible

### IR Compiler
- Automatic downgrading on compilation
- Invariant checking (non-blocking)

### BEMRE (Belief Evolution)
- Resolution status weights align with lattice
- `CONTRADICTED` and `ABANDONED` → weight 0.0

### Type Checker
- Uses lattice service for downgrading
- Enforces epistemic safety

## Testing

Invariants are tested in:
- `epistemicLattice.test.ts` - Lattice rules
- `epistemicInvariants.test.ts` - System invariants

## Future Extensions (Deferred)

These are explicitly documented but not implemented:

- Bayesian confidence refinement
- Kalman smoothing on belief confidence
- Survival analysis on belief lifetimes
- Proof ranking heuristics

## Mathematical Properties

### Monotonicity
Promotions are monotonic: if `A ⊑ B`, then promoting `A → B` preserves ordering.

### Transitivity
If `A ⊑ B` and `B ⊑ C`, then `A ⊑ C` (though we don't have `C` in our lattice).

### Anti-symmetry
If `A ⊑ B` and `B ⊑ A`, then `A = B` (no cycles in our lattice).

### Reflexivity
`A ⊑ A` (always true, but we don't allow self-promotion without reason).

---

*This system makes epistemic safety mathematically explicit and provably correct.*

