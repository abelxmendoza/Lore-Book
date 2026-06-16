# Cross-User Isolation & Data Containment Audit

**Date:** 2026-06-16  
**Scope:** LoreBook server (`apps/server/src`) — code review only, no implementation  
**Method:** User boundary trace, service-role query audit, recovery/search/diagnostics review, penetration-style path analysis  
**Verdict:** Core chat, threads, search, recall, and export paths are **mostly well-scoped**. Several **IDOR and param-based read paths** allow authenticated User A to observe or mutate User B data. The dominant failure mode is **`supabaseAdmin` (service role) + ID-only queries without `user_id`**.

---

## Executive Summary

| Tier | Count | Production exposure |
|------|-------|---------------------|
| **P0** | 2 | Active in CORE_RUNTIME (always mounted) |
| **P1** | 5 | Active in CORE_RUNTIME or reachable with env flags |
| **P2** | 8 | Experimental-only, defense-in-depth, or low-impact |

**Architecture note:** All user-facing data access uses `supabaseAdmin`, which **bypasses Postgres RLS**. Tenant isolation is enforced entirely in application code. A response-level `userIsolationGuard` middleware scans JSON for foreign `user_id`/`userId` fields on **protected routes only** — it does not run on public-mounted routers and cannot detect leaks that omit tenant keys from responses (e.g. journal text, claim bodies, entity names).

---

## Phase 1 — User Boundary Trace

For each major data path: **Input → Queries → Tables → Output**, with tenant boundary assessment.

### Chat (`/api/chat`)

| Field | Detail |
|-------|--------|
| **Input** | `POST /stream`, `POST /message` — body: message, threadId, entityContext, etc. |
| **Auth** | `optionalAuth` — unauthenticated callers get guest UUID `00000000-0000-0000-0000-000000000000` |
| **userId source** | `req.user?.id` (never from body) |
| **Queries** | `omegaChatService.chatStream` → `ragBuilderService` → `assembleWorkingMemory`, `memoryRecallEngine`, `threadRecallService` — all pass authenticated `userId` |
| **Tables** | `chat_messages`, `conversation_sessions`, `journal_entries`, `characters`, `entity_facts`, etc. |
| **Output** | SSE stream / JSON reply scoped to caller |
| **Boundary** | ✅ Authenticated users scoped correctly. ⚠️ Guest mode uses shared sentinel UUID (by design, not cross-account leak). |
| **Mount** | Public router (`requiresAuth: false`) — **no `userIsolationGuard`** |

### Threads — conversation (`/api/conversation`)

| Field | Detail |
|-------|--------|
| **Input** | `GET/POST /threads/:id/*` — session UUID in path |
| **Auth** | `requireAuth` per handler |
| **userId source** | `req.user!.id` |
| **Queries** | `conversation_sessions` `.eq('id', id).eq('user_id', userId)`; `loadThreadMessages(userId, sessionId)` dual-filters `chat_messages` |
| **Tables** | `conversation_sessions`, `chat_messages`, `conversation_events`, `knowledge_units` |
| **Output** | Thread context, messages, intelligence metadata |
| **Boundary** | ✅ Session ownership enforced before reads/writes |
| **Files** | `routes/conversationCentered.ts`, `threadContentService.ts`, `threadExplorerService.ts` |

### Threads — life themes (`/api/threads`)

| Field | Detail |
|-------|--------|
| **Input** | CRUD on recurring threads, node memberships |
| **Auth** | `requireAuth` |
| **userId source** | `req.user!.id` → `threadService`, `threadMembershipService` |
| **Tables** | `threads`, `thread_memberships`, `thread_node_relations` |
| **Boundary** | ✅ All service methods take `userId` first argument |

### Working memory (`workingMemoryAssembler`)

| Field | Detail |
|-------|--------|
| **Input** | Chat RAG path; `POST /api/diagnostics/working-memory` (body: question, threadId) |
| **Auth** | Chat: authenticated user; diagnostics: `requireAuth` |
| **userId source** | Chat context / `req.user.id` — **not from body for tenancy** |
| **Queries** | All candidate loaders `.eq('user_id', userId)`; thread path adds `.eq('session_id', threadId)` |
| **Tables** | `characters`, `journal_entries`, `chat_messages`, `character_memories`, `projects`, etc. |
| **Boundary** | ✅ Correct. `threadId` in body is safe because queries require matching `user_id`. |
| **File** | `services/chat/workingMemoryAssembler.ts` |

