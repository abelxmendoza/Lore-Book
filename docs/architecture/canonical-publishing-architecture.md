# Canonical Publishing Architecture

Status: Blueprint 20 (+ 20.1 Publication Identity) — Milestone 1 implemented
(Edition, Manifest, Difference Viewer). Phase Two and Phase Three below are
not yet implemented.

Milestone 1 landed as a read-compatible layer over the existing
`biographies` table, per the Next Steps below — no migration:

- `bookVersionManager.getVersionHistory()`
  (`apps/server/src/services/biographyGeneration/bookVersionManager.ts`) now
  returns `lorebookVersion` and a computed `published`/`superseded` status
  per edition, keyed by `lorebook_name` — the Publication handle.
- `bookVersionManager.getManifest()` + `GET /api/biography/:id/manifest`
  implement the Manifest Contract from existing columns and
  `biography_data.metadata`. `generatorVersion` / `promptVersion` /
  `modelVersion` / `filterVersion` are honestly reported as `null` — the
  generation engine does not yet stamp them.
- `bookVersionManager.compareVersions()` + `POST /api/biography/versions/compare`
  implement the Difference Contract, matching chapters by stable id (not
  incidental `timeSpan` equality) and reporting `added` / `removed` /
  `changed` / `reordered`, plus book-level `metadataChanges`.
- `VersionManager.tsx`, mounted in `LorebookLibraryPage.tsx`'s expandable
  older-versions panel, is the Difference Viewer. Its build-variant
  generation UI (safe/explicit/private) is gated off by default — that axis
  is Phase Two, not Milestone 1.

## Milestone 1 acceptance tests

Eight acceptance tests were run against the implementation before calling it
canonical. Six passed by construction (identical editions, the chapter
mutation torture test, edition lineage status, manifest truth, UI/API
parity, and round-trip identity all follow directly from the id-based diff,
the frozen `biography_data` read path, and returning `null` rather than a
guess for unrecorded provenance).

The historical-immutability test did not pass on the first attempt. Tracing
the read path confirmed `GET /api/biography/:id` and the reader UI render
`biography_data` exactly as stored, with no live re-resolution — but tracing
the *write* path found that `updateBiographySection()` (used by the section
editor and its chat-assisted variant) updated `biography_data` **in place,
by id, with no check for whether that row was a published Core Lorebook
edition**. A published edition opened for editing — reachable in practice
from the Difference Viewer's own "Read" action, since the reader carries the
opened edition's id into its edit affordance — would have been silently
mutated, falsifying "a publication must never silently change after
release" for exactly the artifact this blueprint exists to protect.

Fixed by adding `EditionImmutableError` at the single choke point
(`getBiographyRow()` in `apps/server/src/services/biographySectionService.ts`):
any `biographyId`-scoped edit against a row with `is_core_lorebook = true`
now throws before any write, surfaced as `409 EDITION_IMMUTABLE` by both
`PATCH /api/biography/section` and `POST /api/biography/section/chat`. The
always-current main lifestory (no `biographyId`, or `is_core_lorebook =
false`) is unaffected and remains editable — only published editions are
frozen. Covered by `biographySectionService.test.ts`.

The chapter mutation torture test also caught a real bug on its own: the
initial reorder detection compared raw array indices, which breaks the
moment a chapter is also added or removed in the same edition (every
downstream index shifts). Fixed with an LIS-based relative-order comparison
— the same technique a line-level diff uses to distinguish a genuine move
from incidental index drift — so `added`/`removed`/`changed`/`reordered`
now resolve correctly even when all four happen at once. Covered by
`bookVersionManager.test.ts`.

## Purpose

Every prior blueprint answers how LoreBook thinks: how it discovers,
resolves, and reasons over a life. This blueprint answers a different
question — how LoreBook communicates what it knows.

Publishing exists to answer, permanently and reproducibly:

> Why does this edition say this?
>
> What changed since the last one?

Cognition discovers. Publishing communicates. The Publishing Layer owns
every generated artifact — Core Lorebooks, the Living Biography, Character
Books, Relationship Reports, Career Reports, Timeline Exports, Family Books,
World Models, Memory Summaries — as a distinct architectural tier beneath
which cognition is never directly visible.

```text
Cognitive Layer     (discovers: assertions, derivations, reasoning)
        │
        ▼
Knowledge Layer      (the Knowledge Kernel — see KNOWLEDGE_KERNEL.md)
        │
        ▼
Publishing Layer      (this document)
```

## Philosophy

Knowledge is alive. Books are editions.

The Knowledge Kernel is continuously updated through evidence, assertions,
state changes, and governed mutations (`KNOWLEDGE_KERNEL.md`, invariant 6:
"Assertion meaning is append-oriented"). A published artifact is a snapshot
of that knowledge at a specific point in time. A publication must never
silently change after release — exactly the same discipline the Kernel
already applies to assertions, extended one layer up to the documents built
from them.

