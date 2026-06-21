# Egress Hardening Report

Date: 2026-06-21 · Implementation baseline. Trigger: Supabase egress 22.2 GB used vs 5.5 GB quota → requests throttled. Audit-first, then sliced fixes. Figures are structural estimates (no live profiler — Supabase data API was egress-restricted at audit time); validate against dashboard telemetry once the project is reactivated.

## Root cause

LoreBook repeated the same expensive work many times per chat message. A single message fans out into multiple processing passes (message level → per semantic unit → per perception unit → per event group), and each pass independently:

1. Called the LLM to **extract entities**, and
2. Loaded up to **500 `omega_entities` rows from Supabase** to **resolve** those names.

On top of that, several hot read paths shipped the **1536-dim `embedding` vector** (~20–40 KB/row as JSON = billed egress) that no caller consumed, and a few frontend surfaces refetched full datasets on every realtime event / on a tight poll. The embedding payloads + duplicated resolution reads were the dominant egress drivers.

## Shipped fixes (this baseline)

### Slice 1 — RPC embedding drop (zero behavior change)
- `supabase/migrations/20260629100000_match_journal_entries_drop_embedding.sql` removes the `embedding` column from `match_journal_entries`'s `RETURNS TABLE`. Name + arg signature unchanged, so all callers keep working. No caller read the vector from this RPC.

### Slice 2 — Retriever projection + MMR rework
- `apps/server/src/services/chat/memoryRetriever.ts`: all `journal_entries` reads go through a runtime-learned, `embedding`-free column projection (`journalEntryProjection()`); a single `select('*')` probe remains for schema learning. MMR diversity now scores on **content** (token overlap) instead of cosine over the vector, removing the last need to pull embeddings on the chat hot path.

### Slice 4 — Frontend amplifiers
- `apps/web/src/components/characters/CharacterBook.tsx`: realtime `postgres_changes` refetch **debounced** (4s trailing) so a burst of ingestion writes no longer triggers a storm of full `/api/books/characters` downloads.
- `apps/web/src/components/dev/LiveLogs.tsx`: auto-refresh **defaults off** + poll relaxed 2s → 5s, killing idle dev-tab polling of `/api/dev/logs`.

### Slice 5A — Ingestion dedup cache (Phase A)
- `apps/server/src/services/omegaMemoryService.ts`: short-TTL (2 min) in-process memo on `extractEntities` (keyed by content hash) and `resolveEntities` (keyed by user + candidate signature). Collapses identical-text duplicate work within one message. Bypassed when a custom `ResolutionContext` is passed and disabled under test. Side benefit: dedupes per-message mention bumps (one mention no longer counted 3–4×).

### Slice 5B — Single-pass threading (Phase B)
- The message-level extract+resolve result is now the authoritative entity set, threaded into semantic conversion via `ConversionContext.resolvedEntities`. `convertPerceptionToEntry` reuses it instead of re-extracting per unit. Safe because a unit's text is always a subset of the message text (so the message set is a superset). Falls back to per-unit extraction when no set is threaded in (e.g. journal path).
- Files: `apps/server/src/services/conversationCentered/ingestionPipelineClass.ts`, `.../semanticConversion.ts`.

## Regression guards (CI-enforced)

`apps/server` script `test:egress` runs three guards, wired as a named step in the **required** `backend-regression-tests` job (`.github/workflows/ci.yml`):

- `tests/architecture/egressProjection.test.ts` — RPC must not return `embedding`; retriever must use the projection (no `select('*')` regressions).
- `tests/services/ingestionDedupCache.test.ts` — dedup cache TTL + eviction.
- `tests/services/semanticConversionReuse.test.ts` — single-pass reuse (no per-unit re-extraction when message entities are present).

A regression now fails the PR at a labeled step instead of in production.

## Validation

- Full server suite: 539 files / 5,423 tests passing.
- `tsc --noEmit` clean; lints clean on all changed files.
- `npm run test:egress` green (17 tests).

## Next steps (priority order)

1. **Measure live** (blocked on Supabase reactivation) — confirm egress drop with dashboard telemetry before deciding whether the remaining ingestion slices are worth the risk.
2. **ER per-unit slice** — filter the threaded message set by name-presence instead of re-extracting in `ingestConversationER`. Medium risk (attribution semantics).
3. **Event-assembly slice** — `eventAssemblyService → ingestText` also re-extracts, but `ingestText` writes claims, so it needs care to avoid changing persisted data.
4. **Apply HNSW indexes** — `supabase/migrations/20260626100000_hnsw_vector_indexes.sql` is staged/unapplied; apply once the DB is healthy for a vector-search latency win.
