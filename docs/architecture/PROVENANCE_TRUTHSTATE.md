# Lorekeeper — Provenance & Truth-State System

The provenance and truth-state system is the epistemic governance layer over every durable artifact in Lorekeeper. It answers two questions: *what does the system believe about you*, and *how did it come to believe that*.

This document describes the truth-state model, the CorrectionAuthority service, the cognition_mutations audit log, and the design rationale behind each.

---

## The Problem This Solves

A naive RAG system retrieves past messages and treats them as ground truth. It cannot distinguish:
- "My sister is angry at me" (a momentary belief) from "My sister is angry at me" (a stable fact)
- A hypothetical ("imagine if I quit my job") from a decision ("I quit my job")
- A memory that was accurate when recorded but has since been superseded

Lorekeeper's provenance system gives every durable memory an explicit epistemic status, a history of how that status changed, and a governance layer that controls how it can change again.

---

## Truth States

**File:** `apps/server/src/services/provenance/types.ts`

```typescript
type TruthState =
  | 'CANONICAL'             // Verified by the user or high-confidence source. Authoritative.
  | 'CONTEXTUAL'            // True in a specific context (roleplay, hypothetical, quoted speech).
  | 'REVISED'               // Superseded by newer information. Preserved but not active.
  | 'DISPUTED'              // Contradicted by another unit. Under contention.
  | 'INFERRED'              // Derived logically but never directly stated.
  | 'PENDING_VERIFICATION'; // Surfaced for human review. Not yet accepted.
```

### Semantics

**CANONICAL** is the highest epistemic status. It means: "the system and the user agree this is accurate." Only explicitly escalated entries or high-confidence auto-promoted entries reach this state.

**CONTEXTUAL** preserves entries that are true within a bounded frame — roleplay scenarios, hypotheticals, quoted speech. They are not suppressed; they are framed. Retrieval systems can filter on this.

**REVISED** is not deletion. It is a tombstone that points forward. The original entry is preserved with this state, and a newer entry supersedes it. This maintains the full reinterpretation history.

**DISPUTED** marks active contradiction. Two entries exist that cannot both be true. Neither is deleted. The dispute is preserved as data — to be resolved by the user or by accumulating evidence.

**INFERRED** captures knowledge the system derived that the user never stated directly. This is epistemically weaker than EXPERIENCE-derived entries. Retrieval systems should weight it accordingly.

**PENDING_VERIFICATION** is the default state at consolidation unless confidence is high enough to promote to CANONICAL. It signals: "we have this, but we haven't confirmed it."

---

## The Valid Transition Graph

Not all truth-state transitions are valid. The CorrectionAuthority enforces a typed transition graph:

```
PENDING_VERIFICATION ──→ CANONICAL        (no rationale required: CANON_ESCALATION)
PENDING_VERIFICATION ──→ DISPUTED         (rationale required: DISPUTE)
CANONICAL            ──→ REVISED          (rationale required: CORRECTION)
INFERRED             ──→ CANONICAL        (no rationale required: CANON_ESCALATION)
INFERRED             ──→ DISPUTED         (rationale required: DISPUTE)
CONTEXTUAL           ──→ CANONICAL        (no rationale required: CANON_ESCALATION)
DISPUTED             ──→ REVISED          (rationale required: CORRECTION)
```

### Design rationale

Escalations (→ CANONICAL) are frictionless because the user is affirming something — low risk.

Corrections (→ REVISED, → DISPUTED) require rationale because they are epistemic *challenges* — someone is asserting that the system's understanding was wrong. The rationale becomes part of the audit record.

The graph deliberately omits:
- `CANONICAL → CANONICAL` (idempotent, meaningless)
- `REVISED → anything` (revised entries are terminal — create a new entry instead)
- `CANONICAL → PENDING_VERIFICATION` (demoting canonical without cause is not supported — dispute it instead)

> **Observation:** The current transition graph is conservative. As the system matures, `REVISED → CANONICAL` (re-instating a previously revised entry) may become necessary. The graph should be treated as a versioned contract, not a permanent design.

