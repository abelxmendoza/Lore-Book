# LoreBook API Consolidation Roadmap

**Audit date:** 2026-06-16  
**Prerequisite docs:** `api-inventory.md`, `api-domain-map.md`  
**Goal:** One canonical API architecture — no duplicate domains, no dead endpoints, clear auth, path to commercial LoreBook API

---

## Executive Summary

LoreBook has **891 HTTP endpoints** across **152 mounts**, but production serves only **353 CORE endpoints**. The platform grew organically: timeline alone has **5 overlapping mounts**, threads have **2 parallel systems**, and search/recall/context split retrieval across **4 surfaces**.

**Recommended sequence:**
1. **P0** — Fix prod-breaking mismatches (experimental routes called from CORE UI; auth gaps)
2. **P1** — Merge thread + timeline domains; consolidate diagnostics
3. **P2** — Response envelope + auth matrix enforcement
4. **P3** — Delete gated dead code; launch `/api/v1` for external API

---

## Phase 2 — Duplicate API Detection

### KEEP / MERGE / DELETE Matrix

#### Timeline & Chronology

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/timeline-v2` | 5 | **KEEP** (canonical) | Full CRUD; TimelineV2 UI target |
| `/api/timeline` (legacy) | 16 | **MERGE → v2** then **DELETE** | Read-heavy legacy; `useLoreKeeper`, `useTimelineData` still call it |
| `/api/chronology` | 13 | **MERGE** → `/api/timeline/chronology` | `timelineV2.ts` already calls chronology — must promote to CORE |
| `/api/timeline-hierarchy` | 13 | **MERGE** → `/api/timeline/hierarchy` | Used by hierarchy panel, memory explorer |
| `/api/temporal-events` | 3 | **DELETE** | Superseded by conversation events |
| `/api/time` | 7 | **DELETE** or internal | Overlaps timeline temporal blocks |
| `/api/events` | 3 | **MERGE** → conversation events | Duplicate event storage |
| `/api/conversation/events` | (in conversation) | **KEEP** | Primary event UI (`EventsView`, `EventDetailModal`) |
| `/api/chapters` | 6 | **KEEP** → under timeline | Distinct product concept, not duplicate |
| `/api/life-arcs` | 7 | **KEEP** → under timeline | `useLifeArcs` active caller |
| `/api/evolution` | 1 | **KEEP** | Single insight endpoint, low overlap |

#### Entity / Character / Omega Memory

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/characters` | 25 | **KEEP** (canonical people API) | Primary UI surface |
| `/api/entities` | 3 | **MERGE** into characters router as index/auto-update | Too thin standalone |
| `/api/omega-memory` | 9 | **KEEP** → `/api/memory/claims` | Claims layer; distinct from character CRUD |
| `/api/knowledge` | 5 | **MERGE** → memory/knowledge | Overlaps omega claims + graph |
| `/api/graph` | 4 | **MERGE** → memory/graph | Knowledge graph duplicate |
| `/api/perspectives` | 9 | **MERGE** → memory/perspectives | Epistemic layer on same data |
| `/api/entity-resolution` | 10 | **KEEP** → entities/resolve | Active in chat clarification chips |
| `/api/entity-ambiguity` | 1 | **MERGE** into entity-resolution | Same UX flow |
| `/api/entity-meaning-drift` | 3 | **DELETE** or research | No known UI caller |

#### Search / Recall / Working Memory

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `POST /api/search/universal` | 1 | **KEEP** (canonical search) | TimelineSearch, primary discovery |
| `POST /api/memory-recall/query` | 1 | **MERGE** → search mode=recall | Same retrieval pipeline |
| `POST /api/memory-recall/chat` | 1 | **MERGE** → chat internal | Used by chat pipeline only |
| `GET /api/context/*` | 3 | **KEEP** (internal to chat) | Prompt assembly, not user search |
| `GET /api/entries/search/keyword` | 1 | **MERGE** → search | Keyword mode |
| `POST /api/diagnostics/working-memory` | 1 | **KEEP** (diagnostic) | Exposes assembler — not duplicate, dev tool |
| `/api/hqi` | 3 | **MERGE** → search or **DELETE** | Niche quality index search |
| `/api/memory-graph` | 2 | **MERGE** → memory/graph | Experimental graph traversal |
| `/api/memory-ladder` | 1 | **DELETE** | No known caller |

