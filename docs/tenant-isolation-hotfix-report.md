# Tenant Isolation Hotfix Report

**Date:** 2026-06-16  
**Sprint:** Tenant Isolation Hotfix (security-only, no new features)

---

## Summary

P0 cross-user IDOR paths are patched. Diagnostics and knowledge-graph routes are hardened. Regression and cross-tenant tests added.

| Priority | Finding | Status |
|----------|---------|--------|
| P0-1 | Omega Memory entity IDOR (`ranked-claims`, `summary`) | **Fixed** |
| P0-2 | Emotions analyze body `user.id` override | **Fixed** |
| P1 | Diagnostics cross-tenant / global leaks | **Fixed** |
| P1 | Knowledge graph / memory-engine ID-only reads | **Fixed** |
| P2 | Cross-tenant test suite | **Added** |

---

## Files Changed

### New

| File | Purpose |
|------|---------|
| `apps/server/src/lib/tenantOwnership.ts` | Shared ownership assertions + `TenantAccessError` |
| `apps/server/src/middleware/tenantGuard.ts` | `requireSelfUserIdParam` middleware |
| `apps/server/tests/tenantIsolation.test.ts` | Diagnostics cross-tenant tests |
| `apps/server/tests/lib/tenantOwnership.test.ts` | Ownership helper unit tests |
| `apps/server/tests/middleware/tenantGuard.test.ts` | Self-scoped param middleware tests |

### Modified

| File | Change |
|------|--------|
| `apps/server/src/services/omegaMemoryService.ts` | `rankClaims(userId, entityId)` + `summarizeEntity(userId, entityId)` with ownership checks |
| `apps/server/src/routes/omegaMemory.ts` | Pass `req.user!.id`; map `TenantAccessError` → 404 |
| `apps/server/src/routes/emotionalIntelligence.ts` | `requireAuth`; use `req.user!.id` only; remove body user |
| `apps/server/src/routes/diagnostics.ts` | Admin gate on intelligence/cognition health; dev + self on continuity-trace |
| `apps/server/src/routes/knowledgeGraph.ts` | Component ownership on `/path`, `/edges`, `/build` |
| `apps/server/src/routes/memoryEngine.ts` | Ownership checks on timeline/component routes |
| `apps/server/src/services/timelineAssignmentService.ts` | `userId` param on timeline helpers |
| `apps/server/src/services/insightReflectionService.ts` | Updated `rankClaims` call signature |
| `apps/server/src/services/conversationalOrchestrationService.ts` | Updated `rankClaims` call signature |
| `apps/server/tests/routes/omegaMemory.test.ts` | Cross-tenant 404 regression tests |
| `apps/server/tests/routes/emotionalIntelligence.test.ts` | Body override rejection test |
| `apps/server/tests/routes/knowledgeGraph.test.ts` | Cross-tenant path 404 test |
| `apps/server/tests/services/omegaMemoryService.test.ts` | Updated for `userId` + ownership mock |
| `apps/server/tests/services/omegaMemoryService.enhanced.test.ts` | Updated for `userId` + ownership mock |

---

## Routes Patched

| Route | Before | After |
|-------|--------|-------|
| `GET /api/omega-memory/entities/:id/ranked-claims` | ID-only query | Requires entity `user_id === req.user.id` → 404 if foreign |
| `GET /api/omega-memory/entities/:id/summary` | ID-only query | Same |
| `POST /api/emotions/analyze` | Body `user.id` controlled tenant | `req.user.id` only + `requireAuth` |
| `GET /api/diagnostics/continuity-trace/:userId` | Any authed user, any `:userId` | `requireDevAccess` + `requireSelfUserIdParam` → 403 if param ≠ caller |
| `GET /api/diagnostics/intelligence-health` | Any authed user, global counts | `requireAdmin` |
| `GET /api/diagnostics/cognition-health` | Any authed user, global metrics | `requireAdmin` |
| `GET /api/graph/path` | No ownership check | `assertMemoryComponentOwned` on source + target |
| `GET /api/graph/edges?componentId=` | No ownership check | `assertMemoryComponentOwned` before return |
| `GET /api/memory-engine/component/:id/timeline` | ID-only | `getTimelineLinks(userId, componentId)` with ownership |
| `GET /api/memory-engine/timeline/:level/:id/components` | ID-only | Filters components to caller's journal entries |
| `GET /api/memory-engine/entry/:id/components` | Fetch-then-verify | Verify ownership before fetch |

---

## Tests Added

| Test file | Coverage |
|-----------|----------|
| `tests/tenantIsolation.test.ts` | User A → User B diagnostics (403) |
| `tests/lib/tenantOwnership.test.ts` | Entity/component/entry ownership helpers |
| `tests/middleware/tenantGuard.test.ts` | Param userId must match caller |
| `tests/routes/omegaMemory.test.ts` | Foreign entity → 404 on ranked-claims/summary |
| `tests/routes/emotionalIntelligence.test.ts` | Body user id ignored; uses auth user |
| `tests/routes/knowledgeGraph.test.ts` | Foreign component → 404 on `/path` |

**Run:** `npm test -- tests/tenantIsolation.test.ts tests/lib/tenantOwnership.test.ts tests/middleware/tenantGuard.test.ts tests/routes/omegaMemory.test.ts tests/routes/emotionalIntelligence.test.ts tests/routes/knowledgeGraph.test.ts`

---

## Access Control Decisions

| Endpoint | Classification | Middleware |
|----------|----------------|------------|
| `continuity-trace/:userId` | Developer-only, self-scoped | `requireAuth` → `requireSelfUserIdParam` → `requireDevAccess` |
| `intelligence-health` | Admin-only (platform aggregates) | `requireAuth` → `requireAdmin` |
| `cognition-health` | Admin-only (platform metrics) | `requireAuth` → `requireAdmin` |
| Self-scoped diagnostics (memory-coverage, recover-*, etc.) | Self-only | Already used `req.user.id` — unchanged |

---

## Remaining Risks (P2 — not in this sprint)

| ID | Risk | Notes |
|----|------|-------|
| R-01 | `userIsolationGuard` not on public-mounted routers | Chat, diagnostics, entries mount outside `apiRouter` |
| R-02 | Service-role bypasses RLS app-wide | Requires systemic wrapper or user-scoped client |
| R-03 | `relationshipFoundationService` journal fetch / UPDATE by id only | Defense-in-depth gaps from audit |
| R-04 | `continuityService.explainEvent` related claims without `user_id` | Low likelihood cross-tenant claim text |
| R-05 | Entity name enrichment by ID in `conversationCentered.ts` | Low impact (names only) |
| R-06 | RPC tenant safety (`match_journal_entries`, etc.) | Depends on SQL definitions; callers pass `userId` |

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| No user can read another user's omega entities by UUID | ✅ |
| No user can override tenant via emotions body | ✅ |
| No standard user can read another user's diagnostics pipeline | ✅ |
| No standard user can read platform-wide intelligence metrics | ✅ |
| Graph/memory-engine ID paths verify ownership | ✅ |
| Regression tests in place | ✅ |

---

*Follow-up: deploy to Railway + verify production with two test accounts holding known entity UUIDs.*