---

## CorrectionAuthority

**File:** `apps/server/src/services/provenance/CorrectionAuthority.ts`

The CorrectionAuthority is the single service responsible for applying truth-state revisions. Nothing else in the system may modify `truth_state` fields on artifact metadata directly — all changes flow through this service.

### applyRevision()

```typescript
async applyRevision(claim: CorrectionClaim, userId: string): Promise<CorrectionResult>
```

Steps in order:

1. **Ownership check** — `claim.actorId` must match `userId`. Actor and authenticated user must be the same.
2. **Transition validation** — The `fromState → toState` pair must exist in `VALID_TRANSITIONS`. Unknown or invalid transitions are rejected with a descriptive error.
3. **Rationale check** — If the transition requires rationale, `claim.rationale` must be non-empty.
4. **DB load** — The artifact is loaded from its table, filtered by both `id` AND `user_id`. Not found = not owned.
5. **State mismatch guard** — The artifact's current `truth_state` must match `claim.fromState`. This prevents race conditions where two clients attempt simultaneous revisions.
6. **Metadata update** — The artifact's `metadata.truth_state` and `metadata.revised_at` are updated atomically.
7. **Audit write** — The full before/after state is written to `cognition_mutations`. If this write fails, it is logged but does not fail the revision (audit write failure is non-fatal but must be visible in logs).

### Supported artifact types

```typescript
const ARTIFACT_TABLE: Partial<Record<ArtifactType, string>> = {
  journal_entry:  'journal_entries',
  entry_ir:       'entry_ir',
  knowledge_unit: 'knowledge_units',
  utterance:      'utterances',
  entity:         'entities',
  insight:        'insights',
};
```

> **Risk:** The audit write is non-fatal. If `cognition_mutations` is unavailable (DB overload, network partition), revisions still apply but the audit record is missing. For a governance system, this is a meaningful gap. Consider making the audit write transactional with the state update, or adding a reconciliation job that detects orphaned revisions.

---

## cognition_mutations

**Migration:** `supabase/migrations/20260210000156_cognition_mutations.sql`

The append-only audit table for every epistemic mutation to every artifact.

### Schema

```sql
CREATE TABLE cognition_mutations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id       uuid        NOT NULL,          -- Same as user_id today; reserved for delegation
  artifact_type  text        NOT NULL,
  artifact_id    uuid        NOT NULL,
  mutation_type  text        NOT NULL,
  before_state   jsonb,
  after_state    jsonb       NOT NULL,
  rationale      text,
  provenance_edge_id uuid,                      -- Optional structural link
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

### Append-only enforcement

```sql
-- No INSERT policy: server uses service role which bypasses RLS.
-- No UPDATE or DELETE policies: append-only by design.
```

There is deliberately no client INSERT policy. Mutation records can only be created by the server via `supabaseAdmin` (service role). This means no client can falsify or delete history.

### Indexes

```sql
-- Primary lookup: all mutations for an artifact
cognition_mutations_artifact_idx  ON (user_id, artifact_type, artifact_id, created_at DESC)

-- Timeline view: all mutations for a user
cognition_mutations_timeline_idx  ON (user_id, created_at DESC)

