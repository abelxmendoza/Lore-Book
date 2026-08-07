# LoreBook Knowledge Kernel

Status: Phase 1 foundation

The Knowledge Kernel is the shared epistemic substrate beneath LoreBook's
books. It does not own reality or declare truth. It stores LoreBook's versioned
account of evidence, assertions, derivations, uncertainty, and change.

## Invariants

1. Durable conclusions retain provenance.
2. Evidence that a statement was made does not establish that its contents
   occurred.
3. The author of a claim and the subject of a claim are separate fields.
4. Direct observation, reported speech, user belief, system hypothesis, and
   established knowledge remain distinguishable.
5. High-impact and restricted assertions require human confirmation before
   becoming active.
6. Assertion meaning is append-oriented. Corrections create replacement
   assertions and revision links.
7. Supporting, challenging, contextual, duplicate, and rejected evidence remain
   visible.
8. Derivations retain their algorithm, version, inputs, outputs, parameters,
   model metadata, and invalidation state.
9. Removing evidence invalidates dependent derivations. Immutability never
   overrides privacy deletion or redaction.
10. Books may materialize projections for performance, but those projections are
    reproducible outputs rather than independent truth stores.

## Kernel model

```text
Entities and Events
        │
        ▼
Assertions ◄──── Evidence Links ────► Existing Evidence Artifacts
        │
        ├──── Revision Links
        │
        ▼
Auditable Derivation Runs
        │
        ▼
Materialized Knowledge Projections
        │
        ├── Perceptions
        ├── Claims about self
        ├── Relationships
        ├── Life Log and Timeline
        ├── Projects and Skills
        ├── Quests
        └── Narrative
```

Entities remain stable referents. Relationships remain first-class objects
because they have participants, direction, roles, lifecycle, and their own
history. Context is represented through typed links to events, organizations,
communities, places, temporal intervals, and narrative chapters rather than an
untyped context bucket.

## Assertion dimensions

Assertions do not use one overloaded type. They carry independent dimensions:

- Class: observation, experience, statement, belief, hypothesis, decision,
  reflection.
- Domain: identity, relationship, emotion, goal, project, skill, preference,
  location, community, career, health, event, world.
- Stance: direct observation, reported statement, user belief, system
  hypothesis, established knowledge.
- Derivation: directly stated, quoted, extracted, calculated, inferred, user
  confirmed.
- Lifecycle: proposed, active, challenged, superseded, retracted, rejected.
- Polarity: affirmed, uncertain, negated.

This permits an assertion to represent, for example, a directly stated career
decision without confusing its domain with its epistemic status.

## Evidence semantics

Evidence links express how an artifact relates to an assertion:

- `supports`
- `challenges`
- `contextualizes`
- `duplicates`
- `irrelevant`

The link is itself an accountable judgment. It records who linked it, why, the
source locator, and extraction certainty.

### Sensitive reported claims

Imported posts, screenshots, and documents first produce a source-statement
assertion. The artifact directly supports that the attributed statement exists.
An underlying occurrence claim is a separate proposed assertion attributed to
the speaker. It does not inherit factual certainty from the screenshot.

High-impact assertions are review-only by default. Counts of posts must not be
treated as independent corroboration until source lineage and duplication have
been evaluated. The system must not infer a community-wide belief from a small
number of accounts.

## Compatibility map

| Existing system | Kernel role | Phase 1 behavior |
| --- | --- | --- |
| `graph_nodes` | Entity/event referents | Retained |
| `graph_edges` | Structural relationships | Retained |
| `provenance_edges` | Artifact production lineage | Retained |
| `assertion_evidence` | Shared evidence-link store | Extended |
| `perception_entries` | User-belief projection | Retained; read adapter active |
| `crystallized_knowledge` | Materialized self-knowledge | Retained; read adapter active |
| `knowledge_evidence_links` | Legacy claim evidence | Retained during migration |
| `narrative_claims` | Narrative-specific assertions | Retained during migration |
| `cognition_mutations` | Governance audit history | Retained |
| Memory Review Queue | Human review choke point | Retained and required |

## Migration strategy

This is not a database-wide rewrite.

1. Establish assertion, evidence-link, revision, and derivation contracts.
2. Mirror existing Perceptions and Crystallized Knowledge through read adapters.
3. Dual-write new records behind a feature flag after the migration is live.
4. Compare legacy and kernel projections with synthetic users.
5. Add a shared "Why does LoreBook believe this?" inspector.
6. Move retrieval consumers one at a time.
7. Remove legacy write paths only after parity and rollback verification.

## Phase 1 implementation

- `knowledge_assertions` stores first-class assertions.
- `assertion_revision_links` preserves correction and supersession chains.
- `knowledge_derivation_runs` and `knowledge_derivation_io` make derived
  knowledge reproducible and invalidatable.
- The existing `assertion_evidence` table now supports first-class assertions,
  Perceptions, and Crystallized Knowledge with typed evidence relations.
- Server policy code prevents inferred observations and unreviewed high-impact
  assertions from being activated.
- `buildReportedClaimPair()` enforces the statement-versus-occurrence boundary.
- Read adapters project existing `perception_entries` and
  `crystallized_knowledge` records into the shared assertion contract without
  changing either legacy write path.

Phase 1 deliberately does not switch existing books or chat retrieval to the
kernel. That happens only after schema deployment, adapters, parity tests, and a
feature-flagged rollout.

## Phase 1 UI bridge

Authenticated read endpoints are available under `/api/knowledge-kernel` when
`ENABLE_KNOWLEDGE_KERNEL_READS=true`. They return summaries, filtered
assertions, subject projections, evidence links, revision history, and
derivation metadata. The flag remains off until the migration is applied.

The web app now has shared, user-facing epistemic components for authorship,
lifecycle state, evidence balance, and a Knowledge Inspector. Existing
Perception and Crystallized Knowledge cards use the same language while their
legacy APIs remain active. This makes the migration visible without making the
new kernel a runtime dependency prematurely.

Existing `crystallized_knowledge` Claims and `perception_entries` are also
projected into the shared inspector contract. This read-only compatibility
bridge preserves authorship and converts negative legacy evidence weights into
challenging evidence. It does not imply that legacy records have already been
copied into `knowledge_assertions`.

Character Book facts and character-specific inferred patterns now use that
same inspector. Legacy mention counts remain metadata unless the response also
contains source passages; LoreBook does not turn a count into fabricated
evidence links. This keeps the existing What I Know tab usable while the kernel
schema and dual-write path remain feature-flagged.
