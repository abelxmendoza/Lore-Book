# ModelRouter (LLM provider abstraction)

**Status:** Phase 1 + partial extraction wiring — **complete the rest later**.

See full handoff and checklist: [`docs/model-router-phase2.md`](../../../../../docs/model-router-phase2.md)

## Quick rules

- **Default is OpenAI.** No `LLM_*` env → behavior matches pre-router production.
- **Do not** switch chat / memory generation / user-facing prose to local models without measurement.
- Prefer `completeFor('extraction' | 'nano' | 'planner', params)` for new structured LLM calls.
- Local providers: set `LLM_*_PROVIDER` + model; keep `LLM_FALLBACK_TO_OPENAI=true` (default).

## What’s already routed

| Workload | Entry |
|----------|--------|
| Embeddings | `embeddingService` → `getModelRouter().embeddings('embedding')` |
| Merged extraction | `mergedExtractor` → `completeFor('extraction')` |
| Fact extraction | `factExtractionService` |
| Semantic units | `semanticExtractionService` |

## Still direct OpenAI (finish later)

Chat generation, conversation detectors (~20), narrative/memory writing, photo/calendar helpers, etc.  
Use `completeFor` when migrating; leave defaults on OpenAI.