### Thread summaries & intelligence

| Field | Detail |
|-------|--------|
| **Input** | Ingestion pipeline, `syncFromStoredMessages(userId, sessionId)` |
| **Services** | `threadSummaryService` → `threadIntelligenceService` |
| **Queries** | `readMeta` / writes: `.eq('id', sessionId).eq('user_id', userId)` |
| **Tables** | `conversation_sessions` (metadata.summaries, intelligence fields) |
| **Boundary** | ✅ Dual-filter on session reads and writes |
| **Files** | `threadIntelligenceService.ts`, `threadSummaryService.ts` |

### Relationships

| Field | Detail |
|-------|--------|
| **Input** | `GET /api/relationships`, character routes, recovery endpoints |
| **Auth** | `requireAuth` |
| **userId source** | `req.user!.id` |
| **Queries** | Primary reads/writes scoped; see Phase 3 for gaps in recovery updates |
| **Tables** | `character_relationships`, `omega_relationships` |
| **Boundary** | ✅ Route layer correct; ⚠️ service-layer update gaps (P2) |

### Events & continuity (`/api/continuity`)

| Field | Detail |
|-------|--------|
| **Input** | `GET /events`, `GET /events/:id`, revert |
| **Auth** | `requireAuth` |
| **userId source** | `req.user!.id` → `continuityService.*(eventId, userId)` |
| **Queries** | Events: `.eq('id', eventId).eq('user_id', userId)` |
| **Tables** | `continuity_events`, `omega_claims` (related — see P2) |
| **Boundary** | ✅ Event reads scoped; ⚠️ related claims fetched by ID only |

### Timeline & chronology

| Field | Detail |
|-------|--------|
| **Input** | `/api/timeline/*`, `/api/chronology/*` |
| **Auth** | `requireAuth` |
| **userId source** | `req.user!.id` throughout |
| **Queries** | `memoryService.searchEntries(userId)`, `timelinePageService.*(userId)`, chronology ownership checks on saga/arc nodes |
| **Tables** | `journal_entries`, `timeline_events`, `timeline_hierarchy`, `chronology_*` |
| **Boundary** | ✅ Consistently scoped |

### Entity recovery

| Field | Detail |
|-------|--------|
| **Input** | `POST /api/diagnostics/recover-events`, `recover-relationships`, live `graphRecoveryTrigger` |
| **Auth** | `requireAuth`; scripts use CLI `--user` |
| **userId source** | `req.user.id` on HTTP paths |
| **Services** | `eventRecoveryService`, `relationshipFoundationService`, `graphRecoveryTrigger` |
| **Boundary** | ✅ HTTP paths self-scoped; ⚠️ services trust caller `userId`; secondary query gaps (Phase 3) |

### Search (`/api/search/universal`)

| Field | Detail |
|-------|--------|
| **Input** | `POST /universal` — body: `{ query }` |
| **Auth** | `requireAuth` |
| **userId source** | `req.user!.id` |
| **Queries** | `universalSearchService.search(userId, query)` — all sub-searches filter by `user_id` |
| **Tables** | `characters`, `locations`, `timeline_hierarchy`, `timeline_events` |
| **Boundary** | ✅ |

### Memory recall (`/api/memory-recall`)

| Field | Detail |
|-------|--------|
| **Input** | `POST /query`, `/chat` |
| **Auth** | `requireAuth` |
| **userId source** | `req.user.id` (explicit in recall payload, not from body override) |
| **Queries** | RPC `match_journal_entries` with `user_uuid: userId` |
| **Boundary** | ✅ |

### Diagnostics (see Phase 5)

Mixed — several endpoints correctly use `req.user.id`; **three endpoints leak cross-tenant or global data**.

### Exports (`GET /api/user/export`)

| Field | Detail |
|-------|--------|
| **Input** | Optional `format` query param |
| **Auth** | `requireAuth` |
| **userId source** | `req.user!.id` |
| **Queries** | Each table: `.select('*').eq('user_id', userId)` |
| **Tables** | `journal_entries`, `timeline_events`, `tasks`, `characters`, `relationships`, etc. |
| **Boundary** | ✅ |

