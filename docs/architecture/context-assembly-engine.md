# Context Assembly Engine

Status: Blueprint 14 compatibility layer implemented without a database migration.

## Purpose

Context Assembly answers one question before retrieval ranking begins:

> Which part of the user's life should LoreBook be thinking about for this turn?

It produces a virtual, request-scoped plan. The plan is discarded after the
turn and never becomes a second source of truth.

```text
question
  -> intent
  -> context plan (primary, secondary, excluded)
  -> candidate context membership
  -> drift pruning
  -> evidence ranking and budget
  -> response
```

The canonical implementation is
`apps/server/src/services/contextAssembly/contextAssemblyEngine.ts`.

## Contract

Every context plan contains:

- one primary context;
- zero or more secondary contexts that may support it;
- explicitly excluded contexts;
- ranked context choices and deterministic reasons;
- a strict-boundary flag for focused questions;
- an algorithm version.

Candidates may belong to more than one context. Cross-context evidence is only
admitted when the candidate itself contains the link. For example, a project
can support career recall when its evidence describes a startup, professional
work, or employment. The mere existence of a personal project is not enough.

## Integration

The existing Working Memory Assembler remains the retrieval owner. Context
Assembly now gates its candidates before relevance scoring and budget selection.
This prevents unrelated evidence from consuming prompt budget.

The existing Response Scope planner uses the same context-plan contract for
answer boundaries. It remains the final presentation gate, while Working Memory
performs the earlier retrieval gate.

Normal prompt packets include only a compact context summary. Rejected items,
membership labels, drift scores, and exclusion reasons remain diagnostic data.
They do not render as user-facing biography.

Diagnostics also expose bounded estimates derived from the selected candidate
set: candidate coverage, average evidence confidence, packet completeness, and
the newest selected evidence timestamp. They describe the current assembly,
not the completeness of the user's entire life history.

## Invariants

1. Contexts are virtual assemblies, not database tables.
2. A temporal wrapper does not erase an explicit life domain: `career timeline`
   is career-first, not an unrestricted timeline.
3. Excluded-domain evidence never consumes the normal retrieval budget.
4. Cross-context links must be supported by the candidate being considered.
5. Context pruning never deletes evidence or changes canon.
6. Debug and audit surfaces may inspect rejections; ordinary chat may not.

## Next steps

- Pass one classified plan through every explicit-recall path instead of
  allowing older routers to classify independently.
- Add evaluation fixtures for career, family, relationship, project, identity,
  and temporal questions using synthetic lore.
- Add coverage, freshness, and completeness metrics once their inputs are
  evidence-backed rather than inferred from candidate counts.
- Build Blueprint 15 structured explanation nodes over the context plan; never
  expose private model chain-of-thought.
