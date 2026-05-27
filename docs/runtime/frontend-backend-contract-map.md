# Frontend ↔ Backend Contract Map

_Generated: 2026-05-26 | Runtime: Stabilization Phase_

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | CORE_RUNTIME — always active |
| 🔬 | EXPERIMENTAL — disabled in production unless `ENABLE_EXPERIMENTAL_RUNTIME=true` |
| 🔴 | CRITICAL MISMATCH — frontend depends on this in a core UX flow |
| 🟡 | OPTIONAL — used in non-blocking secondary feature |
| ⚫ | DEAD_ROUTE — referenced in code but likely unreachable in any flow |
| 👤 | ADMIN / RESEARCH — internal tooling only |

---

## REQUIRED_CORE — Must be CORE_RUNTIME

These endpoints are required for: login → chat → thread persistence → memoir → characters → continuity.

| Route | Classification | Status | Consumer |
|-------|----------------|--------|----------|
| `POST /api/chat/stream` | ✅ CORE_RUNTIME | **LIVE** | `useChat.ts` — primary message send |
| `POST /api/chat` | ✅ CORE_RUNTIME | **LIVE** | `useLoreKeeper.ts`, character/location modals |
| `POST /api/chat/feedback` | ✅ CORE_RUNTIME | **LIVE** | `ChatFirstInterface.tsx`, `features/chat` |
| `GET /api/user/terms-status` | ✅ CORE_RUNTIME | **LIVE** | `useTermsAcceptance.ts` |
| `POST /api/user/accept-terms` | ✅ CORE_RUNTIME | **LIVE** | `TermsOfServiceAgreement.tsx` |
| `GET /api/user/profile` | ✅ CORE_RUNTIME | **LIVE** | `api/user.ts` |
| `GET /api/security/csrf-token` | ✅ CORE_RUNTIME | **LIVE** | `fetchJson` pre-acquisition |
| `GET /api/entries` | ✅ CORE_RUNTIME | **LIVE** | `useLoreKeeper.ts`, `WorkSummaryImporter` |
| `POST /api/entries` | ✅ CORE_RUNTIME | **LIVE** | `useLoreKeeper.ts`, `WorkSummaryImporter` |
| `GET /api/timeline` | ✅ CORE_RUNTIME | **LIVE** | `useLoreKeeper.ts` |
| `GET /api/timeline/tags` | ✅ CORE_RUNTIME | **LIVE** | `useLoreKeeper.ts` |
| `GET /api/timeline/eras` | ✅ CORE_RUNTIME | **LIVE** | `useTimelineData.ts` |
| `GET /api/timeline/sagas` | ✅ CORE_RUNTIME | **LIVE** | `useTimelineData.ts` |
| `GET /api/timeline/arcs` | ✅ CORE_RUNTIME | **LIVE** | `useTimelineData.ts` |
| `GET /api/chapters` | ✅ CORE_RUNTIME | **LIVE** | `useLoreKeeper.ts`, `api/saga.ts` |
| `POST /api/chapters` | ✅ CORE_RUNTIME | **LIVE** | `useLoreKeeper.ts`, `ImprovedTimelineView` |
| `GET /api/evolution` | ✅ CORE_RUNTIME | **LIVE** | `useLoreKeeper.ts` |
| `GET /api/characters/list` | ✅ CORE_RUNTIME | **LIVE** | `CharacterBook`, `UserProfile`, multiple modals |
| `POST /api/characters/extract-from-chat` | ✅ CORE_RUNTIME | **LIVE** | `useCharacterExtraction.ts` |
| `POST /api/characters` | ✅ CORE_RUNTIME | **LIVE** | `useCharacterExtraction.ts` |
| `GET /api/conversation/threads` | ✅ CORE_RUNTIME | **LIVE** _(just promoted)_ | `useChatThreads.ts` — thread list |
| `POST /api/conversation/threads` | ✅ CORE_RUNTIME | **LIVE** _(just promoted)_ | `useChatThreads.ts` — create thread |
| `PATCH /api/conversation/threads/:id` | ✅ CORE_RUNTIME | **LIVE** _(just promoted)_ | `useChatThreads.ts` — save messages |
| `PATCH /api/conversation/threads/:id/title` | ✅ CORE_RUNTIME | **LIVE** _(just promoted)_ | `useChatThreads.ts` — rename |
| `DELETE /api/conversation/threads/:id` | ✅ CORE_RUNTIME | **LIVE** _(just promoted)_ | `useChatThreads.ts` — delete |
| `GET /api/continuity/state` | ✅ CORE_RUNTIME | **LIVE** | `api/continuity.ts`, `useContinuity.ts` |
| `GET /api/continuity/conflicts` | ✅ CORE_RUNTIME | **LIVE** | `useContinuity.ts` |
| `GET /api/contradiction-alerts` | ✅ CORE_RUNTIME | **LIVE** | `ContradictionAlertsPanel.tsx` |
| `GET /api/search/universal` | ✅ CORE_RUNTIME | **LIVE** | `TimelineSearch.tsx` |
| `GET /api/subscription/status` | ✅ CORE_RUNTIME | **LIVE** | `useSubscription.ts` |
| `GET /api/locations` | ✅ CORE_RUNTIME | **LIVE** _(just promoted)_ | `Locations.tsx`, `LoreBook.tsx`, `EntityDetailModal` |
| `POST /api/locations` | ✅ CORE_RUNTIME | **LIVE** _(just promoted)_ | `Locations.tsx` |
| `GET /api/onboarding/briefing` | ✅ CORE_RUNTIME | **LIVE** | `FirstWeekBriefing.tsx` |
| `POST /api/onboarding/complete` | ✅ CORE_RUNTIME | **LIVE** | `OnboardingWizard.tsx` |
| `GET /api/health` | ✅ CORE_RUNTIME | **LIVE** | `ChatFirstInterface.tsx` connection check |

