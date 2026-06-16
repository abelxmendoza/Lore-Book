# OpenAI Cost Audit

Date: 2026-06-16 · Audit only. Evidence: grep of `chat.completions.create` / `embeddings.create` across `apps/server/src`, plus the ingest pipeline call sequence (`ingestionPipelineClass.ingestMessageCore`). **A 429 is already firing in production** (`societyResolver`, Railway logs) — this is the binding constraint, not a hypothetical.

## Inventory
- **104 files** issue chat-completion calls.
- Model distribution (literal `model:` strings): **32× `gpt-5.4-mini`**, **4× `gpt-5.5`** (flagship/expensive), **2× `text-embedding-3-small`**, **2× `text-embedding-3-large`**.
- Embeddings created in 4 services: `embeddingService`, `engineManifest/manifestSync`, `engineManifest/manifestSearch`, `essenceRefinement/essenceRefinementEngine`.

## Per-USER-message ingest fan-out (the cost driver)
A single user turn through `ingestMessageCore` can trigger, **sequentially and per utterance**:
1. `normalizationService.normalizeText` — LLM per utterance
2. `multiEventSplittingService.splitEntryIntoEvents` — LLM per utterance
3. `hybridExtractor.extractSemanticUnits` — LLM (router skips simple msgs ✅) per utterance
4. `knowledgeTypeEngineService.createKnowledgeUnit` — LLM **per extracted unit**
5. `entryEnrichmentService.enrichEntry` — LLM per utterance
6. `semanticConversionService.convertUnitsToMemoryArtifacts` — LLM
7. relationship / attribute / romantic / interest detectors — LLM, conditionally
8. embeddings for new memory artifacts

→ **easily 6–12 LLM calls per message**, multiplied across utterances and units. This is the 429 source and the dominant cost line.

## Classification

| Call site | Class | Notes / action |
|---|---|---|
| `hybridExtractor` (router) | **Required** | Already optimized — cheap router skips full LLM on simple messages. Keep; extend the pattern. |
| `normalizationService` (USER msgs) | **Often redundant** | Most chat text needs no LLM normalization. Gate behind a cheap heuristic (length/typo signal) like the extractor router. |
| `multiEventSplittingService` | **Often redundant** | Single-event messages (the majority) don't need an LLM split. Pre-filter with a conjunction/temporal-marker heuristic. |
| `knowledgeTypeEngineService` (per unit) | **Batchable** | Fires once per extracted unit → N calls/message. Batch all units from one message into a single call. |
| `entryEnrichmentService` + `semanticConversionService` | **Mergeable** | Overlapping passes over the same text; candidates to fold into one structured-output call. |
| `tangentTransitionDetector` | **Redundant on hot path** | Makes ~4 separate LLM calls (topic/thought/emotion/intent). If invoked per turn, collapse to one structured call or make it opt-in. |
| `threadSummaryService` | **Cacheable / gated** ✅ | Already staleness-gated (only re-summarizes past a threshold). Good pattern. |
| Embeddings (`embeddingService`) | **Cached** ✅ | TinyLFU + Supabase upsert cache exists. Verify cache-hit rate; ensure no re-embed of unchanged text. |
| `gpt-5.5` (4 sites) | **Audit tier** | Flagship model is ~10–20× mini. Confirm each of the 4 genuinely needs flagship; downgrade any that don't. |
| Background `societyResolver` / `groupDetection` | **Throttle** | Already 429-ing. Lower frequency / add backoff; it's non-user-facing. |

## 429 risks & quota waste
- **Primary:** the 6–12 calls/message fan-out — sequential, unbatched, no global rate limiter. One active conversation can saturate RPM.
- **Secondary:** background workers (`societyResolver`, group detection) compete for the same quota and are already failing.
- **No global concurrency cap / token-bucket** in front of OpenAI → bursts hit the raw quota.

## Highest-ROI OpenAI fixes (no redesign)
1. **Gate normalization + multi-event splitting behind heuristics** (like the extractor already does) — removes the most calls/message for the common case. Biggest 429 + cost reduction.
2. **Batch `knowledgeTypeEngineService`** across a message's units → 1 call instead of N.
3. **Add a global token-bucket / concurrency limiter** in the OpenAI client wrapper so background work can't starve user requests (and 429s back off instead of erroring).
4. **Audit the 4 `gpt-5.5` sites** — downgrade any non-flagship-critical to mini.
5. **Raise the OpenAI quota** (immediate unblock for the active 429).

Estimated effect: items 1–2 alone should cut per-message LLM calls roughly in half for typical messages.
