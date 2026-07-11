# Thread-Aware Progressive Continuity

**Date:** 2026-07-11  
**Goal:** Quiet “pick up where you left off” — one high-confidence return point when the user resumes, or none.

Builds on **Continuity That Feels Alive** without redesigning retrieval, durability, Memory Quality, or the planner.

---

## 1. Unfinished-thread audit

| Existing source | Open / waiting signal | Resolved / abandoned |
|-----------------|----------------------|----------------------|
| `chat_messages` (user) | waiting / still need / follow up / interview scheduled | finished / confirmed / heard back |
| `goals` table | `status=active` | `completed`, `abandoned` |
| `autobiographical_meaning_artifacts` | plan/waiting language in labels | USER_CORRECTED / supersession |
| Quests | status fields | completed quests |
| Continuity engine | abandoned goals detector | — |

**No new task database.** Detection is deterministic over evidence snippets; interaction state (dismiss/resolve/surface counts) lives in `user_profiles.metadata.return_point_interactions` (best-effort) with in-memory fallback.

---

## 2. Return-point model

See `apps/server/src/services/returnPoints/types.ts`:

- States: `OPEN | IN_PROGRESS | WAITING | RESOLVED | DISMISSED | EXPIRED | SUPERSEDED`
- Surfaces: `resume_prompt | quiet_context | chat_only | do_not_surface`
- Relevance breakdown + sensitivity + provenance fields as specified

---

## 3. Detection and lifecycle

**Detection** (`detectOpenThreads.ts`): regex open signals; reject conditionals (`If I get the job, I might…`); ignore assistant text; cross-evidence resolution/supersession.

**Selection** (`selectReturnPoint.ts`): max **1** surface; zero valid; repetition/dismiss decay; age cap 90d; context mismatch (e.g. vocab chat).

**Actions:** continue / dismiss / resolve / correct → interaction records with provenance.

---

## 4. Ranking and repetition

Weights: same-thread, recency, unresolved strength, confidence, goal relevance − repetition − sensitivity.

Rules: ≥2 dismisses expire; ≥3 surfaces without continue → no re-surface.

---

## 5. Sensitive restraint

Dating, health, finances, workplace insecurity, rejection, etc. → **no unsolicited banner**. Same-thread resume may allow `chat_only` (not greeting-style surface).

---

## 6. UI

`ReturnPointBanner` above the composer in `ChatFirstInterface`:

- One compact line + Continue / Mark resolved / Correct / Dismiss  
- Async load; hidden when empty; does not block typing  

---

## 7. Actions (API)

| Endpoint | Behavior |
|----------|----------|
| `GET /api/chat/return-point` | 0–1 candidate |
| `POST /api/chat/return-point/:id/action` | continue / dismiss / resolve / correct |
| `POST /api/diagnostics/return-points` | full trace |

**Continue** returns structured `continueContext` and prefills a natural resume line into the composer (does not mutate canonical memory from the client).

---

## 8. Diagnostics

Trace includes candidates, selected, rejection reasons (`resolved`, `too_sensitive`, `conditional_only`, `already_dismissed`, …), sensitivity, repetition.

---

## 9. Benchmark and gate

```bash
npm run test:return-points
```

**45 scenarios**, gates:

```text
resolved resurfacing = 0
sensitive unsolicited = 0
correction compliance = 100%
avg surfaced ≤ 1
false unfinished ≤ 0.05
useful rate ≥ 0.7
OVERALL: PASS (16/16 tests)
```

---

## 10. Before / after

| | Before | After |
|--|--------|--------|
| App open after Rocket Lab availability | Silence or random memory dump | “Still waiting to hear back from Rocket Lab?” |
| After “confirmed Monday 4 PM” | Stale waiting line risk | No surface |
| “If I get the job, I might move” | Risk of fake task | No open thread |
| “Worried team dislikes me” | Risk of harsh greeting | No unsolicited surface |
| Tesla → aerospace | Tesla still open | Superseded / no Tesla surface |

---

## 11. Performance

| Metric | Value |
|--------|--------|
| Extra OpenAI calls | **0** |
| Selection | deterministic CPU |
| Surface max | 1 |
| Chat startup | non-blocking async banner |

---

## 12. Tests

| Suite | Result |
|-------|--------|
| `npm run test:return-points` | **PASS** 16/16 |
| `npm run test:continuity-quality` | **PASS** 13/13 |
| `npm run test:memory-quality` | **PASS** 25/25 |

---

## 13. Files changed

| Path | Role |
|------|------|
| `apps/server/src/services/returnPoints/**` | Model, detect, select, store, fixtures, benchmark |
| `apps/server/src/routes/chat.ts` | GET/POST return-point APIs |
| `apps/server/src/routes/diagnostics.ts` | Diagnostics |
| `apps/web/.../ReturnPointBanner.tsx` | Quiet UI |
| `apps/web/.../ChatFirstInterface.tsx` | Mount banner |
| `scripts/return-points.mjs` | Gate |
| `package.json` | `test:return-points` |
| `docs/thread-aware-progressive-continuity.md` | This doc |

---

## 14. Remaining risks

1. Regex detection will miss paraphrase-only open threads until meaning/goal extractors encode them.  
2. `user_profiles.metadata` write may fail if schema differs — in-memory fallback is session-local.  
3. Continue currently embeds a light marker in prefilled text; a first-class `returnPointContext` field on the stream body is a clean follow-up.  
4. Layout: banner adds a small reserved strip when present (by design, not aggressive).  

---

## 15. Next product milestone recommendation

**“What changed since last time” strip (session delta):** one factual line of new durable state since last visit (new people, completed waits, goal shifts) — distinct from unfinished return points — reusing existing WhatChanged services without new memory systems.