---

## OPTIONAL_EXPERIMENTAL — Disabled but handled gracefully

These endpoints return 503 in production. All callers have `.catch(() => {})` or similar silent handling.

| Route | Caller | Degradation behavior |
|-------|--------|----------------------|
| `POST /api/moods/score` | `useChat.ts:289` | `.catch(() => {})` — silent, no UX impact |
| `GET /api/insights/recent` | `UserProfile.tsx`, `DiscoveryOverview.tsx` | Shows empty insight panel |
| `GET /api/continuity/merge` | `api/continuity.ts:58` | `.catch(() => ({ suggestions: [] }))` — safe |
| `GET /api/memory-graph` | `api/fabric.ts:36` | Fabric view shows empty state |
| `GET /api/mrq/pending` | `useMemoryReviewQueue.ts` | Review queue empty |
| `GET /api/voids/gaps` | `VoidMemoryOverlay.tsx`, `KnowledgeGapDashboard.tsx` | Void panels hidden |
| `GET /api/timeline-hierarchy/search` | `MemoryFiltersSidebar.tsx` | Filters show empty options |
| `GET /api/memoir/outline` | `MemoirView.tsx`, `UserProfile.tsx` | Memoir section blank |
| `GET /api/biography/*` | `LoreBook.tsx`, `BiographyGenerator.tsx` | Lorebook biography tab empty |
| `GET /api/essence/profile` | `SoulProfilePanel.tsx` | Soul profile tab empty |
| `POST /api/entity-resolution/disambiguate` | `ChatFirstInterface.tsx:713` | Disambiguation chip absent |
| `GET /api/identity/what-ai-knows` | `WhatAIKnows.tsx` | Page shows empty state |
| `GET /api/orchestrator/*` | `api/index.ts`, `api/saga.ts` | Orchestrator data absent |
| `GET /api/goals/values` | `useGoalsAndValues.ts` | Goals panel empty |
| `GET /api/predictions` | `useInsightsAndPredictions.ts` | Predictions panel empty |
| `GET /api/rpg/*` | RPG views | RPG panels empty |
| `POST /api/conversation/events` | `EventsBook.tsx`, `EventsView.tsx` | Events tab empty |

