# Production Health Report

**Date:** 2026-06-15  
**Scope:** Stability ship-blocker sprint (no new architecture)  
**Method:** Code trace, targeted test pass, classification by user impact

---

## Executive summary

LoreBook’s primary chat path (streaming via `/api/chat/stream`) persists user and assistant turns to `chat_messages` and merges them on thread load. Thread sidebar ordering was incorrectly bumping on **open** rather than **send** — fixed on server and client. Entity classification defaults to **UNKNOWN**, not Person, for bare proper nouns. Swimlane “Mixed” flooding was reduced via track-scoring changes in arc inference.

**Overall:** No P0 blockers found in code review for the main authenticated chat flow. Residual P1 items are debounce-window durability and legacy non-stream chat path.

---

## P0 — App broken

| Issue | Status | Notes |
|-------|--------|-------|
| Server fails to start | **Not observed** | `npm test` passes; pre-existing `tsc` errors in unrelated legacy services |
| Streaming chat unreachable | **Not observed** | Web uses `/api/chat/stream`; dev fallback exists when backend down |
| Auth wall blocks all chat | **By design** | Unauthenticated users see sign-in prompt, not data loss |

**P0 count: 0 open**

---

## P1 — User trust issues

| Issue | Severity | Status | Fix |
|-------|----------|--------|-----|
| Thread jumps to top when **opened** | P1 | **Fixed** | Removed `touchThreadActivity` from `ensure-visible`; client no longer reorders on hydrate |
| Every streaming chunk bumped `updated_at` | P1 | **Fixed** | `touchActivity` flag — only user send + stream complete |
| Assistant response lost mid-stream | P1 | **Mitigated** | `chat.ts` persists partial/complete/failed assistant to `chat_messages` |
| Metadata debounce (1.5s) before PATCH | P1 | **Open** | `flushSave` on thread switch; risk if tab killed within debounce window |
| Non-stream `/api/chat` user message not persisted before LLM | P1 | **Open** | Fallback path only; web uses stream |
| Duplicate thread rows (orphan sessions) | P1 | **Mitigated** | `recoverOrphanSession`, dedupe service, `ensure-visible` |

---

## P2 — Data quality

| Issue | Status | Notes |
|-------|--------|-------|
| Bare proper nouns → Character cards | **Fixed** | `entityClassifier` → UNKNOWN; `symbolResolver` fallback → CONCEPT |
| Swimlanes all “Mixed” | **Improved** | `arcInferenceService` primary-track scoring; `dayOccasionService` default `inner` |
| High Noon / Amazon Ring as people | **Fixed** | Covered by entity classifier tests |
| Household naming “Leslie and Tio Family” | **Fixed** | `householdNaming` + tests (Ralph Household / Ralph Family) |
| Compiler symbol default PERSON | **Fixed** | Fallback `CONCEPT` in `symbolResolver` |

---

## P3 — Cosmetic

| Issue | Notes |
|-------|-------|
| Generic thread titles until title service runs | Expected; provisional title from first user message |
| Return greeting latency | Fire-and-forget; failures silent |
| Pre-existing TypeScript errors in legacy timeline/toxicity modules | Do not block runtime vitest paths |

---

## Subsystem checks

### Server startup
- Vitest suite for stability modules: **pass**
- Full `tsc --noEmit`: **fail** (legacy modules; not introduced this sprint)

### Background jobs
- Ingestion queue: enqueued after user message save (NORMAL) and assistant save (LOW)
- Not load-tested this sprint

### OpenAI calls
- Stream path: semaphore + rate-limit handling in `openai.ts`
- Quota errors surfaced to user in web copy

### Database writes
- User message → `chat_messages` + `conversation_sessions.updated_at` bump (stream + omegaChatService)
- Assistant → `chat_messages` + session bump (stream complete + non-stream assistant fix)
- Thread metadata → debounced PATCH to `conversation_sessions.metadata.messages`

### Thread persistence
- Load: `mergeMessageSources` (metadata + `conversation_messages` + `chat_messages`)
- Recovery: `threadRecoveryService`, `threadDurabilityChecks`

### Memory extraction
- Post-message ingestion queue; entity-scoped sessions skip duplicate enqueue
- Not re-validated end-to-end against live Supabase this sprint

---

## Tests run (Phase 7 subset)

| Suite | Result |
|-------|--------|
| `threadDurability` | pass |
| `entityClassifier` | pass |
| `entityMentionClassifier` | pass |
| `characterImportance` | pass |
| `householdNaming` | pass |
| `workingMemoryAssembler` | pass |
| Web `EventsBook` | pass |
| Web `useChatThreads` | pass |

**Total:** 78 tests passed, 0 failed, 0 skipped (stability subset)

---

## Recommended follow-up (non-blocking)

1. Persist user message in non-stream `omegaChatService.chat()` before LLM call
2. Reduce metadata debounce or flush on `beforeunload`
3. Guard PATCH when `updatePayload` is empty (touchActivity-only edge case)