#### Threads / Conversation / Continuity

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/conversation` | 64 | **KEEP** (rename → `/api/threads`) | Canonical: thread CRUD, events, intelligence |
| `/api/threads` | 16 | **MERGE** into conversation | Timeline-node thread model; hierarchy panel caller |
| `/api/continuity` | 4 | **KEEP** → threads/intelligence/continuity | ContinuityDashboard |
| `/api/continuity-profile` | 3 | **MERGE** | Overlaps continuity + profile |
| Thread summaries (in conversation) | — | **KEEP** | Part of conversation router |
| `/api/summary` | 2 | **KEEP** → narrative/summary | Entry summaries, not thread summaries |

#### Chat Pathways

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/chat` | 8 | **KEEP** | Primary chat + stream |
| `/api/chat/message` | 2 | **MERGE** or fix path | COL orchestration; double `/message/message` bug |
| `/api/chat-memory` | 2 | **MERGE** → memory/sessions | Per-session store |
| `/api/memory-engine` | 11 | **DELETE** | Experimental alt chat; duplicates chat |

#### Relationships

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/conversation/.../relationships` | — | **KEEP** | Conversation-centered graph |
| `/api/relationships` | 3 | **KEEP** | Role inference NL |
| `/api/temporal-relationships` | 5 | **MERGE** → entities/relationships | Era-scoped narratives |
| `/api/relationship-dynamics` | 5 | **DELETE** or experimental | No CORE caller |

#### Contradictions & Corrections

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/contradictions` | 4 | **KEEP** | ContradictionsPanel |
| `/api/contradiction-alerts` | 4 | **MERGE** | Same product surface, split API |
| `/api/corrections` | 2 | **KEEP** | Chat message corrections |
| `/api/belief-reconciliation` | 5 | **MERGE** → contradictions | Same governance domain |
| `/api/correction-dashboard` | 9 | **KEEP** (admin) | Operator review |

#### Emotions (split naming)

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/emotion` | 7 | **MERGE** → `/api/emotions` | Duplicate naming |
| `/api/emotions` | 3 | **KEEP** (one mount) | Consolidate emotion + emotion-resolution |
| `/api/emotion-resolution` | 3 | **MERGE** | |

#### Predictions (split naming)

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/prediction` | 5 | **MERGE** → `/api/predictions` | Same domain |
| `/api/predictions` | 4 | **KEEP** | `useInsightsAndPredictions` caller |