---

## SHADOW_DEPENDENCY — Frontend calls backend path not in route registry

These are sub-paths of registered routers, not separate registry entries. All are expected to work.

| Call path | Router | Classification |
|-----------|--------|----------------|
| `POST /api/entries/voice` | `entriesRouter` | ✅ CORE_RUNTIME |
| `GET /api/entries/suggest-tags` | `entriesRouter` | ✅ CORE_RUNTIME |
| `GET /api/chat/memory-feedback/:id` | `chatRouter` | ✅ CORE_RUNTIME |
| `GET /api/timeline/omni` | `timelineRouter` | ✅ CORE_RUNTIME |
| `GET /api/timeline/identity` | `timelineRouter` | ✅ CORE_RUNTIME |
| `PATCH /api/conversation/threads/:id/title` | `conversationCenteredRouter` | ✅ CORE_RUNTIME |
| `GET /api/conversation/threads/:id/messages` | `conversationCenteredRouter` | ✅ CORE_RUNTIME |

---

## DEAD_ROUTE — No active frontend consumer

| Route | Notes |
|-------|-------|
| `GET /api/chat/test-openai` | Dev-only diagnostic — no production UI |
| `GET /api/runtime/routes` | Ops diagnostic — no frontend consumer by design |
| `POST /api/chat/action` | Defined, not called from any current component |
| Various `/api/rpg/*` sub-routes | Components exist but features are gated in nav |

---

## Recent Promotions (this session)

| Route | Previous | New | Reason |
|-------|----------|-----|--------|
| `/api/conversation` | EXPERIMENTAL | **CORE_RUNTIME** | Thread CRUD is the only persistence layer for chat history |
| `/api/locations` | EXPERIMENTAL | **CORE_RUNTIME** | Used in lorebook, entity detail, character profiles — core UX |
| `/api/characters` | EXPERIMENTAL | **CORE_RUNTIME** | _(promoted in previous commit)_ Character loading is MVP |
| `/api/chapters` | EXPERIMENTAL | **CORE_RUNTIME** | _(promoted in previous commit)_ Chapter management is MVP |
| `/api/evolution` | EXPERIMENTAL | **CORE_RUNTIME** | _(promoted in previous commit)_ Evolution tracking is MVP |

---

## Phase 2 — Continuity Lifecycle Diagnostics

### Full lifecycle trace

```
1. login                → Supabase JWT issued
2. terms check          → GET /api/user/terms-status
3. terms acceptance     → POST /api/user/accept-terms (requires CSRF)
4. thread create        → POST /api/conversation/threads
5. message send         → POST /api/chat/stream (SSE)
6. ingestion            → memoryExtractionWorker fires on entry insert
7. entity extraction    → POST /api/characters/extract-from-chat (2s debounce)
8. thread save          → PATCH /api/conversation/threads/:id (1.5s debounce)
9. memory feedback      → GET /api/chat/memory-feedback/:messageId (long-poll, 8s)
10. reload              → GET /api/conversation/threads
11. rehydration         → useChatThreads reconstructs from thread.metadata.messages
12. character display   → GET /api/characters/list
13. provenance          → GET /api/entities (EntityProvenancePanel)
```

### Known diagnostic gaps

| Gap | Impact | Fix |
|-----|--------|-----|
| Thread save timing | 1.5s debounce means fast tab-close loses last messages | `beforeunload` keepalive covers most cases |
| Entity extraction fires per-message | "Jerry", "Jerry Smith", "my brother Jerry" can create 3 records | DB unique constraint on (user_id, name) prevents exact-name dups; fuzzy matching not implemented |
| Importance score starts at 0 | Characters show as "minor" until async recalculation completes | Async recalc fires at creation; stale display resolved on next load |
| No cross-session thread sync indicator | User doesn't know if their threads are DB-backed or localStorage-only | `threadPersistenceTracker` exists but no visible status UI |
| Hydration race on reload | If `/api/conversation/threads` is slow, localStorage shows first then flickers to DB data | `threadsLoading` state manages this; `threadsReady` gates redirects |

