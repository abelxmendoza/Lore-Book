# Robust Query System

LoreBook uses one bounded retrieval packet for ordinary chat turns and one
shared summary index for cross-Book discovery.

## Chat retrieval

`workingMemoryAssembler.ts` is the authoritative pre-response retrieval pass.
It combines structured candidates and semantic `omega_claims` candidates,
deduplicates them, relevance-ranks them, and applies one item budget.

`ragBuilderService.ts` selects exactly one primary path:

1. `working_memory_only` for ordinary turns when Working Memory found evidence.
2. `thread_scoped_fallback` for an explicit thread context.
3. `timeline_scoped_fallback` for an explicit timeline context.
4. `entity_arc_fallback` when Working Memory returned no evidence for an entity query.
5. `generic_memory_fallback` otherwise.

The entity dossier is fallback-only. A retrieval trace records the selected
paths, prompt sections, and Working Memory query count.

Semantic candidates reuse the existing `match_omega_claims` RPC. Structured
retrieval remains authoritative; semantic matches are only recall-boosting
candidates and must pass the same relevance ranking and budget. Set
`WMA_SEMANTIC_RECALL=off` for an immediate runtime rollback.

## Books and entity discovery

`bookEntityQueryService.ts` provides bounded server-side query, search, counts,
and pagination over Characters, Places, Organizations, Skills, Projects,
Quests, and Family groups.

`GET /api/entities/book-index` accepts:

- `q`: optional primary-name search
- `types`: comma-separated Book types
- `limit`: 1–100
- `offset`: non-negative offset

Each requested type uses one Supabase `select(..., { count: 'exact' })` call for
both rows and its exact count. Single-Book requests push `offset` and `limit`
directly into that query; cross-Book requests fetch only the bounded merge
window required to produce the requested globally ordered page.

Detailed Book services remain response shapers for cards and modals. The shared
index is the discovery layer, so chat/entity search and Book list surfaces can
use the same IDs, names, types, aliases, counts, and pagination contract.

The web client exposes the index through RTK Query. Canonicalized query
arguments deduplicate equivalent requests, the cache is retained briefly across
surface switches, and existing Organization/Quest mutation tags invalidate
subscribed index searches. Organizations and Quest Board use the shared index
for debounced authenticated discovery while retaining their detailed local
payloads for descriptions, analytics, filters, cards, and modals. Demo, guest,
and unauthenticated surfaces do not call the server index.

Demo Mode supplies the same index result shape from the Organization and Quest
records already rendered on each surface. Its alias matching, counts, ordering,
and result limits run locally after the same debounce, so demo-created groups
and mutated quests stay searchable without a backend request or a second mock
collection drifting from the visible cards.

The certified/mention index now includes Projects. Entity search no longer
loads the certified index twice through parallel confirmed/mentionable calls.

## Entity resolution

`entityResolutionCore.ts` remains the decision authority. The cognition query
resolver is now a compatibility adapter that supplies candidates to the core
instead of maintaining a separate ambiguity scorer.

Do not delete `entityResolutionBridge.ts`, `entityResolutionService.ts`, or
`characterAuthorityService.ts` until production has recorded an acceptable
shadow disagreement rate for seven days. The deletion gate in
`docs/entity-resolution-deletion-plan.md` remains binding.

## Verification

Focused coverage lives in:

- `tests/services/workingMemoryAssembler.test.ts`
- `tests/services/semanticClaimRetriever.test.ts`
- `tests/services/retrievalStrategy.test.ts`
- `tests/services/entities/bookEntityQueryService.test.ts`
- `tests/services/entities/certifiedEntityIndexService.test.ts`
- `tests/services/entitySearch.test.ts`
- `src/cognition/query/queryEngine.test.ts`
- `tests/services/entityResolutionBridge.test.ts`
- `tests/routes/entitySearchRoute.test.ts`
- `apps/web/src/store/api/bookEntityIndex.test.ts`
- `apps/web/src/components/organizations/OrganizationsBook.stance.test.tsx`
- `apps/web/src/components/quests/QuestBoard.test.tsx`

## Next safe expansions

1. Add a normalized searchable-key column or security-invoker view so partial
   alias search can be indexed server-side without raw PostgREST filter strings.
2. Move large Organization and Quest surfaces from "load detailed collection,
   then filter" to index-page IDs plus batched detail hydration once production
   cardinality justifies the added request coordination.
3. Add production latency and result-count telemetry for the Book index before
   changing its 60-second client cache or bounded cross-Book merge window.