### Journal entries (`/api/entries`)

| Field | Detail |
|-------|--------|
| **Input** | CRUD by entry ID |
| **Auth** | `requireAuth` per handler (public mount, route-level auth) |
| **userId source** | `req.user!.id` → `memoryService.getEntry(userId, entryId)` |
| **Queries** | `.eq('user_id', userId).eq('id', entryId)` |
| **Boundary** | ✅ |

### Characters (`/api/characters`)

| Field | Detail |
|-------|--------|
| **Input** | `GET /:id`, merge, relationships |
| **Auth** | `requireAuth` |
| **userId source** | `req.user!.id` |
| **Queries** | Primary character: `.eq('id', id).eq('user_id', userId)` |
| **Boundary** | ✅ Primary reads; ⚠️ relationship enrichment queries sometimes omit `user_id` (P2) |

---

## Phase 2 — Service Role Audit

### Client inventory

| Location | Role |
|----------|------|
| `db/dbAdapter.ts` | Canonical `supabaseAdmin` export |
| `services/supabaseClient.ts` | Re-export used app-wide |
| `middleware/auth.ts` | Service role for JWT validation |
| `services/stripeService.ts`, `usageTracking.ts`, `photoService.ts` | Dedicated service clients |

**Scale:** ~300 files import `supabaseAdmin`. ~36 route files query directly. **RLS is never the enforcement layer for API paths.**

### Safe dominant pattern

```typescript
supabaseAdmin.from('table').select('*').eq('user_id', userId)
```

Used correctly in: `memoryService`, `threadIntelligenceService`, `workingMemoryAssembler`, `universalSearchService`, `memoryCoverageAudit`, `eventRecoveryService` (primary paths), `user.ts` export, most `conversationCentered` handlers.

### Unsafe patterns found

| Pattern | Example | Risk |
|---------|---------|------|
| ID-only read | `omegaMemoryService.rankClaims(entityId)` | Cross-user entity/claim read |
| ID-only read | `knowledgeGraphService.getPath(source, target)` | Cross-user graph disclosure |
| ID-only read | `timelineAssignmentService.getTimelineLinks(componentId)` | Cross-user memory components |
| Param `userId` ≠ caller | `GET /diagnostics/continuity-trace/:userId` | Full pipeline read for arbitrary user |
| Body `user.id` | `POST /emotions/analyze` | Read/write victim emotional data |
| Global aggregate | `GET /diagnostics/intelligence-health` | Platform-wide counts |
| Update by ID only | `recommendation/storageService`, `relationshipFoundationService.upsertRelationship` update | IDOR write if UUID known |
| Join without tenant | `relationshipFoundationService` journal fetch by ID; entity name enrichment by ID | Defense-in-depth gap |

### Routes accepting foreign tenant keys

| Route | Source | Verified against caller? |
|-------|--------|--------------------------|
| `GET /api/diagnostics/continuity-trace/:userId` | URL param | ❌ No |
| `POST /api/emotions/analyze` | Body `user.id` | ❌ No |
| `GET /admin/*` query `userId` | Query param | Admin-only (intentional) |

No other `req.body.userId` / `req.params.userId` patterns found in route handlers.

### Middleware gaps

| Middleware | Applies to | Limitation |
|------------|------------|------------|
| `authMiddleware` | `apiRouter` (protected mount) only | Public-mounted routes rely on per-handler `requireAuth` |
| `userIsolationGuard` | `apiRouter` only | Misses public mounts; only catches responses containing foreign `user_id`/`userId` keys — not content without tenant fields |

---

## Phase 3 — Recovery System Audit

### `eventRecoveryService`

| Check | Result |
|-------|--------|
| Reads | ✅ All corpus sources `.eq('user_id', userId)` |
| Writes | ✅ `resolved_events`, `character_timeline_events` include `user_id: userId` |
| HTTP caller | ✅ `POST /diagnostics/recover-events` uses `req.user.id` |
| Cross-user risk | Low — trusts caller `userId`; safe when called from authenticated routes only |

### `relationshipFoundationService`

