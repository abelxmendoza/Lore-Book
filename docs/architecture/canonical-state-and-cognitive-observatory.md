# Canonical State and Cognitive Observatory

## Why this exists

Chat comprehension and LoreBook's current worldview must not diverge. A user
correction such as “this project is no longer active” is compared against known
state and applied as a transition; it is not preserved only as a message
summary.

## Canonical State vertical slice

The first production write path covers two high-value projections without a
new database migration:

- **Project state:** an explicitly identified existing project can move to
  `dormant`, record its stated last-active phrase, leave Current Focus, and
  lower its priority.
- **Current Focus:** explicitly replaced priorities set `current_focus` on
  existing project rows. Unknown labels remain unresolved and never create a
  project or person implicitly.

All reads and writes are scoped by `user_id`. Replaying an already-current
state is a no-op. The existing Cognitive Update Engine and Orchestrator receive
the same transition types so downstream projection work is visible, while
their broader projection plans remain shadow-only.

Concrete detention/arrest language is also classified as a life event and an
experience so it reaches the existing event-assembly path. This slice does not
create a separate event store.

## Extraction and entity safeguards

- Semantic extraction retains at most three complementary units per utterance
  and requires explicit cues for feelings, thoughts, perceptions, and
  decisions.
- Tenant-owned Character, Organization, and Place book matches are consulted
  before speculative candidates are resolved.
- A short extracted spelling is replaced by the matched canonical identity.
- Pronouns are rejected before they can become people, bands, or organizations.

## Cognitive Observatory

The observatory records a bounded, in-memory execution trace for each message:

- stage status (`PASS`, `WARN`, `FAIL`, or `SKIPPED`)
- duration and confidence
- input/output, created/reused/updated/discarded counts
- decisions and downstream effects
- explicit projection coverage (`MEASURED` or `NOT_WIRED`)

It never stores raw message text, expires after 30 minutes, and is retrieved
only for the authenticated owner at:

`GET /api/conversation/trace/cognitive/:chatMessageId`

The endpoint is an engineering/debug surface, not a durable audit ledger. A
future UI can render it alongside the existing message lineage trace.

## Memory Quality

The Memory Quality step now reports selection quality in addition to created
row count: candidates considered, duplicates removed, low-confidence filters,
cap filters, and noise ratio. Throughput is no longer presented as quality.

## Current boundary

Project and Current Focus are measured write paths. Assertion and canonical
timeline stages are measured by their existing paths. Narrative IR, Identity
Snapshot, Context Plan, and Recall Composer adapters are reported as
`NOT_WIRED` until each live adapter is connected and evaluated; missing
coverage cannot masquerade as a perfect cognition score.

## Canonical Mutation Layer convergence

Canonical writes now share a versioned mutation contract containing target,
previous and proposed values, authority, evidence, risk, affected projections,
plus explicit **intent** (`UPDATE`, `RETIRE`, `RESTORE`, `SUPERSEDE`, and so on)
and **category** (`PROJECT`, `RELATIONSHIP`, `IDENTITY`, `TIMELINE`, and so on).
**Mutation reason** is separate from intent: an `UPDATE` may be caused by an
explicit user correction, temporal reconciliation, review approval, or policy
enforcement.

The policy layer currently governs Project Status and Current Focus before the
existing compatibility writes execute. It enforces these rules:

- confidence never grants write authority;
- provenance evidence is mandatory;
- projections may mutate only fields they own;
- explicit low-risk Project and Current Focus changes may proceed;
- relationship and employment changes require review or confirmation;
- system-derived Identity interpretations cannot directly become canon;
- Evidence is immutable outside confirm/reject workflows;
- semantically identical before/after values produce `NO_CHANGE` and no write.

The layer exposes an `apply` contract that accepts only an explicitly atomic
adapter. No such production adapter is enabled yet because Supabase client
calls cannot atomically update a project and append `cognition_mutations`
without a database function, and the migration ledger remains unsafe. The
existing compatibility writes are therefore counted and shown as `WARN` in the
Observatory rather than mislabeled as fully governed transactional writes.

Governance outcome and execution outcome are also distinct. Governance may
allow or queue a proposal; execution separately reports not executed, applied,
or failed transaction. Projection invalidation events are produced only after
an atomic apply succeeds, never merely because governance approved a proposal.