## Boundary with cognition

The Edition Builder never talks directly to cognition. It consumes
projections — the same materialized, reproducible outputs the Kernel already
promises in invariant 10: "Books may materialize projections for
performance, but those projections are reproducible outputs rather than
independent truth stores." Publishing does not add a new truth store; it
adds a new *packaging* stage over the one that already exists.

```text
Knowledge Kernel
        │
        ▼
Projection Layer        (existing materialized projections)
        │
        ▼
Publication Contract    (what kind of artifact, which projections)
        │
        ▼
Edition Builder         (assembles, never reasons)
        │
        ▼
Manifest                (why it looks this way)
        │
        ▼
Published Edition       (immutable)
```

If the Edition Builder needs something cognition hasn't projected yet, that
is a Knowledge Layer gap to fix at the projection boundary — not a reason
for the builder to reach past it.

## The four publishing contracts

Blueprint 20 defines these contracts. It does not require all four to be
fully implemented before any ships — see Sequencing below — but every
publishing feature built afterward must be expressible in terms of them.

### 1. Edition Contract

One immutable publication.

- publication handle (parent reference — see Publication Identity)
- version
- publication time
- knowledge snapshot reference
- generator version
- previous edition / next edition (lineage links)
- status (see Edition Stability)

No edition is ever overwritten. A recompile produces a new edition; it does
not mutate the one before it.

### 2. Manifest Contract

Explains how an edition was produced. Answers "why does this edition contain
this information?"

- knowledge snapshot
- projection versions
- included projections
- excluded projections
- filters and build settings
- generator version, prompt version, model version, filter version

An edition without a manifest is unexplainable and should not be considered
canonical output of this layer, even if it renders correctly.

### 3. Difference Contract

Defines how two editions are compared. Every publication type uses the same
diff engine rather than a bespoke comparison per artifact.

Categories:

- added
- removed
- changed
- reordered
- reclassified
- narrative changes
- identity changes
- timeline changes
- relationship changes

### 4. Publication Contract

Describes what kind of artifact is being built and which projections
participate: Core Lorebook, Career Book, Character Book, Family Book,
Identity Report, Timeline, Relationship Summary. The publication type is a
declared recipe, not a hardcoded generator function — see Phase Two.

This contract describes a *type* of artifact. It does not by itself say
which concrete, named thing a given edition belongs to — that is Publication
Identity, next.

## Publication identity (Blueprint 20.1)

The Edition Contract defines one release. It does not define what that
release is a release *of* — that is a separate, longer-lived object:

```text
Publication   (long-lived, permanent identity)
  handle: core-lorebook
        │
        ├── Edition v1
        ├── Edition v2
        ├── Edition v3
        └── Edition v4   ← latest / active
```

The Publication is the parent; the Edition is one immutable release beneath
it. Conflating the two is what makes "Core Lorebook v7" read as the whole
object, when it is really one edition of a Publication that will outlive v7
and everything after it. This distinction is cheap to add now, before any
user has more than a handful of editions, and expensive to retrofit once
they have dozens.

### Canonical handle

Every Publication gets a permanent, human-readable handle that never changes
even if its display name does — `core-lorebook`, `robotics-career`,
`music-journey`, `identity-report`, `relationship-history`. Editions,
manifests, and URLs reference the handle, never a display string or a raw
database id.

### Publication Registry

One registry owns Publication definitions:

- id / handle
- type (which Publication Contract it uses)
- display name
- description
- owner
- visibility
- edition strategy
- active edition
- latest edition
- default recipe

### Stable URLs

Handles make editions addressable without a link ever breaking:

```text
/publication/core-lorebook/latest
/publication/core-lorebook/v9
/publication/robotics-career/latest
/publication/family-history/v3
```

A database-id URL like `/lorebooks/47` is an implementation detail. The
handle-based form is the one users bookmark and share.

### This is already half-real

Today's `lorebook_name` column is an unformalized version of the canonical
handle — `recompileCoreLorebook()` already groups and looks up editions by
it. Blueprint 20.1 promotes that column from "a string biographies happen to
share" into a first-class Publication identity, and adds the registry object
it was always implicitly pointing at.

## Versioning: existing lineage becomes canonical

LoreBook does not need to invent an edition model. The `biographies` table
and its recompile path already implement one correctly:

- `lorebook_version` — the Edition Contract's version field, today.
- `base_biography_id` — the Edition Contract's previous-edition link, today.
- `memory_snapshot_at` — the Manifest Contract's knowledge-snapshot field,
  today.
