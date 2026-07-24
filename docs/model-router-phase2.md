# ModelRouter — handoff & Phase 2 reminder

**Last updated:** 2026-07-23  
**Status:** Phase 1 merged + first extraction surfaces wired. **Not finished.**  
**Do not wholesale-switch production chat to local models.**

This doc is for humans and coding agents (including ChatGPT handoffs) resuming LLM provider work.

---

## Goal (product)

LoreBook should **not** be “the OpenAI app.” It should **automatically use the best available intelligence** — local (Ollama, LM Studio, MLX, vLLM) or cloud (OpenAI, later Anthropic/Grok/Gemini) — as an implementation detail.

Architecture target:

```
ModelRouter
    ├── OpenAI
    ├── Ollama / LM Studio / MLX / vLLM / custom (OpenAI-compatible)
    ├── Anthropic / Grok (stubs in Phase 1)
    └── Future providers...
```

Per-capability config (provider **and** model separate):

```yaml
chat:        { provider: openai,  model: gpt-… }
extraction:  { provider: ollama,  model: qwen2.5:7b }
embedding:   { provider: ollama,  model: nomic-embed-text }
planner:     { provider: openai,  model: gpt-… }
```

---

## What we shipped (commits on `main`)

| Commit | Summary |
|--------|---------|
| `3f3e1d04` | Provider abstraction: types, OpenAI + OpenAI-compatible providers, stubs, env routes, OpenAI fallback |
| `8fd671c4` | `completeFor('extraction')` on mergedExtractor, factExtraction, semanticExtraction; policy snapshot routes |
| `937747f6` | embeddingService unit tests updated for ModelRouter |

### Code layout

```
apps/server/src/services/llm/
  types.ts              # LlmCapability, LlmProvider, routes
  modelRouterConfig.ts  # env → resolveRoute()
  providers.ts          # OpenAiProvider, OpenAiCompatibleProvider, stubs
  modelRouter.ts        # chatCompletion + embeddings + fallback
  completeFor.ts        # preferred call-site helper
  index.ts
  modelRouter.test.ts
  README.md             # short pointer
```

### Env (defaults preserve OpenAI)

Documented in root `.env.example`:

- `LLM_PROVIDER` / `LLM_DEFAULT_PROVIDER` (default `openai`)
- `LLM_FALLBACK_TO_OPENAI` (default `true`)
- Per capability: `LLM_CHAT_PROVIDER`, `LLM_EXTRACTION_PROVIDER`, `LLM_EMBEDDING_PROVIDER`, …
- Per capability models: `LLM_CHAT_MODEL`, `LLM_EXTRACTION_MODEL`, …
- Local bases: `LLM_OLLAMA_BASE_URL`, `LLM_LMSTUDIO_BASE_URL`, `LLM_MLX_BASE_URL`, `LLM_VLLM_BASE_URL`, `LLM_LOCAL_BASE_URL`

When primary is not OpenAI and it fails, router falls back to OpenAI with a **real OpenAI model id** (never forwards `qwen3:8b`-style tags).

Diagnostics: `buildOpenAiPolicySnapshot()` includes `modelRouter.routes` (see `/api/runtime` style policy endpoint).

---

## Already on ModelRouter

| Capability usage | Service |
|------------------|---------|
| `embedding` | `apps/server/src/services/embeddingService.ts` |
| `extraction` | `apps/server/src/services/ingestion/mergedExtractor.ts` (production merged extraction) |
| `extraction` | `apps/server/src/services/factExtractionService.ts` |
| `extraction` | `apps/server/src/services/conversationCentered/semanticExtractionService.ts` |

Default with no env overrides: **still OpenAI** for all of the above.

---

## TODO — complete later (checklist)

### High value / lower risk (do these next)

- [ ] Migrate high-volume **structured** detectors that use `config.extractionModel` / `openai.chat.completions.create` to `completeFor('extraction', …)` (omit hard-coded `model` so the route owns it).
  - Candidates under `apps/server/src/services/conversationCentered/*Detector*.ts`
  - Also: `biometricExtractor`, `relationshipUpdateExtractor`, tangent detectors, etc.
- [ ] Wire **nano** tier paths (`config.nanoModel`) via `completeFor('nano', …)` — e.g. chat compaction.
- [ ] Optional: one **routing/classification** call site via `completeFor('planner', …)` if still LLM-based (Query Planner core is deterministic — don’t force LLM where none exists).
- [ ] Measure quality + cost when `LLM_EXTRACTION_PROVIDER=ollama` (shadow or staging only).

### Medium risk

- [ ] Implement real **Anthropic** and **Grok/xAI** providers (stubs currently always unavailable → OpenAI fallback).
- [ ] Streaming chat through ModelRouter (today chat stays on OpenAI singleton + Responses bridge — do not break streaming/tool paths).
- [ ] Align cost attribution / budget recording for non-OpenAI providers.

### Do **not** do yet (without explicit product decision + evals)

- [ ] Switch production **user-facing chat** to local models.
- [ ] Switch **memory generation / long-form narrative** to local without quality gates.
- [ ] Set Railway/prod `LLM_PROVIDER=ollama` without fallback and without load testing.

### Recommended local experiment (dev only)

```bash
LLM_EMBEDDING_PROVIDER=ollama
LLM_EMBEDDING_MODEL=nomic-embed-text
LLM_EXTRACTION_PROVIDER=ollama
LLM_EXTRACTION_MODEL=qwen2.5:7b
LLM_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
# LLM_FALLBACK_TO_OPENAI=true  # default — keep on
```

Chat remains OpenAI. If Ollama is down, extraction/embeddings fall back to OpenAI.

---

## Design invariants (keep these)

1. **Infrastructure upgrade, not behavior change** unless env explicitly opts into non-OpenAI.
2. **Fallback by default** so missing local servers never take down the app.
3. **Capability ≠ vendor** — application code picks `extraction` / `chat` / `embedding`, not `OpenAI`.
4. **Provider ≠ model** — both configurable per capability.
5. Prefer local for high-volume structured work; reserve cloud for hard reasoning and prose **after** measurement.

---

## How to resume in a new chat

Paste something like:

> Continue LoreBook ModelRouter Phase 2. Read `docs/model-router-phase2.md` and `apps/server/src/services/llm/README.md`. Phase 1 + extraction/embeddings are on main. Next: migrate conversationCentered detectors to `completeFor('extraction')`, keep OpenAI default and fallbacks, do not touch chat streaming.

---

## Related files

- `.env.example` — LLM_* documentation block  
- `apps/server/src/config/openaiPolicy.ts` — runtime route snapshot  
- `apps/server/src/lib/openai.ts` — OpenAI singleton (budget, circuit breaker, Responses) still used by OpenAiProvider and all unmigrated call sites  
- `apps/server/src/services/openaiClient.ts` — re-export of that singleton for subdirectory services  
