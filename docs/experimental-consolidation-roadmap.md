# Experimental Runtime Consolidation Roadmap

**Audit date:** 2026-06-16  
**Prerequisite:** `docs/experimental-inventory.md`, `docs/core-vs-experimental-dependencies.md`, `docs/api-p0-hotfix-report.md`  
**Constraint:** Audit-first — no large implementation in this sprint

---

## Goal

Make experimental runtime **intentional**: only valuable systems survive, only production-ready systems become CORE, architecture shrinks over time.

---

## Current State

```
Production default
├── CORE_RUNTIME     ~45 mounts  (~365 routes)  ← always on
├── EXPERIMENTAL     101 mounts  (477 routes)    ← 503 unless flag
├── ADMIN            3 mounts    (27 routes)      ← 503 unless flag
└── RESEARCH         3 mounts    (17 routes)      ← 503 unless flag

46 EXPERIMENTAL mounts have production UI callers → broken pages in prod today
55 EXPERIMENTAL mounts have zero UI callers → candidates for deletion
```

---

## Phase 5 — Architecture Reduction Estimate

### KEEP (become CORE or stay gated with purpose)

| Category | Mounts | Routes (est.) | Action |
| --- | ---: | ---: | --- |
| Promote to CORE (batch 1) | 14 | ~120 | Biography, entity-resolution, goals, life-arcs, voids, insights, predictions, timeline-hierarchy, documents, photos, hqi, memoir, achievements, verification |
| Promote after tests | 2 | 11 | knowledge, mrq |
| Keep ADMIN | 3 | 27 | admin, dev, analytics, correction-dashboard |
| Keep RESEARCH | 3 | 17 | orchestrator, autopilot, agents |
| Keep gated experimental | ~15 | ~80 | RPG, quests (if gamification ships), strategy, biography-adjacent research |

### MERGE (reduce duplicate domains)

| Source | Target | Routes saved (est.) | Priority |
| --- | --- | ---: | --- |
| `/api/entity-ambiguity` | `/api/entity-resolution` | 1 | P1 |
| `/api/emotion` + `/api/emotion-resolution` | `/api/emotions` | 10 | P2 |
| `/api/prediction` | `/api/predictions` | 5 | P1 |
| `/api/github` | `/api/integrations/github` | 3 | P1 |
| `/api/memory-graph` + `/api/graph` + `/api/knowledge` | `/api/memory/*` (future) | 11 | P2 |
| `/api/memory-engine` + `/api/memory-ladder` | `/api/omega-memory` or `/api/memory/recall` | 12 | P2 |
| `/api/continuity-profile` | `/api/continuity` | 3 | P2 |
| `/api/knowledge-type` | `/api/knowledge` | 3 | P3 |
| `/api/identity-core` | `/api/identity` | 3 | P3 |
| `/api/hqi` | `/api/search?mode=hqi` | 3 | P2 (alternative to promote) |
| `/api/life` | `/api/life-arcs` | 2 | P2 |
| `/api/naming/memoir` | `/api/memoir` | 1 | P2 |

**Estimated routes removable via merge:** ~55  
**Estimated services consolidatable:** ~12 router modules → 4 domain services

### DELETE (no prod UI, no pipeline, no tests)

| Cluster | Example Mounts | Routes (est.) | Priority |
| --- | --- | ---: | --- |
| **Life OS psychology** | alternate-self, archetype, behavior, cognitive-bias, distortions, dreams, inner-dialogue, inner-mythology, paracosm, persona, personality, shadow, story-of-self, thoughts, toxicity, will, wisdom | ~45 | P3 |
| **Unused engines** | engine-registry, engines, consolidation, backward-storytelling, belief-reconciliation, creative, financial, growth, intervention, learning, legacy, reflection, resilience, scenes, social-projection, strategy | ~60 | P3 |
| **Duplicate temporal** | temporal-events, calendar (no UI), time (partial — verify) | ~13 | P2 |
| **Dead mounts** | external-hub (0 routes in scanner), harmonization (0 routes) | 0–2 | P1 (fix or delete registry entry) |
| **Low-value single routes** | alternate-self, paracosm, entity-meaning-drift | ~5 | P2 |

**Estimated routes deletable:** ~120–150 (25–30% of experimental surface)  
**Estimated UI removable:** `_future-surfaces/rpg/*` (8 components), `AgentPanel` (research), unused analytics module configs  
**Estimated backend removable:** ~40 route files after delete + merge passes

---

## Phase 6 — Prioritized Roadmap

### P0 — Production UI Unblock (1 week, registry-only)

**Action:** Change `classification: 'EXPERIMENTAL'` → `'CORE_RUNTIME'` in `routeRegistry.ts` only. No code moves.

| Mount | Routes | Why P0 |
| --- | ---: | --- |
| `/api/biography` | 22 | LoreBook, living biography, discovery — core product |
| `/api/entity-resolution` | 10 | Chat clarification + entity dashboard |
| `/api/goals` | 14 | Goals & values panel |
| `/api/life-arcs` | 7 | User profile, saga view |
| `/api/voids` | 4 | Knowledge gap dashboard |
| `/api/insights` | 4 | Discovery summary |
| `/api/predictions` | 4 | Discovery summary |
| `/api/timeline-hierarchy` | 13 | Timeline hierarchy + memory explorer filters |
| `/api/documents` | 4 | Chat import, file upload |
| `/api/photos` | 6 | Gallery, chat upload — **also fix public mount → protected** |
| `/api/entity-ambiguity` | 1 | Chat entity chips |