---

## Phase 4 — Character Emergence Quality Audit

### Extraction pipeline

```
User message
  → useCharacterExtraction (2s debounce)
    → POST /api/characters/extract-from-chat
      → OpenAI: namedCharacters + unnamedCharacters
      → characterNicknameService: unnamed → auto-nickname
    → For each extracted char: POST /api/characters
      → DB unique constraint (user_id, name) → 409 = silently skipped
      → characterImportanceService.calculateImportance (async)
```

### Thresholds and heuristics

| Dimension | Current behavior | Gap |
|-----------|-----------------|-----|
| Name dedup | Exact string match via DB unique constraint | "Jerry" vs "Jerry Smith" = two characters |
| Alias matching | Aliases stored in array column, not queried before insert | Re-extraction creates duplicates under different names |
| Importance | Starts at `minor` / score `0`; async recalc after creation | Score may show stale until next load |
| Extraction threshold | No minimum confidence — all GPT-extracted names are sent for creation | Casual mentions ("I heard someone say...") create characters |
| Relationship inference | `associatedWith` field stores co-mentioned names, not resolved IDs | Jerry and James can be co-mentioned but links aren't traversed |
| Family recognition | Detected via `archetype` / `role` fields; no special treatment | "my brother" → unnamed character with role "family" |

### Recommended tuning (not yet implemented)

1. **Alias pre-check before insert**: query existing characters where `aliases @> [name]` to prevent near-dups
2. **Confidence gate**: only create characters with `relationshipDepth != 'mentioned_only'` OR `hasMet = true` on first extraction; let `mentioned_only` accumulate mentions before materializing
3. **Re-extraction merge**: on second mention of a name variant, PATCH the existing character instead of creating a new one
4. **Family/relationship graph**: promote `associatedWith` names to actual FK edges at creation time

---

## Phase 5 — Production Surface Classification

### LIVE (always on, stable)

| Feature | Routes |
|---------|--------|
| Auth / ToS | `/api/user`, `/api/security`, `/api/legal` |
| Chat | `/api/chat`, `/api/chat/stream` |
| Threads | `/api/conversation/threads/*` |
| Journal entries | `/api/entries` |
| Timeline | `/api/timeline/*`, `/api/chapters`, `/api/evolution` |
| Characters | `/api/characters/*` |
| Locations | `/api/locations` |
| Continuity | `/api/continuity`, `/api/contradiction-alerts` |
| Search | `/api/search/universal` |
| Subscription | `/api/subscription`, `/api/billing` |
| Provenance basics | `/api/entities`, `/api/narrative` |
| Onboarding | `/api/onboarding/*` |

### EXPERIMENTAL (gated, intentional 503)

| Feature | Routes |
|---------|--------|
| Advanced cognition analytics | `/api/insights`, `/api/predictions`, `/api/perception-reaction-engine` |
| Heavy graph systems | `/api/memory-graph`, `/api/graph`, `/api/knowledge-type` |
| Introspection/debug panels | `/api/diagnostics`, `/api/dev`, `/api/agents`, `/api/engine-runtime` |
| Memoir/biography generation | `/api/memoir`, `/api/biography` |
| Soul/essence/identity deep-dives | `/api/essence`, `/api/identity`, `/api/persona`, `/api/archetype` |
| Speculative ontology | `/api/paracosm`, `/api/inner-mythology`, `/api/alternate-self`, `/api/shadow` |
| RPG / gamification | `/api/rpg`, `/api/quests`, `/api/achievements` |
| External integrations | `/api/github`, `/api/integrations`, `/api/external-hub`, `/api/x` |
| Domain psychology | `/api/habits`, `/api/resilience`, `/api/influence`, `/api/growth`, `/api/values` |
| Multi-agent research | `/api/orchestrator`, `/api/autopilot` |

---

_Next action_: verify `/api/runtime/routes` on Railway to confirm new CORE_RUNTIME count after this deploy.