| Check | Result |
|-------|--------|
| Primary extraction | ✅ Characters, memories, facts, chat co-mention all scoped |
| `extractRelationshipsFromMemories` | ⚠️ `journal_entries` fetched `.in('id', sharedEntryIds)` **without** `.eq('user_id', userId)` — could read foreign journal content if bad ID linkage exists |
| `repairMisclassifiedRelationships` | ⚠️ Character names fetched by ID without `user_id`; updates `.eq('id', rel.id)` only |
| `upsertRelationship` update | ⚠️ `.eq('id', existing[0].id)` without `user_id` on update |
| HTTP caller | ✅ Recovery routes use `req.user.id` |

### `memoryCoverageAudit`

| Check | Result |
|-------|--------|
| All table reads | ✅ `.eq('user_id', userId)` on 9+ tables |
| HTTP caller | ✅ `GET /memory-coverage`, life-reconstruction-score |

### `workingMemoryAssembler`

| Check | Result |
|-------|--------|
| All loaders | ✅ `.eq('user_id', userId)` |
| Diagnostics caller | ✅ `req.user.id` |

### `threadSummaryService` / `threadIntelligenceService`

| Check | Result |
|-------|--------|
| Session access | ✅ Dual filter `sessionId` + `user_id` |
| Cross-user risk | None identified |

---

## Phase 4 — Search Audit

| System | Route / Service | Scoped? | Notes |
|--------|-----------------|---------|-------|
| Universal search | `POST /api/search/universal` | ✅ | `req.user!.id` → all sub-queries filtered |
| Timeline search | via `TimelineEngine.getTimeline(userId)` | ✅ | |
| Entity search | `universalSearchService` character/location/org branches | ✅ | |
| Memory recall | `memoryRecallEngine.executeRecall` | ✅ | RPC passes `user_uuid` |
| Chat context / RAG | `ragBuilderService` → `assembleWorkingMemory` | ✅ | |
| Explicit recall | `explicitRecallService`, `recallQueryRouter`, `threadRecallService` | ✅ | |
| Semantic RPC | `match_journal_entries` | ✅* | *Tenant safety depends on RPC SQL definition; callers pass `userId` |

**No search route accepts `user_id` from request body for tenancy.**

---

## Phase 5 — Diagnostics Audit

| Endpoint | Auth | Tenant scope | Verdict |
|----------|------|--------------|---------|
| `GET /` | None | N/A (server config only) | ✅ Low risk |
| `GET /cors` | None | N/A | ✅ Low risk |
| `GET /graph-recovery` | `requireAuth` | `req.user.id` | ✅ |
| `POST /graph-recovery/run` | `requireAuth` | `req.user.id` | ✅ |
| `GET /thread-health` | `requireAuth` | `req.user.id` | ✅ |
| `POST /thread-health/repair` | `requireAuth` | `req.user.id` | ✅ |
| `POST /working-memory` | `requireAuth` | `req.user.id` | ✅ |
| `GET /memory-coverage` | `requireAuth` | `req.user.id` | ✅ |
| `POST /recover-events` | `requireAuth` | `req.user.id` | ✅ |
| `POST /recover-relationships` | `requireAuth` | `req.user.id` | ✅ |
| `POST /life-reconstruction-score` | `requireAuth` | `req.user.id` | ✅ |
| `GET /story-coverage` | `requireAuth` | `req.user.id` | ✅ |
| `POST /repair-entity-pollution` | `requireAuth` | `req.user.id` | ✅ |
| **`GET /continuity-trace/:userId`** | `requireAuth` | **Param userId — no caller check** | ❌ **P1** |
| **`GET /intelligence-health`** | `requireAuth` only | **Global table counts** | ❌ **P1** |
| **`GET /cognition-health`** | `requireAuth` only | **Global platform metrics** | ❌ **P1** |

**Admin tools** (`/api/admin/*`): `requireAuth` + `requireAdmin` — intentional cross-user access for operators. ✅

**Mount note:** Diagnostics router is **public-mounted** (`requiresAuth: false` in registry) but individual routes add `requireAuth`. Public endpoints skip `userIsolationGuard`.

---

## Phase 6 — Penetration Review (User A → User B)

Documented attack paths — **code-verified, not executed against production**.

