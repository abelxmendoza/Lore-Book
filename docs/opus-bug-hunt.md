# LoreBook — Bug Hunt & Memory-Quality Root Causes (Opus)

Companion to `docs/opus-architecture-audit.md`. Grounded in code as of Sprint AM (`8476547`). Each item: **what**, **where**, **why it bites**, **fix**. Confidence is flagged where I reasoned from architecture rather than a reproduction.

---

## Phase 3 — Defects introduced / latent

### B1 — Stale derived scores (data drift) · **High** · confirmed
**Where:** Sprint AL columns (`significance_score`, importance, relationship scores) recomputed only by `scripts/backfill-*.ts`. No trigger on memory change.
**Why:** scores are a pure function of memories but stored as source-of-truth. Adding/editing/**correcting** a memory does not recompute them. The message-correction loop (tombstone + re-ingest) makes this worse — it invalidates the lore cache but **not** the importance/significance derived from the tombstoned memory.
**Fix:** recompute the *touched* entity/event on the ingest + correction hooks (incremental), not via global backfill. Version-key any cache. Until then, treat these scores as "best-effort, possibly stale" in the UI.

### B2 — `routeRecallQuery` executed twice per turn · **Med** · confirmed
**Where:** [explicitRecallService.ts:63](apps/server/src/services/chat/explicitRecallService.ts#L63) and [ragBuilderService.ts:497](apps/server/src/services/chat/ragBuilderService.ts#L497), both reachable in one turn.
**Why:** duplicate work (2 full-table scans each) and a **consistency risk** — if user state changes between the two calls, the explicit-recall block and the RAG block can disagree within the same response.
**Fix:** route once per turn, memoize the result on the request, pass it down.

### B3 — Fire-and-forget ingestion vs. immediate recall (race) · **High** · confirmed pattern
**Where:** ingestion is enqueued fire-and-forget ([omegaChatService](apps/server/src/services/omegaChatService.ts) `ingestionQueue.enqueue` / `ingestMessageWithContext(...).catch`), while the response is generated from the **current** RAG packet.
**Why:** "I just told you about Tío Juan → what do you know about Juan?" can return "no record" because ingestion of the first turn hasn't completed (or was deduped/deferred by the registry). This is the mechanism behind several Phase-4 failures.
**Fix:** within a session, read pending/just-said entities from the live conversation buffer (thread recall already does some of this) and **never** assert "no record" for a name the user mentioned earlier in the same thread. Consider a synchronous "light" extraction for entities named in the current message before answering.

### B4 — `loadKnownEntities` unconditional full scan · **Med** · confirmed
**Where:** [recallQueryRouter.ts:246](apps/server/src/services/chat/recallQueryRouter.ts#L246). ~7/11 intents return before using it.
**Fix:** lazy-load behind the branches that need it; or replace with the cached index.

### B5 — Advisory hallucination guard is post-hoc, non-blocking · **High** (trust) · confirmed
**Where:** [chat.ts:168](apps/server/src/routes/chat.ts#L168) fires `verifyMemoryClaims` **after** the full response streamed, "never blocks the stream."
**Why:** it can detect a fabricated memory claim but the user has already read it. Detection ≠ prevention.
**Fix:** keep the async guard for telemetry, but add a **pre-generation constraint**: the system prompt must enumerate the *exact* entities/memories available this turn and instruct "only claim memory for these; for anything else say you don't have a record." Pair with a cheap post-stream correction toast when the guard fires ("I misspoke — I don't actually have a record of X").

### B6 — Entity-index built but unused (dead-ish code / drift between systems) · **Med** · confirmed
**Where:** `entityMentionIndexService` exists; router uses raw `.includes()`. Two code paths can disagree on "is X a known entity."
**Fix:** route through the index or delete it.

### B7 — Score columns default to 0 / 'minor' · **Med** · confirmed
**Where:** migration sets `significance_score DEFAULT 0`, `significance_level DEFAULT 'minor'`.
**Why:** every event created **before** a backfill (and every new event until its incremental recompute) reads as "minor / 0", which is indistinguishable from a genuinely computed-minor event. Sorting by `significance_score DESC` silently buries un-scored real events.
**Fix:** use a nullable score + `scored_at` timestamp; treat NULL as "unscored" (compute on read or exclude from significance sorts), never as "minor."

### B8 — Cache invalidation coverage · **Med** · needs verification
**Where:** `ragPacketCacheService.invalidateLoreCache` is called on correction; verify it is **also** called on normal ingest completion. If not, a freshly-ingested memory won't appear until the LRU entry expires.
**Fix:** invalidate on every ingest that writes lore for the user, not just corrections.

### B9 — `event_meaning_cache` key staleness · **Med** · needs verification
If the cache key is `eventId` alone, edited-evidence events serve stale meaning (same class as B1). **Fix:** include an evidence/version hash in the key.

> Already-fixed in prior sessions (noted so they aren't re-reported): `.catch()` on Supabase thenables in `certifiedEntityIndexService`; missing imports (`formatModeResponse`, `stabilityDetectionService`); `threadId` ref; the org-FK-embed array/object bug; the production 502 (boot ordering). These are clean as of now.

---

## Phase 4 — Memory-quality failures: root causes (not symptoms)

The transcript failures cluster into **four** root causes. Mapping each example:

### RC-1 — Entity node created without linked evidence ("exists but no story/memories")
**Examples:** *Ashley remembered but no story*, *Jerry exists but no memories*, *Tía Grace known but scene missing*.
**Root cause:** entity promotion and evidence-linking are **decoupled**. `characterFoundationService.promoteEntityToCharacter` creates a `characters` row from a `people_places` mention, but the supporting utterances/`extracted_units`/scenes are **not guaranteed to be linked** to that character (no enforced foreign-key from memory→character at creation). So the roster/profile path finds the node (✅ "I know Ashley") but the story/scene reconstruction path ([storyRecallService](apps/server/src/services/story/storyRecallService.ts), [sceneReconstructionService](apps/server/src/services/story/sceneReconstructionService.ts)) finds **zero linked scenes** (❌ "no story"). The two paths read different tables and one was populated, the other wasn't.
**Why Sprint AM didn't fix it:** AM added more *reconstruction* services, but reconstruction can only assemble evidence that was **linked at ingest**. The defect is upstream, in the link step.
**Fix:** make evidence-linking part of the same transaction as entity creation: when an entity is promoted, attach the `extracted_units`/utterance that mentioned it via `provenance_edges`. Add a diagnostic invariant: "every character with N mentions must have ≥1 linked memory" — `storyCoverageDiagnostics` should *fail* on violation, not just report.

### RC-2 — Foundation-first routing hides journal memories ("I don't have a clear record" / Costco not recalled)
**Examples:** *Costco memory existed but wasn't recalled*, *"I don't have a clear record."*
**Root cause:** the router is **foundation-primary by design** ([recallQueryRouter](apps/server/src/services/chat/recallQueryRouter.ts): `foundationPrimary: true` on most branches; "Journal entries are a supplement … never the primary surface"). If a memory lives in `journal_entries`/`extracted_units`/`location_mentions` but was **never promoted** to a foundation table (characters/locations/timeline), the foundation-first path returns "no record" even though the memory exists. Costco is a location mention that likely never became a `locations` foundation row.
**Confidence:** high — this follows directly from the routing contract.
**Fix:** the recall planner must **fall back to the journal/units layer** when foundation yields low confidence, instead of asserting absence. "Low foundation confidence" should route to vector search over `extracted_units`/`journal_entries`, not to "no record." This is a one-branch change in the unified planner.

### RC-3 — Async ingestion lag → false creation/absence claims
**Examples:** *Tío Juan creation confusion*, *false creation claims*, parts of *"no record"*.
**Root cause:** see B3. The model answers from pre-ingestion state and/or narrates a creation the registry actually **deferred or merged**. The registry's create/merge/defer decision (`characterRegistry.classifyForCreation`) is correct to be cautious, but the **response language doesn't know what the registry decided** because it runs async.
**Fix:** surface the registry decision into the turn. If the user said "remember Tío Juan," the response should reflect the *actual* outcome ("Got it, I've started a record for Tío Juan" only if a create/merge happened synchronously; otherwise "I want to make sure — is this the same Juan as …?"). Tie the assistant's claim to the pipeline's decision, not to optimistic phrasing.

### RC-4 — Entity resolution picks the wrong same-name entity ("wrong Juan")
**Example:** *wrong Juan selected*.
**Root cause:** Jaro-Winkler over names ([characterRegistry.ts:229,248](apps/server/src/services/characterRegistry.ts#L229), threshold 0.93) resolves "Juan" to *a* Juan by string similarity, with no use of **context** (which Juan was discussed in this thread / shares relationships/locations with the current context). Same mechanism that let "Abuela"≈"Abel."
**Fix:** resolution must be **context-aware**: among same-name candidates, rank by thread co-occurrence, shared relationships/locations, and recency — not by string distance (which is 1.0 for identical names and therefore useless as a discriminator). Add a disambiguation gate when top-2 candidates are close: ask, don't guess. String similarity should only gate *fuzzy* matches ("Jon"/"John"), never *exact*-name disambiguation.

### Cross-cutting: the hallucination/trust layer is reactive
`memoryClaimGuard` (advisory, post-stream) and `verifiedMemoryLanguage` exist, but absence is asserted by routing logic that has incomplete coverage (RC-2) and claims are made before the pipeline commits (RC-3). **Trust requires the answer to be a function of what is provably linked**, with an explicit "I'm not sure / no record" path that is *only* reached after the fallback layer (RC-2) has been tried.

---

## Suggested invariants (add as tests / runtime asserts)

1. Every `characters` row with `mention_count ≥ 1` has ≥ 1 `provenance_edge` to a memory/unit. (Catches RC-1.)
2. Recall never returns "no record" for a name present in the current thread buffer. (Catches RC-3.)
3. `routeRecallQuery` is invoked ≤ 1×/turn (assert via a per-request guard). (Catches B2.)
4. A significance/importance score older than its entity's `last_memory_at` is flagged stale. (Catches B1/B7.)
5. Exact-name matches never auto-merge without context agreement. (Catches RC-4.)
