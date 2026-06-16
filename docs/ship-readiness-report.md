# Ship Readiness Report

**Date:** 2026-06-15  
**Question:** Can users trust LoreBook today?

## Answer: **YES** (with known non-blocking caveats)

Authenticated users on the **streaming chat path** can send messages, receive responses, and reload threads without losing conversation history. Thread sidebar order now reflects **message activity**, not **thread open**. Entity creation no longer defaults unknown names to Person/Character.

---

## Blockers (none for primary path)

No P0 or unresolved P1 issues block the main flow:

- Chat stream → DB persist → thread hydrate → refresh

---

## Remaining non-blocking issues

| Area | Issue | Risk |
|------|-------|------|
| Chat | 1.5s debounce before metadata PATCH | Low — mitigated by `flushSave` on navigation |
| Chat | Non-stream `/api/chat` fallback lacks user-message persist | Low — web uses `/api/chat/stream` |
| Timeline | Multiple chronology stacks still coexist | Data quality / UX confusion, not message loss |
| Build | Pre-existing TypeScript errors in legacy services | CI may fail strict typecheck; vitest stability paths pass |
| Ops | Not deployed from this sprint session | User must deploy after push |

---

## What was fixed this sprint

### Thread durability
- `ensure-visible` no longer bumps `updated_at`
- PATCH accepts `touchActivity` — ordering only on real activity
- Client: `useConversationRuntime` sync only touches activity on user send / stream complete
- Client: hydrate no longer moves thread to top of list

### Chat persistence
- Non-stream assistant save bumps `conversation_sessions.updated_at`
- Stream path already persisted assistant on complete/partial/failure

### Entity integrity
- Classifier: products, apps, places, households, kinship terms
- Unknown bare nouns stay UNKNOWN
- Compiler symbol fallback: CONCEPT not PERSON

### Timeline
- Arc inference: primary-track scoring instead of multi-signal → mixed
- Day occasion default track: `inner` not `mixed`

### Family
- Structural importance for family kinship (tests)
- Household naming: Ralph Household / Ralph Family pattern (tests)

---

## Files changed (stability)

**Server**
- `apps/server/src/routes/conversationCentered.ts`
- `apps/server/src/routes/chat.ts`
- `apps/server/src/services/omegaChatService.ts`
- `apps/server/src/services/entities/entityClassifier.ts`
- `apps/server/src/services/compiler/symbolResolver.ts`
- `apps/server/src/services/continuityRuntime/arcs/arcInferenceService.ts`
- `apps/server/src/services/continuityRuntime/arcs/dayOccasionService.ts`
- `apps/server/tests/services/entityClassifier.test.ts`

**Web**
- `apps/web/src/features/chat/hooks/useChatThreads.ts`
- `apps/web/src/features/chat/hooks/useConversationRuntime.ts`

**Docs**
- `docs/production-health-report.md`
- `docs/ship-readiness-report.md`

---

## Tests run

```
apps/server: threadDurability, entityClassifier, entityMentionClassifier,
             characterImportance, householdNaming, workingMemoryAssembler
             → 6 files, 59+ tests passed

apps/web: EventsBook, useChatThreads
          → 2 files, 19 tests passed
```

---

## Deployment status

- **Commit/push:** Pending this session completion to `main`
- **Production deploy:** Not executed from agent environment (Vercel CLI not installed locally)
- **Action:** After push, trigger your usual deploy pipeline and smoke-test one send → refresh → reopen thread

---

## Smoke test checklist (5 min after deploy)

1. Send a message in an existing thread → appears immediately
2. Hard refresh → same messages visible
3. Open a different thread → previous thread does **not** jump to top
4. Send in that thread → it **does** jump to top
5. Mention "Amazon Ring" in chat → ingestion should not create a Character card (Product/platform)