### Path 1 — Omega Memory entity IDOR (P0)

```
User A (authenticated)
  → GET /api/omega-memory/entities/{User_B_entity_uuid}/ranked-claims
  → GET /api/omega-memory/entities/{User_B_entity_uuid}/summary
  → omegaMemoryService.rankClaims(id) / summarizeEntity(id)
  → supabaseAdmin: omega_claims, omega_entities, omega_relationships by entity_id ONLY
  → Returns User B claims, narrative, relationships
```

**Contrast:** `GET /entities/:id/claims` correctly calls `getClaimsForEntity(req.user!.id, id)` with `user_id` filter. Ranked-claims and summary endpoints do not.

**Exploitability:** High — UUID v4 enumeration impractical, but UUIDs leak via shared links, logs, client caches, browser history.  
**Impact:** High — full entity memory graph for victim.  
**Likelihood:** Medium — requires knowing victim entity UUID.

### Path 2 — Emotions analyze body override (P0 if experimental enabled)

```
User A (authenticated)
  → POST /api/emotions/analyze
  → Body: { entry: {...}, user: { id: "User_B_uuid" } }
  → emotionalIntelligenceEngine(entry, user.id from body)
  → getAllEvents(User_B) + writes emotional_events/patterns under User_B
```

**Production note:** Route is `EXPERIMENTAL` — not mounted unless `ENABLE_EXPERIMENTAL_RUNTIME=true`. Active in dev/staging with experimental runtime.

### Path 3 — Continuity trace param injection (P1)

```
User A (authenticated)
  → GET /api/diagnostics/continuity-trace/{User_B_uuid}
  → Returns pipeline_runs, continuity verification, entity/event counts for User B
```

**Production gate:** Blocked unless `ENABLE_EXPERIMENTAL=true` (separate flag from experimental runtime). If flag set in prod → exploitable.

**Response includes `userId` field matching param** — would be caught by `userIsolationGuard` on protected routes, but diagnostics is public-mounted so guard does not apply.

### Path 4 — Intelligence / cognition health (P1)

```
User A (authenticated)
  → GET /api/diagnostics/intelligence-health
  → GET /api/diagnostics/cognition-health
  → Platform-wide message counts, pipeline funnel, ingestion metrics
```

No per-user PII, but violates tenant boundary for operational intelligence.

### Path 5 — Knowledge graph path (P1 if experimental enabled)

```
User A → GET /api/graph/path?source={B_component}&target={B_component}
  → knowledgeGraphService.getPath — no ownership check
  → Returns cross-user graph path
```

Route disabled unless `ENABLE_EXPERIMENTAL_RUNTIME=true`. Neighbors endpoint **does** verify ownership; path endpoint does not.

### Path 6 — Memory engine timeline (P1 if experimental enabled)

```
User A → GET /api/memory-engine/component/{B_componentId}/timeline
User A → GET /api/memory-engine/timeline/arc/{B_arcId}/components
  → timelineAssignmentService — no userId parameter
```

### Path 7 — Graph edges by componentId (P1 if experimental enabled)

```
User A → GET /api/graph/edges?componentId={B_componentId}
  → Returns edges without ownership pre-check (unlike neighbors endpoint)
```

### Path 8 — Relationship recovery write (P2)

```
User A → POST /api/diagnostics/recover-relationships (scoped to A)
  → repairMisclassifiedRelationships may update relationship by id without user_id on UPDATE
```

Only exploitable if User A somehow triggers update on User B's relationship UUID through corrupted in-memory rel set — low practical risk; defense-in-depth gap.

### Path 9 — Continuity explain related claims (P2)

```
User A → GET /api/continuity/events/{A_event_id}
  → explainEvent loads related omega_claims by ID without user_id filter
  → Could include claim text from another user if event.related_claim_ids reference foreign IDs
```

Event itself is scoped; claim join is not.

### Path 10 — Entity name enrichment (P2)

```
User A → GET /api/conversation/entities/{entityId}/relationships
  → Relationship rows scoped to A, but name lookups on characters/omega_entities by ID only
  → Could resolve names from User B entities if IDs appear in A's relationship graph
```

---

## Phase 7 — Findings (Ranked)

