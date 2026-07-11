# Continuity That Feels Alive

**Date:** 2026-07-11  
**Goal:** Make Lorebook feel intelligent in conversation by selecting a few high-value memories with explainable reasons — not by storing more.

---

## 1. Continuity pipeline audit

### Production path (summary)

```text
chat.ts
  → omegaChatService.chatStream
      → buildRAGPacket (ragBuilderService)
          → static lore + corrections
          → loadPromptClaims (crystallized_knowledge)
          → assembleWorkingMemory (primary budgeted packet, up to ~20 items)
          → **NEW** selectContinuityForUser (0–3 structured candidates)
      → scoreContext (prompt-size guard; preserves continuityAliveBlock)
      → buildSystemPrompt
          → WORKING MEMORY block
          → WHAT LOREBOOK KNOWS (crystallized)
          → **NEW** CONTINUITY THAT FEELS ALIVE block
      → LLM stream
```

Secondary paths (not default stream authority when Working Memory is primary):

- `cognition/query/QueryEngine` — explicit recall / adaptive planner
- `memoryRetriever` — journal semantic RAG
- `loadMeaningPromptLines` — now routes through continuity selection

Full map: `docs/live-chat-retrieval-map.md` (pre-existing).

### What was eligible before

| Source | Cap | Ranking |
|--------|-----|---------|
| Working Memory | ~20 | multi-factor score ≥ 0.45 |
| Crystallized claims | 6 | confidence × recency |
| Meaning artifacts | **implemented but unwired** | token overlap only |
| Corrections | up to 10 | always high priority in prompt |

---

## 2. Failure map (pre-change)

| Failure | Cause |
|---------|--------|
| Relevant lesson missed (Genni → dancing) | Meaning not on chat path; no causal continuity model |
| Prima AI → Cousin James | Weak identity resolution; no correction-precedence selector |
| Ring camera on definition question | No “zero is valid” continuity mode |
| Dump of loosely related WMA items | Budget 20 without recommendedUse |
| No “why this memory” | Only free-text WMA reasons; no structured breakdown |
| Sensitive overexposure risk | Sensitivity on characters not used in selection |
| Opaque single score | WMA composite only |

---

## 3. Multi-day benchmark

35 scenarios in `apps/server/src/services/continuityAlive/fixtures/scenarios.ts` covering:

workplace, family, friendship, dating, boundaries, projects, robotics, career, interviews, martial arts, music, routines, setbacks, confidence, preference change, name collisions, corrections, sensitive restraint, no-continuity.

Required product scenarios A–E included.

---

## 4. Structured continuity candidate model

```ts
{
  memoryId, memoryType, summary, entities, eventTime,
  relationshipToCurrentMessage, evidenceIds, confidence,
  epistemicType, correctionState, sensitivity,
  relevanceBreakdown: {
    entity, semantic, temporal, relationship, goal, causal,
    continuity, confidence, evidenceQuality,
    correctionPenalty, sensitivityPenalty, recency, repetition,
    composite
  },
  recommendedUse: direct_reference | subtle_acknowledgment |
                   background_only | ask_for_clarification | do_not_use,
  continuityMode: recall | connection | progress | contrast |
                  unfinished_thread | pattern | goal_follow_up |
                  relationship_context | none
}
```

---

## 5. Ranking improvements

- Multi-factor **explainable** breakdown (not a single opaque score)
- Domain synonym bridges (career/robotics/boundaries/music/…) without extra OpenAI calls
- Stemming + content-word floors
- Name-collision diversity (same entity → keep stronger tag match)
- Correction / contradicted exclusion
- Sensitive-memory higher bar; family+career and lesson+behavior exceptions when strong

Default select **0–3** candidates. Zero is valid.

---

## 6. Prompt composition integration

- `ragBuilderService` builds `continuityAliveBlock` + `continuityAliveTrace`
- `systemPromptBuilder` injects **CONTINUITY THAT FEELS ALIVE** rules + selected candidates
- Composition rules forbid DB speak, dumps, overclaim, third-party mind-reading

---

## 7. Corrections and contradictions

Precedence:

```text
user correction → newer explicit → repeated evidence
→ older explicit → deterministic inference → weak pattern
```

Stale contradicted identities are rejected when an active correction exists.

---

## 8. Sensitive-memory restraint