- `recompileCoreLorebook()`
  (`apps/server/src/services/biographyGeneration/recompileCoreLorebook.ts`)
  — the Edition Builder, today: it reads the latest edition, generates a new
  one from current memory, and links back rather than overwriting.

Blueprint 20 declares these the authoritative edition lineage mechanism.
Every future publication type reuses this mechanism instead of growing a
parallel versioning scheme per artifact type.

## Edition stability

A publication records one of:

- **Draft** — not yet released; may still be discarded.
- **Published** — released; immutable from this point on.
- **Superseded** — a newer edition of the same named publication now exists.
- **Archived** — retained for history but no longer surfaced by default.
- **Pinned** — superseded or not, explicitly protected from being hidden or
  pruned because the user wants this exact edition preserved (e.g. "Career
  Story v4" stays visible even after v5 publishes).

Superseding is automatic; pinning is a user decision that overrides it.

## Canonical citation

Every paragraph in an edition retains a lineage chain back to its source
projections, mirroring the Kernel's own provenance discipline
(`KNOWLEDGE_KERNEL.md`, invariant 1: "Durable conclusions retain
provenance"):

```text
Chapter
   │
   ▼
Storyline
   │
   ▼
Events
   │
   ▼
Assertions
   │
   ▼
Evidence
```

If a paragraph looks wrong, the user inspects its lineage instead of
treating the book as a black box. This is the same principle the Difference
Contract depends on — you cannot explain what changed between two editions
if you cannot first explain what either edition is made of.

## Sequencing

### Milestone 1 — ship first

- Edition Contract, carrying a publication handle from day one (formalize
  `lorebook_name` into that handle — do not ship an Edition Contract without
  a parent reference and have to retrofit it later)
- Manifest Contract
- Difference Viewer

This alone answers both questions from Purpose: why an edition says what it
says, and what changed since the last one. It is built directly on the
`lorebook_version` / `base_biography_id` / `recompile-core` mechanism that
already exists — no new storage model is required to start. The full
Publication Registry (owner, visibility, edition strategy, default recipe)
is not required yet; only the handle reference is.

### Phase Two — once multiple publication types exist

- Publishing recipes (declared projections, ordering, filtering, tone,
  audience, length, version policy)
- Build targets (private, public, employer, family, friend, therapist, safe,
  explicit) — generalizing the version-aware content filtering
  `biographyGenerationEngine.ts` already performs per-spec
- Incremental publishing — rebuild only the sections affected by new
  knowledge (e.g. music chapter rebuilds; career and family chapters do not)

### Phase Three — once users have accumulated edition history

- Publishing Observatory — inspect why a specific edition looks the way it
  does, at the identity / narrative / timeline / career level
- Publishing Benchmarks — narrative coherence, chronology, coverage,
  identity preservation, readability, compression, hallucination
  resistance, edition reproducibility

## Invariants

1. Cognition discovers; publishing communicates. The Edition Builder
   consumes projections and never calls into cognitive reasoning directly.
2. An edition, once Published, is never mutated. Corrections produce a new
   edition, exactly as the Kernel requires assertions to be corrected by
   replacement rather than rewrite.
3. Every edition has a manifest. An edition without a manifest cannot be
   trusted as this layer's output.
4. Every publication type is expressed as a Publication Contract (a
   recipe), not a bespoke generator function.
5. All publication types share one Difference Contract implementation.
   Per-artifact diff logic is a smell, not a feature.
6. Superseding an edition is automatic; deleting or hiding a Pinned edition
   is not, regardless of supersession.
7. `lorebook_version`, `base_biography_id`, and `recompile-core` are the
   canonical lineage mechanism. New publication types extend it; they do not
   replace it with a parallel scheme.
8. Canonical citation must resolve for any rendered paragraph back through
   storyline, events, and assertions to evidence. A paragraph that cannot
   resolve this chain is not publishable.
9. Every Edition belongs to exactly one Publication, referenced by its
   permanent handle — never a raw display name or database id. A Publication
   outlives every Edition beneath it.

## Next steps

- Done: Edition, Manifest, and Difference Contracts implemented over the
  existing `biographies` table and its `bookVersionManager` service — see
  Status above. `lorebook_name` now functions as the canonical Publication
  handle in practice, though it is not yet renamed at the column level.
- Instrument `biographyGenerationEngine` to stamp `generatorVersion` and
  `modelVersion` (from `config.defaultModel`) into new editions' metadata,
  so the Manifest stops reporting `null` for edition going forward. Do not
  backfill historical editions — absence of a recorded version is itself
  honest information about editions predating this instrumentation.
- Defer Publication Contracts (recipes) until a second real publication type
  needs one — do not design the recipe format speculatively against one
  data point.
- Defer the Publishing Observatory and Publishing Benchmarks until enough
  edition history exists for either to have something to measure.
