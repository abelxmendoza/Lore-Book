# Historical Interpretation Layer

Historical events and interpretations have different lifecycles. LoreBook must
not edit what happened merely because the user's understanding changes later.

## Model

```text
Immutable event facts
  -> versioned interpretation proposals
  -> user-confirmed current understanding
  -> projection invalidation event
  -> Narrative / Identity / Context / Publishing refresh
```

An interpretation records its event, text, author, kind, confidence, creation
time, replaced interpretation, reason for change, and supporting or
contradicting evidence. Kinds currently include meaning, lesson, emotion, and
identity reframe.

## Existing-storage adapter

The first slice reuses `narrative_accounts` with
`account_type = later_interpretation`. Versioned Historical Interpretation data
lives in namespaced metadata. No migration is introduced while the migration
ledger remains unsafe.

Event-scoped chat no longer treats every message as reflection. Only explicit
hindsight, changed-understanding, lesson, and then-versus-now language creates
an interpretation proposal. The event row is never modified by interpretation
creation.

The authenticated read projection is:

`GET /api/conversation/events/:resolvedEventId/interpretations`

It returns the immutable-fact marker, ordered interpretation timeline, current
confirmed understanding, and alternatives.

## Governance

LoreBook-authored interpretations remain proposals. Only a user-confirmed
interpretation receives automatic governance authorization. Execution still
requires an atomic Canonical Mutation adapter; no confirmation endpoint is
exposed until mutation, audit append, supersedence, and projection invalidation
can commit as one transaction.

Governance approval and execution outcome are separate:

- Governance: allow, review, confirmation, manual, reject, or no change.
- Execution: not executed, applied, or failed transaction.

Projection invalidation is emitted only after a successful atomic execution;
governance never refreshes peer projections directly.