-- Type filtering
cognition_mutations_type_idx      ON (user_id, mutation_type, created_at DESC)
```

### Mutation types

Populated by either `CorrectionAuthority.applyRevision()` (user-initiated) or `CorrectionAuthority.recordSystemMutation()` (pipeline-initiated):

| Type | Source | Description |
|---|---|---|
| `CANON_ESCALATION` | User/System | Entry escalated to CANONICAL |
| `DISPUTE` | User | Entry marked as contradicted |
| `CORRECTION` | User | Entry superseded by newer information |
| `CONSOLIDATION` | System | IR promoted to journal_entry |
| `CONTENT_REVISION` | System | Entry content updated |
| `ENTITY_MERGE` | System | Entities merged via resolution |
| `PROVENANCE_EDGE_ADDED` | System | Structural provenance link created |

---

## Provenance Edges

**Types in:** `apps/server/src/services/provenance/types.ts`

A `ProvenanceEdge` is a directed typed link between two artifacts that records *how* one came from another:

```typescript
interface ProvenanceEdge {
  id: string;
  source_id: string;
  source_type: ArtifactType;
  target_id: string;
  target_type: ArtifactType;
  relation: ProvenanceRelation;
  confidence: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

type ProvenanceRelation =
  | 'EXTRACTED_FROM'   // target was extracted from source
  | 'COMPILED_INTO'    // source was compiled into target
  | 'REVISED_BY'       // source was superseded by target
  | 'CONTRADICTS'      // source and target conflict
  | 'INFERRED_FROM'    // target was logically derived from source
  | 'CITED_IN';        // source is cited as evidence in target
```

### Current status

The `ProvenanceEdge` type and `makeProvenanceEdge()` factory are defined and exported. The `cognition_mutations` table has a `provenance_edge_id` column for structural links. However, the persistence layer for provenance edges (a `provenance_edges` table and its write paths) is not yet fully implemented. The type contract is in place; the storage is the next step.

> **This is the most significant gap in the provenance system.** Without persisted edges, the system can audit *what changed* but not *why* — the causal chain from raw input to durable memory is not traversable. Implementing `provenance_edges` persistence should be the first priority of the next infrastructure phase. See [ASSESSMENT.md](ASSESSMENT.md).

---

## Identity Route API

**File:** `apps/server/src/routes/identity.ts` (mounted at `/api/identity`)

| Endpoint | Description |
|---|---|
| `POST /revise/:artifactId` | Apply truth-state revision via CorrectionAuthority |
| `GET /permitted-transitions?currentState=` | What transitions are valid from a given state |
| `GET /audit-log` | Paginated cognition_mutations for this user |
| `GET /provenance/:artifactId` | Mutation history for a specific artifact |
| `GET /what-ai-knows` | All journal_entries, insights, entities, entry_ir |
| `GET /export` | Streaming NDJSON full data export |

All routes require `requireAuth`. The export endpoint streams NDJSON line-by-line — journal_entries first, then mutations, then entities.

---

## WhatAIKnows Page

**File:** `apps/web/src/routes/WhatAIKnows.tsx` (route: `/what-ai-knows`)

The user-facing transparency surface. Shows every artifact the system holds about the user with its current `truth_state`. Four tabs:

- **Memories** — `journal_entries` with truth state badges and expandable content
- **Insights** — `insights` with truth state and inline revision
- **Entities** — `entities` the system has recognized, with type and state
- **Audit** — Paginated `cognition_mutations` showing the history of every state change

Inline `ReviseModal` allows the user to change truth states directly from this page. Available transitions are fetched from `/api/identity/permitted-transitions` for the current state.

---

## Architectural Observations

1. **The audit log is the system's conscience.** `cognition_mutations` is the single source of truth for what the system *did* to a user's memory. It should be treated as sacred infrastructure — never dropped, never modified, monitored for write failures.

2. **The provenance edge store is missing.** The type contract exists but the persistence layer does not. Until edges are persisted, the system has point-in-time snapshots but no causal graph. This is a meaningful gap in the "governed autobiography" promise.

3. **The WhatAIKnows page is a foundation, not a product.** The current implementation shows raw truth states and mutation types that are meaningful to an architect but opaque to a user. The next UX iteration should translate epistemic status into human language: "We remember this as certain," "This memory is contested," "We learned this from something you said, but you haven't confirmed it."

4. **Delegation is reserved but unimplemented.** `actor_id` exists separately from `user_id` in `cognition_mutations` for future multi-actor governance (e.g., a therapist co-managing a user's memory). This is forward-compatible design. Do not collapse `actor_id` into `user_id` in any migration.

5. **The `provenance_edge_id` column on `cognition_mutations` is currently always null.** This will become load-bearing once the provenance edge store is implemented. Do not remove it.
