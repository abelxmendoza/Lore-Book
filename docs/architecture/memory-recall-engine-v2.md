# Memory Recall Engine — Narrative Recall v2

## Purpose

LoreBook recall should behave like autobiographical memory: answer the question,
rank what matters, distinguish the present from history, and explain why each
statement is present. It must not reformat a database export as prose.

Narrative Recall v2 is a read model over LoreBook's evidence-backed knowledge.
It does not create a second memory store.

## Product invariants

1. One recall truth. Chat and UI consume the same projection service.
2. Summary before enumeration. Default recall is concise; exhaustive output is
   available only when explicitly requested.
3. Provenance stays attached to every selected item, but storage metadata is
   shown only in diagnostics or an evidence inspector.
4. Current, emerging, background, and closed chapters are never blended.
5. Importance is based on narrative significance, not record or mention count.
6. Relationship categories remain distinct: family, friends, romantic,
   professional, community, public figures, and other people.
7. Review-sensitive or contradicted assertions never silently become fact.

## Pipeline

```text
Recall request
  -> intent classification
  -> candidate retrieval from canonical projections / Epistemic Graph
  -> evidence and tenant-scope validation
  -> narrative importance ranking
  -> semantic and temporal clustering
  -> chapter-state assignment
  -> response-budget selection
  -> deterministic projection
  -> optional LLM wording pass
  -> chat response + UI card + evidence manifest
```

The deterministic projection must be useful on its own. An unavailable LLM may
reduce fluency, but must not prevent recall.

## Recall intents

The first production intents are:

- `identity_summary`
- `current_life`
- `career`
- `relationships`
- `projects`
- `family`
- `health`
- `music_or_creative_work`
- `recent_changes`
- `timeline`
- `entity`
- `world_view`

Intent controls both candidate sources and the output budget. For example,
`identity_summary` may use career and project evidence but should not enumerate
every event. `timeline` may return more dated items because chronology is the
question.

## Canonical read model

The current identity slice uses `LivingBiographyCard` as the shared projection:

- Chat calls `getNarrativeIdentityRecall()`.
- The About Me UI calls `getLivingBiographyCard()`.
- Both are built from the same biography foundation and live focus overlay.
- Provenance counts and generation time travel separately from user-facing
  prose.

Future domain intents should implement the same pair:

```ts
type RecallProjection<TCard> = {
  content: string;
  card: TCard;
  provenance: EvidenceManifest;
};
```

## Narrative importance

Candidate assertions receive a normalized score:

```text
importance =
  0.24 * currentChapterRelevance +
  0.16 * identitySignificance +
  0.14 * goalRelevance +
  0.12 * userEmphasis +
  0.10 * milestoneContribution +
  0.08 * relationshipSignificance +
  0.06 * reflectionImportance +
  0.06 * recency +
  0.04 * repeatedIndependentSupport
```

Weights are intent-specific. Record count is not a direct feature. Repetition
helps only when it represents independent support rather than duplicate rows.

Hard gates run before scoring:

- correct user / tenant
- supported by admissible evidence
- not superseded or retracted
- compatible with the requested domain
- relationship has a real person endpoint
- sufficient certainty for the selected surface

## Clustering and compression

Candidates are grouped by canonical entity links, domain, temporal overlap, and
semantic similarity. Each cluster represents a narrative concept such as
"career rebuilding" or "shipping a product," not a table or record type.

Within a cluster:

1. Merge duplicate assertions by canonical identity.
2. Preserve supporting and contradicting evidence.
3. Select the highest-importance representative facts.
4. Produce one summary statement with a bounded evidence manifest.

The default identity response selects at most:

- one core identity statement
- one current chapter statement
- three current focuses
- four important people, grouped semantically
- three recent developments
- three long-term themes

## Chapter awareness

Every candidate is assigned one state:

- `current`: supported by multiple live focus signals or strong recent evidence
- `emerging`: recent evidence exists but is not yet sustained
- `background`: durable identity context that is not the present focus
- `closed`: explicitly ended or superseded

Two or more live focus signals may outrank an older biography period. A single
task is not enough to redefine a life chapter.

## Narrative generation

Generation is layered:

1. Deterministic section builder creates a complete, grounded answer.
2. An optional wording model may improve transitions without adding facts.
3. A post-generation evidence check rejects unsupported additions.
4. Response scope enforces the section and word budgets.

Default identity output is approximately 80–180 words. "Everything" or
"export" requests may opt into an exhaustive diagnostic or data-export view.

## Epistemic Graph integration

Narrative Recall reads the graph in this order:

```text
Evidence -> Assertions -> Inferences -> Knowledge projections -> Recall
```

Selection uses assertion status, observer, certainty, temporal validity,
supporting evidence, contradicting evidence, and revision history. The response
never exposes lifecycle fields directly. An evidence inspector can reveal them
when the user asks why LoreBook believes a statement.

## Cache strategy

- Cache canonical projections, not final prose.
- Key by user, intent, scope, projection version, and evidence watermark.
- Invalidate from assertion / projection changes rather than a fixed timer.
- Keep a short stale-while-revalidate window for UI responsiveness.
- Never allow a cache from one user or intent to satisfy another.
- Chat and UI share the same projection cache key.

## Explainability

Every response returns a hidden evidence manifest containing:

- projection version
- source counts by type
- selected assertion IDs
- rejected candidate counts and reasons
- generation timestamp
- staleness watermark

Normal UI shows a compact "Why this appears" summary. Full IDs, lifecycle
states, and rejected candidates remain available only in diagnostics.

## Delivery phases

1. Identity recall: shared Living Biography projection, concise formatter,
   chapter correction, semantic relationship grouping.
2. Domain recall: career, projects, relationships, family, health, and creative
   work projections using the same contract.
3. Ranking kernel: reusable importance scorer and narrative clusterer over
   Epistemic Graph assertions.
4. Unified evidence inspector and projection cache.
5. Evaluation suite: synthetic biographies covering stale chapters,
   contradictions, wrong-domain entities, sparse evidence, and large accounts.
