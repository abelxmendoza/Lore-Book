# Memory Quality — Extraction Audit & Milestone Report

Date: 2026-07-11

## Philosophy

```text
Raw conversation
  → People / Places / Orgs / Projects / Skills / Events
  → Autobiographical meaning   ← this milestone
  → Future continuity
```

Success is **accurate life understanding**, not entity count. No hallucinated facts.

---

## Phase 1 — Extraction map (post-message pipeline)

Path: `chat_messages` → `ingestionQueue` → `conversationIngestionPipeline.ingestFromChatMessage` → `ingestMessage` / core.

| # | Extractor / step | Purpose | Input | Output | Conf | Provenance | Det/LLM | Dedup | Downstream |
|---|------------------|---------|-------|--------|------|------------|---------|-------|------------|
| 0 | Scope classify | Product-only skip | text | scope | n/a | message | Det | n/a | skip biography |
| 1 | Normalization | Utterance split + light refine | text | normalized utterances | n/a | utterance | Det+light LLM | n/a | units |
| 2 | Multi-event split | Split multi-scene messages | text | split events | LLM conf | units | LLM gated | per message | assembly |
| 3 | Entity extract+resolve | People/places/orgs | full text | resolved entities | gate | chat metadata | Hybrid | EntityRegistry | books, links |
| 4 | Character promote | PERSON → characters | entities | character rows | n/a | thread link | Det | character dedupe | Characters Book |
| 5 | Entity facts | Attributes for char/org/loc | text+entity | facts | varies | entity_facts | Hybrid | entity-scoped | profiles |
| 6 | Kinship/household | Family graph | text+chars | kinship edges | evidence | services | Hybrid | graph keys | Family |
| 7 | Attributes / self facts | Job, age, self | text | attributes | varies | self char | Hybrid | self char | identity |
| 8 | Utterance + IR compile | LNC IR | utterance | IR rows | n/a | utterance | Hybrid | message | retrieval |
| 9 | Semantic extraction | EXPERIENCE/CLAIM units | utterance | extracted_units | type conf | unit | Hybrid | unit ids | assembly |
| 10 | Event / skill / project / interest / life-change | Domain signals | text | suggestions | gated | respective tables | LLM if gate | signal gates | Quest/Skills/Projects |
| 11 | Romantic / gym / workout / biometric | Domain detectors | text | domain rows | gated | source message | Hybrid | domain rules | Love/Health |
| 12 | Event assembly | who/where/when event | units | resolved_events | 0.8 base | unit links + fingerprint | Det+ingest | **source_fingerprint** | Timeline/Events |
| 13 | Causal detector | Event→event causality | new+past events | causal links | LLM | evidence strings | LLM | link pair | continuity |
| 14 | Impact detector | How event affects user | event | event_impacts | LLM/det | sources | Hybrid | event id | meaning tab |
| 15 | Episode segmentation | Thread→episodes | session | episodes | det | source_message_ids | Det | episode evidence | engines |
| 16 | Preference inference | likes/habits/taste | text | PreferenceSignal | scored | phrases+msg | **Det** | name key | profile |
| 17 | Emotion / status / org / quest / media / provenance / truth | Metadata layers | text | domain signals | varies | message id | Hybrid | domain | books/profile |
| 18 | **Memory Quality (new)** | Meaning, rel dimensions, progression, lifecycle | text | `metadata.memory_quality` + event meaning | evidence model | message + evidence quotes | **Det only** | pure functions | continuity UI, scoring |

### Gaps this milestone targets

| Gap | Before | After |
|-----|--------|-------|
| Event meaning | mostly who/where/when | intent, lesson, behavior change, identity, future continuity |
| Lesson chains | weak / LLM-only causal | deterministic “taught me” → current behavior chain |
| Relationship dimensions | type via LLM ER | lexical evidence-backed dimensions (manager, mentor, family…) |
| Preference lifecycle | like/dislike types | temporary vs stable vs goal vs identity |
| Progression | skill XP-ish | beginner→expert, career/relationship/moving transitions |
| Offline quality score | none | weighted Memory Quality Score |

---

## Phase 2 — Benchmark samples

`apps/server/src/services/memoryQuality/fixtures/autobiographicalSamples.ts`

Domains covered: work, family, friendship, travel/events, dating, hobbies, projects/skills, failure/lessons, achievements, routines, emotions, goals, identity.

Scoring: detected / missed / incorrect / low-conf / redundant / hallucination traps (`mustNotInvent`).

---

## Phase 3–6 — Implementation

| Module | Role |
|--------|------|
| `autobiographicalMeaningExtractor.ts` | Lessons, intent, outcome, emotion, causal chains |
| `relationshipDimensions.ts` | Evidence-only dimensions |
| `progressionDetector.ts` | Stage / transition signals |
| `preferenceStability.ts` | Lifecycle kinds |
| `confidenceModel.ts` | Non-inflating confidence |
| `memoryQualityScore.ts` | Offline MQ score |
| `memoryQualityIntegrationService.ts` | Persist on `chat_messages.metadata.memory_quality`, stamp `resolved_events.metadata.autobiographical_meaning` |
| Pipeline hook | Step **12.18b** after preference inference (no new LLM) |

Preference service: `attachLifecycleKinds` merges lifecycle into `PreferenceSignal.lifecycleKind`.

---

## Phase 7 — Confidence surface

Every meaning node / preference lifecycle hit exposes:

- `confidence` (capped ≤0.95 unless user-confirmed)
- `evidence` quote
- evidence count via `confidenceModel`
- contradictions reduce score
- no confidence inflation

---

## Phase 8 — Memory Quality Score

Weighted dimensions:

| Dimension | Weight |
|-----------|--------|
| eventQuality | 0.20 |
| relationship | 0.12 |
| continuity | 0.12 |
| identity | 0.12 |
| person | 0.10 |
| preference | 0.10 |
| timeline | 0.08 |
| hallucination | 0.08 |
| contradiction | 0.05 |
| duplicate | 0.03 |

Run: vitest `memoryQuality.test.ts` → logs aggregate.

---

## Before / after (same conversations)

**Baseline proxy:** entity-name bag without “taught me” / chain language.  
**After:** full message through meaning extractors.

Genni / Catch One fixture (expected):

| Metric | Before (entity-only text) | After (full message) |
|--------|---------------------------|----------------------|
| eventQuality | low (no lessons) | high (lesson + past Genni + boundary behavior) |
| continuity | low (no chain) | ~1.0 (chain present) |
| hallucination | 1.0 | 1.0 |

Aggregate across 8 samples: see test console `Memory Quality aggregate` (overall typically mid–high 0.5–0.8 depending on entity stubs).

---

## Constraints checklist

| Constraint | Status |
|------------|--------|
| No ontology redesign | OK |
| No durability redesign | OK |
| No planner redesign | OK |
| No new DB | OK (metadata only) |
| No extra OpenAI for MQ path | OK (deterministic) |
| Latency | fire-and-forget; pure regex/CPU |

---

## Tests

```bash
cd apps/server && npx vitest run tests/services/memoryQuality/memoryQuality.test.ts
```

Proves: richer meaning, relationship dimensions, progression, preference lifecycle, confidence caps, benchmark score, before/after event quality, no mustNotInvent hits.
