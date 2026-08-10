# Cognitive Update Engine

Status: Blueprint 15 shadow-mode compatibility layer implemented without a
database migration or automatic projection mutation.

## Purpose

The Cognitive Update Engine asks one bounded question after new evidence is
ingested:

> Did this evidence materially change LoreBook's current understanding?

It is not another retriever and it does not generate chat responses.

```text
evidence
  -> existing assertion and extraction pipeline
  -> cognitive change detection
  -> structured cognitive diff
  -> projection impact plan
  -> shadow diagnostics
```

## Cognitive Diff

The canonical contract records:

- the triggering evidence and prior state revision, when supplied;
- observed, candidate, and review-required changes;
- affected projections and their dependencies;
- incremental, stale, review, or no-action decisions;
- update priority and large-import deferral;
- confidence and review requirements;
- explicit invariants that raw evidence and canonical state were not mutated.

The initial detector is intentionally conservative. Direct user statements
about job transitions, relationship-state changes, goal lifecycle, project
milestones, temporal corrections, contradictions, and repeated patterns can
produce diffs. Ordinary conversation produces `Nothing changed`.

Assistant-generated prose never updates autobiographical projections.

## Projection Dependency Graph

Projection dependencies are declared in code rather than hidden inside refresh
jobs. The initial graph includes assertions, canonical timeline, relationships,
goals, quests, projects, Narrative IR, Identity Snapshot, and the Context Plan
cache.

The graph schedules only affected projections. Downstream projections are
marked stale instead of regenerated unconditionally. Large imports preserve
high-priority timeline work and defer lower-priority synthesis.

## Runtime Integration

Chat ingestion launches the evaluator with `setImmediate` after the durable
ingestion pipeline has produced its message, units, and resolved entities.
Evaluation therefore adds no response latency and cannot fail the ingestion
job.

The current adapter only emits structured logs:

- changed / no change;
- change types;
- affected projections;
- proposed actions and priorities;
- whether user review would be required.

It performs no database reads, writes, projection refreshes, or queue mutation.

## Promotion Path

1. Run synthetic and shadow evaluations.
2. Compare diffs with existing projection refresh behavior.
3. Add evidence-backed state adapters for goals, relationships, projects, and
   Narrative IR.
4. Route high-impact changes through Memory Review rather than silently
   changing canon.
5. Promote safe stale-marking and incremental refresh actions individually.
6. Add structured explanation nodes after update decisions are trustworthy.

## Context Planner Boundary

Context Plans remain request-scoped by default. Persisting every plan would
conflict with LoreBook's Working Memory invariant and create another stale
knowledge store. Durable context membership should be learned as reviewed graph
links; session reuse may use an expiring cache once evaluation demonstrates a
latency benefit.
