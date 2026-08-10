# Cognitive Orchestrator

Status: Blueprint 16 foundation, shadow mode

## Purpose

LoreBook now has specialized systems for evidence, assertions, canonical time,
narrative, identity, context assembly, and cognitive change detection. The
Cognitive Orchestrator is the coordination boundary above those systems. It
answers one systems question: **what should happen next after knowledge
changes?**

It does not replace those systems and it does not perform their reasoning.

## Runtime shape

```text
User message
  -> ingestion persists evidence and assertions
  -> Cognitive Update Engine emits a structured diff
  -> canonical cognitive events
  -> Cognitive Orchestrator execution plan
  -> shadow trace (current phase)
  -> registered projection handlers (future parity phase)
```

The existing procedural runtime remains authoritative during shadow mode. The
orchestrator plans the equivalent work in parallel so plans can be compared
before any direct coupling is removed.

## Canonical contracts

### Cognitive event

Every event has:

- a stable ID and idempotency key;
- user and source boundaries;
- evidence references;
- event and change types;
- batch size and review requirements;
- timestamps and structured payload.

Events include `EVIDENCE_ADDED`, `ASSERTIONS_CREATED`, career and project
milestones, relationship and goal changes, chapter transitions, temporal
conflicts, contradictions, and identity-thread changes.

### Execution plan

One logical source update produces one deterministic plan containing:

- coalesced cognitive events;
- dependency-ordered projection steps;
- priority and update budget decisions;
- review routes;
- a human-readable cognitive trace;
- explicit no-mutation invariants.

Repeating the same event yields the same stable plan. The live shadow singleton
also marks an in-process replay as a duplicate and skips its steps.

## Dependency registry

Dependencies are declared rather than encoded as service-to-service calls:

```text
assertions
  -> canonical timeline
  -> relationship / goal / project projections
  -> Narrative IR
  -> Identity Snapshot
  -> Context Plan cache
```

The registry is checked for cycles and topologically orders only the affected
projections.

## Safety and review

- Shadow mode never invokes projection handlers.
- Canonical state is never changed by planning.
- Relationship changes, identity contradictions, chapter transitions, health
  conclusions, and governed projection changes route to review.
- Background identity and context work is deferred by default.
- Immediate work is bounded by a per-plan step budget.
- Handler execution is fail-open and fault-isolated: a failed handler is
  recorded without throwing away independent work.

## Observability

The shadow adapter emits one structured log per plan with:

- plan and diff IDs;
- event types;
- projection, action, priority, and status for every step;
- review reasons;
- budget totals;
- duplicate status.

This becomes the comparison surface for procedural-versus-orchestrated parity.
It intentionally contains IDs and classifications, not private message text.

## Promotion sequence

1. Collect shadow traces and add parity fixtures for high-value scenarios.
2. Register read-only or invalidation-only handlers first.
3. Compare ordering, deduplication, review routing, and outputs against the
   procedural path.
4. Add durable event/plan storage only after the migration ledger is safe.
5. Move one projection at a time behind the orchestrator.
6. Remove a direct subsystem call only after parity and failure recovery pass.

The first promoted actions should be cache invalidation and stale marking, not
canonical knowledge writes.
