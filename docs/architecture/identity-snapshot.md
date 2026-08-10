# Identity Snapshot projection

Identity Snapshot is LoreBook's versioned, evidence-backed answer to “Who am I
right now?” It is a projection, not a new source of truth and not a second
identity engine.

```text
Evidence -> Assertions -> Epistemic Graph -> Narrative IR
                                             |
                                      Identity Snapshot
                                      /       |       \
                                  Chat     About Me   Guidance
```

## Contract

The server compiles one presentation-independent snapshot containing:

- a stable snapshot ID, algorithm version, Narrative IR version, and graph
  revision;
- core identity and the current chapter;
- ranked identity threads with strength, stability, momentum, trajectory,
  evidence, contradictions, and last reinforcement;
- per-domain coverage rather than the misleading binary “profile exists”;
- references to current goals, recent changes, important people, and tensions;
- provenance counts and rejected-input diagnostics.

Chat uses a concise recall composer. About Me uses a visual renderer. Neither
surface owns or independently re-derives identity.

## Trust boundaries

- Canonical projects come from the Projects Book. Organization fallback rows do
  not become identity evidence.
- Inactive or low-certainty skills do not become identity evidence.
- Important people pass the wrong-domain guard again at the projection boundary.
- Goals remain owned by Narrative IR; Identity Snapshot only references them.
- Raw storage metadata stays out of the user-facing chat answer.
- The projection is read-only. A future materialization table may cache versions,
  but it must not become the canonical source and must not be introduced until
  the migration ledger is safe.

## Refresh and staleness

The initial implementation uses a short read-through cache. Snapshot identity is
deterministic for the same algorithm version, Narrative IR version, and evidence
revision. A stale biography marks the snapshot stale without hiding the available
coverage.

## Evaluation cases

Focused synthetic tests require identity recall to:

1. preserve technical, creative, and mission-driven threads when supported;
2. include the current chapter and open goals without dumping every record;
3. reject organization fallback projects, weak skills, and non-person candidates;
4. distinguish sparse domains from missing identity;
5. produce a concise chat answer with no database or algorithm diagnostics.