### P0 — Fix before treating isolation as proven

| ID | Finding | Location | Exploitability | Impact | Likelihood |
|----|---------|----------|----------------|--------|------------|
| **ISO-P0-01** | Entity IDOR: ranked-claims and summary return any user's omega entity data by UUID | `routes/omegaMemory.ts:84-109`, `omegaMemoryService.ts:1284-1383` | **High** — single GET with known UUID | **High** — claims, relationships, narrative | **Medium** |
| **ISO-P0-02** | Emotions analyze accepts `user.id` from body; reads/writes victim emotional data | `routes/emotionalIntelligence.ts:14-22`, `emotionalEngine.ts` | **High** — trivial POST body swap | **High** — read events + write patterns | **Low in prod** (experimental route gated); **High in dev** |

**ISO-P0-01 remediation:** Pass `req.user!.id` into `rankClaims` / `summarizeEntity`; add `.eq('user_id', userId)` on all queries (mirror `getClaimsForEntity`).

**ISO-P0-02 remediation:** Use `req.user!.id` only; reject body `user.id`; add explicit `requireAuth`.

---

### P1 — Significant boundary violations

| ID | Finding | Location | Exploitability | Impact | Likelihood |
|----|---------|----------|----------------|--------|------------|
| **ISO-P1-01** | Continuity trace accepts arbitrary `:userId` param | `routes/diagnostics.ts:171-266` | **High** when endpoint enabled | **High** — pipeline runs, continuity gaps, production counts | **Medium** if `ENABLE_EXPERIMENTAL=true` |
| **ISO-P1-02** | Intelligence-health exposes platform-wide aggregates to any authed user | `routes/diagnostics.ts:278-449` | **High** — no special access | **Medium** — operational intel, not direct PII | **High** — CORE_RUNTIME, always mounted |
| **ISO-P1-03** | Cognition-health exposes global metrics; comment says admin-only, no role check | `routes/diagnostics.ts:88-96` | **High** | **Medium** | **High** |
| **ISO-P1-04** | Graph path endpoint — no component ownership check | `routes/knowledgeGraph.ts:62-86` | **Medium** — needs UUIDs | **Medium** — graph structure | **Low in prod** (experimental gated) |
| **ISO-P1-05** | Graph edges with `componentId` skips ownership check | `routes/knowledgeGraph.ts:102-127` | **Medium** | **Medium** | **Low in prod** (experimental gated) |
| **ISO-P1-06** | Memory-engine timeline routes — no tenant check on component/level IDs | `routes/memoryEngine.ts:280-322`, `timelineAssignmentService.ts:197-261` | **Medium** | **Medium** — memory components | **Low in prod** (experimental gated) |

**ISO-P1-01 remediation:** Use `req.user!.id` only, or `requireAdmin` + audit log for cross-user inspection.

**ISO-P1-02/03 remediation:** Add `requireAdmin` or `canAccessAdminConsole`; scope metrics to admin console only.

**ISO-P1-04/05/06 remediation:** Add ownership chain check (component → journal_entry → user_id) before service calls; pass `userId` into service methods.

---

### P2 — Defense-in-depth & architectural gaps

| ID | Finding | Location | Exploitability | Impact | Likelihood |
|----|---------|----------|----------------|--------|------------|
| **ISO-P2-01** | `userIsolationGuard` not applied to public-mounted routers | `index.ts`, `routeRegistry.ts` | N/A | **Medium** — misses leak detection on chat, diagnostics, entries | Ongoing |
| **ISO-P2-02** | `userIsolationGuard` only detects `user_id`/`userId` in JSON — not content without tenant keys | `middleware/userIsolationGuard.ts` | N/A | **Medium** | Ongoing |
| **ISO-P2-03** | Service role bypasses RLS app-wide; no wrapper requiring tenant key | Architecture | N/A | **High** if any query misses filter | Ongoing |
| **ISO-P2-04** | `relationshipFoundationService` journal fetch without `user_id` | `relationshipFoundationService.ts:330-334` | **Low** | **Medium** — journal content | **Low** |
| **ISO-P2-05** | Relationship UPDATE by `id` only (no `user_id`) | `relationshipFoundationService.ts:639-651`, `upsertRelationship` | **Low** | **Medium** — relationship mutation | **Low** |
| **ISO-P2-06** | `continuityService.explainEvent` — related claims without `user_id` | `continuityService.ts:350-354` | **Low** | **Low-Medium** | **Low** |
| **ISO-P2-07** | Entity name enrichment by ID without `user_id` | `conversationCentered.ts:1803-1831` | **Low** | **Low** — names only | **Low** |
| **ISO-P2-08** | `recommendation/storageService` update by id only | `recommendation/storageService.ts:103-106` | **Low** — route verifies first | **Low** | **Low** |
| **ISO-P2-09** | `userFileRegistry` mutations by `fileId` only | `userFileRegistry.ts:88-128` | **Low** | **Low** — file metadata | **Low** |
| **ISO-P2-10** | Memory-engine entry components — fetch before ownership verify | `memoryEngine.ts:241-264` | **Low** — 404 gated | **Low** — timing side channel | **Low** |
| **ISO-P2-11** | Character detail — relationship query without `user_id` on join | `characters.ts:1217-1220` | **Low** | **Low** | **Low** |

