# COST PER MESSAGE

Goal: trace one authenticated chat message from input to response and count the
external/expensive operations it triggers, synchronously (in the latency path)
and in background ingestion.

> ⚠️ These are **static-trace estimates**, not measured numbers. The codebase
> already has an ingestion cost meter (`npm run cost:ingestion`,
> `ingestionCostMeter` emitting `ingestion.cost`, and `stageTimer`). **The first
> action is to capture real per-message figures on the live path** — do not
> optimize before the number exists. The estimates below scope where to look.

---

## Per-message operation trace

### A. Synchronous (in the user's latency path) — `omegaChatService.chatStream()`
Each of these is an awaited call that can hit OpenAI, embeddings, or many DB rows:

| Stage | Source | LLM | Embed | DB |
|---|---|---|---|---|
| Mode/route + intent | modeRouter / intentDetection | ~1 | – | reads |
| RAG packet build | `buildRAGPacket` → memoryRetriever | – | 1 | vector search + reads |
| Date/time extraction | `extractDatesAndTimes` (omegaChatService.ts:405) | 1 | – | – |
| Continuity check | `checkContinuity` (:1289) | ~1 | – | reads |
| Connections | `findConnections` (:1297) | ~1 | – | reads |
| Strategic guidance | `getStrategicGuidance` (:1305) | ~1 | – | reads |
| Persona RL select/build | personaRL (:1429,:1443) | 0–1 | – | reads |
| Interpretation | `resolveInterpretationForEvidence` (:1571) | ~1 | – | – |
| Memory suggestion | `detectMemorySuggestion` (:1935) | ~1 | – | – |
| **Final answer** | streaming completion (:2521 pattern) | 1 | – | – |

**Synchronous estimate: ~6–10 OpenAI completion calls + 1 embedding + several
vector/row reads per message.** This matches the prior hardening audit's "6–12
OpenAI calls/msg, 429 active."

### B. Background (after response) — ingestion queue + fire-and-forget
`ingestionQueue.enqueue` (:780) + ~10 `.catch()` jobs (:1752–1942):

| Job | Source | LLM | Embed |
|---|---|---|---|
| Entity extraction | omegaMemoryService.extractEntities | 1+ | – |
| Entity resolution | resolveEntities (≤500-row pool/type) | – | 1+ |
| Claim conflict detection | conflictDetected / findSimilarClaims | 0–1 | reuses stored |
| Perception / event-assembly ingestion | ingestion pipeline | 1+ | 1+ |
| Compaction, memoir, lifestory, epiphany, group detection | various | 0–several | – |

omegaMemoryService alone has **11 OpenAI/embedding call sites**. Ingestion adds an
estimated **3–8 more LLM/embedding calls** per message.

### Combined estimate
**~10–18 OpenAI/embedding calls per user message** across sync + background.

---

## Cost framing (replace with measured numbers)

At a mid-tier model + embeddings and typical token counts, **order-of-magnitude
$0.01–0.05 per message**. At 1,000 daily-active users × ~20 messages/day that is
**~$200–$1,000/day ($6k–$30k/month)** before infra — a launch-economics risk if
unoptimized. The spread is wide precisely because it is unmeasured: **measure
first.**

---

## Most expensive components (where to cut)
1. **The synchronous "cognition fan-out"** (continuity + connections + guidance +
   interpretation + memory-suggestion + dates). 5–6 separate LLM calls decorate a
   single answer. Most can be (a) merged into one structured call, (b) made
   conditional on cheap heuristics, or (c) moved off the latency path.
2. **Duplicate extraction/resolution** across message-level + per-unit + perception
   + event-assembly ingestion. The `INGEST_CACHE` (omegaMemoryService.ts) helps
   within a process; durable dedup/idempotency would cut repeat LLM spend.
3. **Resolution pool loads** (≤500 rows/type) — vector RPC + egress per message.

## Highest-ROI cost actions
1. **Measure** real calls + spend per message (cost meter already exists).
2. Collapse the 5–6 decorator LLM calls into **one** structured "analysis" call,
   gated by heuristics so most messages skip it.
3. Make the second answer-shaping passes conditional, not default.
4. Durable idempotent ingestion (also a reliability fix) to kill repeat work.
5. Confirm embeddings are cache-hitting (`embeddingCacheService`) on the hot path.