#### GitHub / Integrations

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/integrations/github/*` | 4 | **KEEP** | Canonical |
| `/api/github` | 3 | **DELETE** | Duplicate standalone mount |
| `/api/external-hub` | 2 | **KEEP** → integrations/hub | `useExternalHub` caller |

#### Health / Wellness

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `GET /api/health` (index.ts) | 1 | **KEEP** | Liveness |
| `health.ts` at `/` + `/api/health` | 8 | **SPLIT** | Move wellness to `/api/wellness` |
| `GET /health` | 1 | **DELETE** | Legacy |

#### Identity / Analytics overlap

| Surface | Routes | Verdict | Rationale |
| --- | ---: | --- | --- |
| `/api/identity` | 8 | **KEEP** (promote when stable) | WhatAIKnows, identity pulse |
| `/api/analytics/identity` | 1 | **MERGE** → identity | `useIdentityPulse` calls analytics mount (ADMIN gated!) |

---

## Phase 5 — Authorization Audit

### Auth Tier Definitions

| Tier | Middleware | Use |
| --- | --- | --- |
| **public** | None / optional | Legal, health liveness, webhooks |
| **authenticated** | `authMiddleware` + `userIsolationGuard` | Default user data |
| **self** | authenticated + userId param match | Cross-user IDOR prevention |
| **developer** | `requireDevAccess` | Dev console, continuity-trace |
| **admin** | `requireAdmin` | Platform metrics, cognition-health |
| **owner** | `requireRole('owner')` | Billing overrides (future) |

### Mount-Level Auth Matrix (CORE_RUNTIME)

| Mount | Registry Auth | Handler Auth | Effective Tier | Issue |
| --- | --- | --- | --- | --- |
| `/api/chat` | public | optionalAuth | **authenticated** (should be) | PUBLIC mount — bypasses CSRF stack partially |
| `/api/entries` | public | requireAuth per handler | authenticated | Misleading mount flag |
| `/api/timeline` | public | mixed | authenticated | Same |
| `/api/diagnostics` | public | **mixed per route** | public → admin | See Phase 7 |
| `/api/conversation` | protected | requireAuth | authenticated | OK |
| `/api/admin` | protected | requireAdmin (router) | admin | OK but CORE tier mismatch |
| `/api/subscription` | protected | authMiddleware inline | authenticated | OK |
| `/api/security` | protected | none needed | authenticated | OK |
| `/api/account` | public | requireAuth | authenticated | Mount flag wrong |
| `/api/corrections` | public | requireAuth | authenticated | Mount flag wrong |

### Auth Inconsistencies (P0/P1)

| Issue | Routes | Fix |
| --- | --- | --- |
| PUBLIC mounts with handler-only auth | entries, chat, timeline, corrections, chapters, evolution, locations, summary, canon, photos, memory-graph, memory-ladder, calendar, tasks, x | Set `requiresAuth: true` OR document as intentional; ensure handlers always call requireAuth |
| Experimental routes called from CORE UI without flag | chronology, biography, goals, identity, life-arcs, voids, insights, predictions, entity-resolution, timeline-hierarchy | **P0:** Promote callers' routes to CORE or gate UI |
| `requireAdmin` bypassed in dev | all admin routes | Document; ensure prod always enforces |
| `/api/analytics/identity` used by identity pulse | 1 | **P0:** Move to `/api/identity/pulse` on CORE mount |
| Missing auth on some experimental handlers | scenes, entityMeaningDrift, external_hub ingest | **P0:** Add requireAuth |
| diagnostics root is public | GET `/api/diagnostics` | OK for deploy troubleshooting; limit sensitive fields |

---

## Phase 6 — API Versioning Audit

### Classification

| Category | Mounts | Verdict |
| --- | --- | --- |
| **v2 explicit** | `/api/timeline-v2` | **KEEP** — merge into unversioned `/api/timeline` as default implementation |
| **Legacy implicit** | `/api/timeline` (v1 read), `/api/threads`, `GET /health` | **DEPRECATE** |
| **Experimental** | 103 mounts | **KEEP gated** — do not expose in prod until promoted |
| **Research** | orchestrator, autopilot, agents | **KEEP gated** or **DELETE** if unused 90 days |
| **Admin** | dev, analytics, correction-dashboard | **KEEP gated** |
| **Dead** | memory-ladder (no caller), temporal-events, alternate-self (1 route, no caller), paracosm (1 route) | **DELETE** |
| **Misnamed legacy** | `legacy.ts` router | **KEEP experimental** — not LEGACY tier |

### Versioning Strategy

| Action | When |
| --- | --- |
| No `/api/v1` yet | Internal consolidation first |
| Introduce `/api/v1` | When first external LoreBook API customer |
| Deprecation headers | `Sunset`, `Deprecation` on merged routes for 90 days |
| Remove EXPERIMENTAL gate for promoted routes | After tests + UI migration |

### KEEP / DEPRECATE / DELETE Summary

| Verdict | Count (est.) | Examples |
| --- | ---: | --- |
| **KEEP** | ~400 post-consolidation | conversation, characters, omega-memory, timeline-v2, chat, search |
| **DEPRECATE** | ~50 | timeline v1, /api/threads (after merge), /health, /api/github |
| **DELETE** | ~200 | memory-engine, memory-ladder, temporal-events, duplicate emotion/prediction mounts, 60+ unused experimental engines |

---

## Phase 7 — Diagnostics Consolidation

### Current Diagnostics Endpoints (16)

| Route | Auth | Audience | Prod-Worthy? | Verdict |
| --- | --- | --- | --- | --- |
| `GET /api/diagnostics` | public | Deploy/debug | Yes (limited) | **KEEP** — strip request echo in prod |
| `GET /api/diagnostics/cors` | public | Deploy/debug | Yes | **KEEP** |
| `GET /api/diagnostics/cognition-health` | admin | Platform ops | Yes | **KEEP** — move to `/api/admin/cognition-health` |
| `GET /api/diagnostics/intelligence-health` | admin | Platform ops | Yes | **KEEP** — move to `/api/admin/intelligence-health` |
| `GET /api/diagnostics/thread-health` | auth | User + support | Yes | **KEEP** → `/api/threads/health` |
| `POST /api/diagnostics/thread-health/repair` | auth | User + support | Yes | **KEEP** → `/api/threads/repair` |
| `GET /api/diagnostics/graph-recovery` | auth | User | Yes | **KEEP** → `/api/memory/graph-recovery` |
| `POST /api/diagnostics/graph-recovery/run` | auth | User | Yes | **KEEP** |
| `GET /api/diagnostics/continuity-trace/:userId` | dev+self | Developer | Internal | **KEEP** — `/api/dev/continuity-trace` |
| `GET /api/diagnostics/story-coverage` | auth | User | Yes | **KEEP** → `/api/narrative/coverage` |
| `POST /api/diagnostics/working-memory` | auth | Developer | Internal | **KEEP** → `/api/dev/working-memory` |
| `GET /api/diagnostics/memory-coverage` | auth | User | Yes | **KEEP** → `/api/memory/coverage` |
| `POST /api/diagnostics/repair-entity-pollution` | auth | User/support | Yes | **KEEP** → `/api/entities/repair-pollution` |
| `POST /api/diagnostics/recover-relationships` | auth | User | Yes | **KEEP** → `/api/entities/recover-relationships` |
| `POST /api/diagnostics/recover-events` | auth | User | Yes | **KEEP** → `/api/timeline/recover-events` |
| `POST /api/diagnostics/life-reconstruction-score` | auth | User | Yes | **KEEP** → `/api/memory/trust-scorecard` |

### Target Diagnostics Structure

```
/api/admin/health/*          # Platform-wide: cognition, intelligence
/api/dev/*                   # Developer: continuity-trace, working-memory, logs
/api/threads/health          # User-facing durability
/api/memory/coverage         # User-facing memory audit
/api/narrative/coverage      # User-facing story coverage
/api/diagnostics             # Public deploy probe only (minimal)
```

### Other Health Endpoints (outside diagnostics router)

| Route | Verdict |
| --- | --- |
| `/api/internal/engine/*` | **MERGE** → admin/engine-health |
| `engineHealth.ts` | **MERGE** → admin |
| IntelligenceDashboard → intelligence-health | Already admin |

---

## Phase 8 — Public API Potential (LoreBook API)

### Commercial API Candidates

| API | Endpoints (today) | Stability | Commercial Value | Reuse Value | Recommendation |
| --- | --- | --- | --- | --- | --- |
| **Memory API** | omega-memory, memory-recall, context, corrections | Medium | **High** — core differentiator | High | **P1 launch candidate** — claims + recall + corrections |
| **Entity API** | characters, locations, organizations, relationships | Medium | **High** — people/places graph | High | **P1 launch candidate** |
| **Timeline API** | timeline-v2, chronology, conversation/events | Low (fragmented) | Medium | Medium | **P2** — after consolidation |
| **Relationship API** | relationships, family-trees, conversation relationships | Medium | **High** for genealogy/social | High | **P1** subset of Entity API |
| **Thread Intelligence API** | conversation threads, what-changed, traces | Medium | **High** — unique IP | Medium | **P2** — product differentiator, not first external |
| **Life Graph API** | graph + knowledge + omega + entities combined | Low | **Very high** long-term | Low today | **P3** — after graph consolidation |
| **Search API** | search/universal | Medium | Medium | High | **P2** — good developer UX |
| **Chat API** | chat stream | High | Low (commodity LLM) | Low | **No** — keep product-locked |

### External API Requirements (before launch)

1. Consolidate to canonical mounts (Phase 2)
2. Adopt `CanonicalResponse` envelope (Phase 4)
3. API keys + OAuth (not Supabase JWT)
4. Rate limits per tier
5. OpenAPI spec from route registry
6. `/api/v1` prefix with 90-day deprecation policy
7. Tenant isolation tests (already started in hotfix sprint)

### Suggested First External Package: **LoreBook Memory API**

```
POST /api/v1/memory/claims          # ingest claim
GET  /api/v1/memory/claims          # list claims
GET  /api/v1/memory/entities/:id    # entity summary
POST /api/v1/memory/recall          # semantic recall
POST /api/v1/memory/correct         # submit correction
```

---

## Phase 9 — Prioritized Action Plan

### P0 — Production Correctness (1–2 weeks)

| # | Action | Routes Affected | Effort |
| --- | --- | --- | --- |
| P0-1 | Promote `/api/chronology` to CORE or remove from `timelineV2.ts` client | 13 | S |
| P0-2 | Move `/api/analytics/identity` → `/api/identity/pulse` on CORE | 1 | S |
| P0-3 | Audit UI calls to EXPERIMENTAL routes; gate UI or promote route | ~20 call sites | M |
| P0-4 | Fix `POST /api/chat/message/message` path | 1 | S |
| P0-5 | Add requireAuth to unauthenticated experimental handlers | ~5 | S |
| P0-6 | Split wellness from `/api/health` → `/api/wellness` | 7 | M |
| P0-7 | Fix entries route order (`/:id` shadowing) | 3 | S |

### P1 — Domain Consolidation (2–4 weeks)

| # | Action | Routes Affected | Effort |
| --- | --- | --- | --- |
| P1-1 | Merge `/api/threads` into `/api/conversation`; alias old paths | 16 + 64 | L |
| P1-2 | Merge `/api/timeline` legacy into `/api/timeline-v2`; rename mount | 21 | L |
| P1-3 | Merge `/api/chronology` + `/api/timeline-hierarchy` under `/api/timeline` | 26 | M |
| P1-4 | Merge contradiction-alerts into contradictions | 8 | S |
| P1-5 | Consolidate diagnostics per Phase 7 target structure | 16 | M |
| P1-6 | Merge `/api/github` into `/api/integrations` | 3 | S |
| P1-7 | Unify emotion + predictions duplicate mounts | 19 | S |
| P1-8 | Introduce `sendSuccess`/`sendError` helpers; migrate admin + new routes | — | M |

### P2 — Stabilization (4–8 weeks)

| # | Action | Routes Affected | Effort |
| --- | --- | --- | --- |
| P2-1 | Merge search + memory-recall under `/api/search` with modes | 4 | M |
| P2-2 | Merge memory-graph, knowledge, graph, perspectives under `/api/memory` | 22 | L |
| P2-3 | Normalize mount-level auth flags to match handler reality | 21 public mounts | M |
| P2-4 | Generate OpenAPI from routeRegistry | 891 | M |
| P2-5 | Auth matrix integration tests per domain | — | M |
| P2-6 | Response envelope dual-write adapter for top 20 mounts | ~200 | L |

### P3 — Deletion & Platform API (8+ weeks)

| # | Action | Routes Affected | Effort |
| --- | --- | --- | --- |
| P3-1 | Delete memory-engine, memory-ladder, temporal-events | 17 | S |
| P3-2 | Delete unused Life OS experimental mounts (90-day no-caller audit) | ~150 | M |
| P3-3 | Remove LEGACY paths after 90-day Sunset headers | ~50 | M |
| P3-4 | Launch `/api/v1/memory` + `/api/v1/entities` external API | TBD | L |
| P3-5 | API key management + partner docs | — | L |

---

## Routes to Delete (Initial List)

| Route / Mount | Reason | Priority |
| --- | --- | --- |
| `/api/memory-engine` | Duplicates chat | P3 |
| `/api/memory-ladder` | No caller | P3 |
| `/api/temporal-events` | Superseded | P3 |
| `/api/github` | Duplicate of integrations | P1 |
| `GET /health` | Legacy liveness | P1 |
| `/api/alternate-self` | No caller | P3 |
| `/api/paracosm` | No caller | P3 |
| `/api/entity-meaning-drift` | No caller | P3 |
| `/api/relationship-dynamics` | No CORE caller | P3 |
| `/api/prediction` (keep predictions) | Duplicate naming | P1 |
| `/api/emotion` (keep emotions) | Duplicate naming | P1 |

## Routes to Merge

| Source | Target | Priority |
| --- | --- | --- |
| `/api/threads` | `/api/conversation` → `/api/threads` | P1 |
| `/api/timeline` (legacy) | `/api/timeline-v2` → `/api/timeline` | P1 |
| `/api/chronology` | `/api/timeline/chronology` | P1 |
| `/api/timeline-hierarchy` | `/api/timeline/hierarchy` | P1 |
| `/api/contradiction-alerts` | `/api/contradictions/alerts` | P1 |
| `/api/memory-recall` | `/api/search` (mode=recall) | P2 |
| `/api/knowledge` + `/api/graph` | `/api/memory/*` | P2 |
| `/api/chat-memory` | `/api/memory/sessions` | P2 |
| wellness in health.ts | `/api/wellness` | P0 |

## Routes to Rename

| Current | Target | Priority |
| --- | --- | --- |
| `/api/conversation` | `/api/threads` | P1 |
| `/api/timeline-v2` | `/api/timeline` (after v1 deprecated) | P1 |
| `/api/revealed-self` | `/api/narrative/revealed-self` | P2 |
| `/api/omega-memory` | `/api/memory/claims` | P2 |
| `/api/chat/message/message` | `/api/chat/orchestrate` | P0 |

## Routes to Stabilize (Promote EXPERIMENTAL → CORE)

| Mount | Trigger | Priority |
| --- | --- | --- |
| `/api/chronology` | timelineV2 client already depends | P0 |
| `/api/biography` | Lorebook, navigator active callers | P1 |
| `/api/goals` | Goals UI active | P1 |
| `/api/identity` | WhatAIKnows, identity pulse | P1 |
| `/api/life-arcs` | useLifeArcs | P1 |
| `/api/voids` | Knowledge gap dashboard | P1 |
| `/api/entity-resolution` | Chat clarification chips | P1 |
| `/api/timeline-hierarchy` | Hierarchy panel | P1 |
| `/api/insights` + `/api/predictions` | Insights panel | P2 |
| `/api/documents` | File ingestion sprint | P2 |

---

## Success Criteria

| Metric | Current | Target |
| --- | --- | --- |
| Production mounts | 43 CORE | ≤25 CORE |
| Duplicate domains | 12 overlap generations | 0 |
| PUBLIC mount auth mismatches | 21 | 0 undocumented |
| Response envelope adoption | ~10% | 100% on CORE |
| Undocumented experimental UI deps | ~20 | 0 |
| Dead routes (no caller, no pipeline) | ~150 | 0 |
| External API readiness | Not ready | Memory + Entity v1 |

---

## Related Files

| File | Role |
| --- | --- |
| `apps/server/src/routes/routeRegistry.ts` | Single source of truth for mounts |
| `apps/server/src/index.ts` | Global middleware + special routes |
| `GET /api/runtime/routes` | Live route catalog |
| `docs/api-inventory.md` | Full route listing |
| `docs/api-domain-map.md` | Canonical domains + response spec |

---

## Next Step (Recommended)

Start **P0-1 + P0-2 + P0-4** in a single hotfix PR — these are small changes that stop production 503s and fix path bugs without waiting for full thread/timeline merge.