---

## Verified Safe — Core User Data Paths

These paths were traced and **correctly enforce `req.user.id` → `.eq('user_id', ...)`**:

- Chat RAG / working memory assembly
- Conversation threads (CRUD, context, messages)
- Thread intelligence & summaries
- Universal search & memory recall
- Timeline & chronology APIs
- Continuity event list/detail (primary event scope)
- User export & account deletion
- Journal entry CRUD
- Character primary reads
- Event recovery & memory coverage diagnostics (self-scoped endpoints)
- Admin console (intentionally cross-user, admin-gated)

---

## Architectural Recommendations (Post-Audit)

1. **Fix ISO-P0-01 immediately** — it is CORE_RUNTIME and production-active.
2. **Unify diagnostics auth model** — admin-only or self-only; never param-based `userId` without role check.
3. **Extend `userIsolationGuard`** to all `/api/*` responses or move all routes behind `apiRouter`.
4. **Service-layer contract** — tenant-scoped methods must accept `userId` as first parameter; ID-only reads forbidden on user tables.
5. **Integration tests** — matrix: User A token + User B resource ID → expect 404/403 across omega-memory, graph, diagnostics, continuity.
6. **Consider user-scoped Supabase client** (JWT + RLS) for read paths as belt-and-suspenders alongside service role for jobs.

---

## Success Criteria Assessment

| Criterion | Status |
|-----------|--------|
| Memories cannot cross users | ⚠️ **Fail** — omega entity IDOR; emotions path in experimental |
| Threads cannot cross users | ✅ Pass |
| Relationships cannot cross users | ✅ Pass (routes); ⚠️ service update gaps |
| Events / timeline cannot cross users | ✅ Pass (primary paths) |
| Entities cannot cross users | ⚠️ **Fail** — omega ranked-claims/summary IDOR |
| Summaries / continuity cannot cross users | ✅ Pass (threads); ⚠️ continuity-trace param leak when enabled |
| Search / recall cannot cross users | ✅ Pass |
| Verified through code | ✅ This document |

**Overall:** Isolation is **not fully proven**. Two P0 issues exist in production CORE_RUNTIME (omega memory IDOR; emotions if experimental runtime enabled). Diagnostics endpoints leak cross-tenant operational data to any authenticated user.

---

## Appendix — Route Mount & Middleware Matrix

| Router | Registry `requiresAuth` | Middleware stack | `userIsolationGuard` |
|--------|-------------------------|------------------|----------------------|
| `/api/chat` | false (public) | Per-route `optionalAuth` | ❌ |
| `/api/diagnostics` | false (public) | Per-route `requireAuth` on sensitive endpoints | ❌ |
| `/api/entries` | false (public) | Per-route `requireAuth` | ❌ |
| `/api/omega-memory` | true (default) | Full `apiRouter` stack | ✅ |
| `/api/conversation` | true | Full stack | ✅ |
| `/api/search` | true | Full stack | ✅ |
| `/api/admin` | true + `requireAdmin` | Full stack | ✅ |

---

*Audit performed by static code analysis. No production penetration testing was executed. Re-verify after remediation with automated cross-tenant integration tests.*