**Impact:** Removes 503 from ~12 primary UI surfaces. **Effort:** S (classification flip + photos auth flag).

**Pre-requisite tests to add (same sprint, small):**
- `tests/routes/knowledge.test.ts` — before promoting knowledge
- `tests/routes/memoryReviewQueue.test.ts` — before promoting mrq

---

### P1 — Promote Tier 2 + Merge Quick Wins (2 weeks)

| Action | Mounts | Notes |
| --- | --- | --- |
| Promote to CORE | `/api/knowledge`, `/api/mrq`, `/api/hqi`, `/api/memoir`, `/api/achievements`, `/api/reactions`, `/api/perception-reaction-engine`, `/api/verification`, `/api/integrations` | After P0 stable |
| Merge | entity-ambiguity → entity-resolution, github → integrations, prediction → predictions | Delete source mounts after alias period |
| Gate UI | `/api/rpg/*` — wrap `_future-surfaces` behind feature flag | Stop accidental prod calls |
| Fix registry | external-hub, harmonization — wire nested routers or remove dead entries | 0-route mounts |

---

### P2 — Domain Consolidation (4–6 weeks)

| Action | Impact |
| --- | --- |
| Merge memory-graph, graph, knowledge under `/api/memory` | −11 routes, clearer domain |
| Replace memory-engine caller with omega-memory/components API | −11 routes |
| Merge hqi into search OR promote standalone | −3 routes or +1 CORE mount |
| Delete temporal-events, calendar (no UI) | −4 routes |
| Delete emotion duplicate mount | −7 routes |
| Promote remaining medium-value mounts selectively | tasks, journal, resume if UI ships |

---

### P3 — Life OS Reduction (8+ weeks)

| Action | Impact |
| --- | --- |
| Audit 40+ psychology/experimental engines with zero UI | Delete ~45 mounts (~120 routes) |
| Remove RPG surface or promote as separate product | −8 routes + UI folder |
| Remove RESEARCH tier if orchestrator/autopilot unused 90 days | −17 routes |
| Collapse ADMIN into `/api/admin/*` subpaths | Cleaner ops surface |

---

## Decision Matrix: Promote vs Keep vs Delete

| Mount | Promote | Keep Experimental | Delete | Notes |
| --- | :---: | :---: | :---: | --- |
| biography | ✅ | | | Core product |
| entity-resolution | ✅ | | | Chat + entity UX |
| goals | ✅ | | | |
| life-arcs | ✅ | | | |
| voids | ✅ | | | |
| insights / predictions | ✅ | | | |
| timeline-hierarchy | ✅ | | | |
| documents / photos | ✅ | | | Ingestion |
| knowledge / mrq | ✅* | | | *After tests |
| hqi | ✅ | | | Or merge to search |
| memoir | ✅ | | | With biography domain |
| achievements / reactions | ✅ | | | Discovery |
| verification | ✅ | | | When trust UX ships |
| integrations | ✅ | | | |
| entity-ambiguity | | | ✅ | Merge first |
| memory-engine | | | ✅ | Merge to omega-memory |
| memory-ladder | | | ✅ | No unique caller |
| memory-graph | | ✅ | | Merge later |
| graph / perspectives | | ✅ | | Research |
| rpg | | ✅ | | Gate UI |
| agents / orchestrator / autopilot | | ✅ | | RESEARCH/ADMIN |
| bias-ethics / dreams / shadow / … | | | ✅ | No UI — delete cluster |
| quests | | ✅ | | `useQuests` exists — promote if gamification ships |
| external-hub | ✅ | | | Fix 0-route registry |
| harmonization | | | ✅ | 0 routes — remove registry |
| github | | | ✅ | Merge to integrations |

---

## Success Metrics

| Metric | Today | After P0 | After P3 |
| --- | --- | --- | --- |
| EXPERIMENTAL mounts | 101 | 87 | ≤40 |
| EXPERIMENTAL routes | 477 | ~390 | ≤150 |
| Prod UI → EXPERIMENTAL deps | 46 | 0 | 0 |
| CORE mounts | ~45 | ~59 | ~65 |
| Zero-UI experimental mounts | 55 | 55 | ≤10 |
| Route test gaps (prod UI) | 2 | 0 | 0 |

---

## Recommended Next Action

**Single PR — "P0 Experimental Promotion Batch"**

1. Flip classification for 11 mounts listed in P0 (registry-only diff)
2. Set `/api/photos` `requiresAuth: true`
3. Add `knowledge.test.ts` and `memoryReviewQueue.test.ts` stubs
4. Deploy server — no web changes required (URLs unchanged)

This unblocks LoreBook, goals, entity resolution, timeline hierarchy, and file upload in production without architectural rewrites.

---

## Related Documents

| Doc | Purpose |
| --- | --- |
| `docs/experimental-inventory.md` | Full mount listing |
| `docs/core-vs-experimental-dependencies.md` | UI dependency trace |
| `docs/api-domain-map.md` | Target canonical domains |
| `docs/api-consolidation-roadmap.md` | Broader API consolidation plan |