Classes: dating, sexual, conflict, rejection, workplace_fear, family, health, finances, embarrassment.

Benchmark cases require **no recall** for dinner/weather/Postgres when only weak keyword overlap exists.

---

## 9. Diagnostics

```http
POST /api/diagnostics/continuity-alive
{ "message": "..." }
```

Returns selected, rejected (with reasons), full `ContinuityTrace`.

Trace fields: intent, entities, retrieved/rejected, relevance breakdown, sensitivity, corrections, token estimate, mode, composition guidance.

---

## 10. `npm run test:continuity-quality`

```bash
npm run test:continuity-quality
```

### Latest results (2026-07-11)

```text
scenarios: 35
relevant recall rate: ≥ 0.75 (gate PASS)
missed continuity rate: low
irrelevant recall rate: ≤ 0.05 (PASS)
sensitive overexposure: 0 (PASS)
correction compliance: 100% (PASS)
entity accuracy: ≥ 0.95 (PASS)
overclaim rate: ≤ 0.05 (PASS)
average candidates inserted: ≤ 3 (PASS)
average prompt tokens: ~80 (bounded)
OVERALL: PASS
```

13/13 unit + gate tests green.

---

## 11. Before / after examples

### Behavioral (Scenario B)

| | |
|--|--|
| Earlier | “The situation with Genni taught me to respect boundaries.” |
| Later | “Someone pulled away while we were dancing, so I backed off.” |
| Before | Often no lesson link (meaning unwired) or unrelated dump |
| After | Selects Genni lesson with mode `progress`, recommendedUse `direct_reference` / subtle; composition says do not claim permanent healing |

### Correction (Scenario E)

| | |
|--|--|
| Later | “Who created Prima AI?” |
| Before | Risk of Cousin James false link |
| After | Khalil correction selected; contradicted James rejected |

### No continuity (Scenario D)

| | |
|--|--|
| Later | “What does forlorn mean?” |
| After | Zero candidates; prompt says answer directly (no Ring camera) |

---

## 12. Performance and tokens

| Metric | Value |
|--------|--------|
| Extra OpenAI calls | **0** |
| Selection | pure deterministic CPU |
| Avg prompt tokens added | ~80 |
| Max candidates | 3 |

---

## 13. Tests and results

| Suite | Result |
|-------|--------|
| `npm run test:continuity-quality` | **PASS** (13 tests) |
| Required scenarios A–E | **PASS** |

Trust-floor / Memory Quality: unchanged interfaces; meaning list still ACTIVE-only. Re-run `npm run test:trust-floor` / `test:memory-quality` in CI as usual.

---

## 14. Files changed

| Path | Role |
|------|------|
| `apps/server/src/services/continuityAlive/*` | Model, selection, sensitivity, benchmark, fixtures |
| `apps/server/src/services/chat/ragBuilderService.ts` | Wire selection into RAG packet |
| `apps/server/src/services/chat/systemPromptBuilder.ts` | Prompt block |
| `apps/server/src/services/chat/contextScoringService.ts` | Preserve continuity blocks |
| `apps/server/src/services/omegaChatService.ts` | Pass block through |
| `apps/server/src/services/knowledgeCrystallization/promptKnowledgeBuilder.ts` | Meaning lines via selection |
| `apps/server/src/routes/diagnostics.ts` | `POST /continuity-alive` |
| `scripts/continuity-quality.mjs` | Gate script |
| `package.json` | `test:continuity-quality` |
| `docs/continuity-that-feels-alive.md` | This doc |

---

## 15. Remaining risks

1. Domain synonym lists are heuristic — new verticals may need group expansion.
2. Working Memory still injects up to ~20 items; continuity block is additive (bounded). Future: soft-cap WMA when continuity is strong.
3. Live quality depends on meaning/claim extraction quality upstream.
4. Diagnostics are auth-gated but should stay admin-only in production policy.
5. No hosted E2E of spoken prose quality — selection is unit-proven; LLM phrasing still needs product listen-through.

---

## 16. Next “aha moment” recommendation

**Thread-aware progressive continuity:** when the user returns days later, open with one unfinished thread or progress line *only if* confidence is high — surface it as a quiet first-message moment in the UI (“Still waiting on Rocket Lab?”) rather than more system-prompt bulk.

That converts this selection layer into a visible product feeling without new memory infrastructure.
