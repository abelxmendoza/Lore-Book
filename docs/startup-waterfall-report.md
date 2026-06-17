# Startup Waterfall Audit

**Date:** 2026-06-16  
**Page:** `/chat/:threadId` (chat-first interface)  
**Environment:** Local dev (`localhost:5173` → Vite proxy → API)

## Observed Problem (Before)

Browser console showed duplicate parallel requests on chat load:

```
/api/timeline          × 3–4
/api/timeline/tags     × 3–4
/api/chapters          × 3–4
/api/entries           × 3–4
/api/evolution         × 1–2  (~7500ms)
```

Most endpoints completed in 30–100ms individually; evolution dominated total blocking time.

## Root Cause

`useLoreKeeper()` was invoked independently in many components. Each hook instance ran the same `useEffect` bootstrap on mount:

```tsx
// Previously in useLoreKeeper.ts — ran once PER caller
useEffect(() => {
  void refreshEntries();
  void refreshTimeline();
  void refreshChapters();
  void refreshEvolution();  // removed
}, [...]);
```

### Call sites (each triggered bootstrap independently)

| Component | Path |
|-----------|------|
| `App.tsx` | `apps/web/src/pages/App.tsx` |
| `ChatFirstInterface` | `apps/web/src/features/chat/components/ChatFirstInterface.tsx` |
| `useChat` | `apps/web/src/features/chat/hooks/useChat.ts` |
| `CharacterBook` | `apps/web/src/components/characters/CharacterBook.tsx` |
| `ChapterCreationChatbot` | `apps/web/src/components/chapters/ChapterCreationChatbot.tsx` |
| `MemoirEditor` / `MemoirView` | `apps/web/src/components/memoir/` |
| Others | EventsBook, MemoryExplorer, PopulateDummyData, etc. |

React Strict Mode double-mounting in dev amplified duplicates further.

### Why dedupe alone wasn't enough

`fetchJson` (`apps/web/src/lib/api.ts`) already provides:

- GET response cache (`apiCache`)
- In-flight request deduplication

Duplicates still appeared because:

1. Multiple hook instances each initiated fetches before cache warmed
2. Strict Mode remounts reset timing windows
3. Some callers invoked `refreshTimeline()` etc. manually after mutations, overlapping with bootstrap

## Fix: Single Provider Bootstrap

```
main.tsx
  └─ LoreKeeperProvider          ← single bootstrap owner
       └─ useLoreKeeper()         ← read-only context consumer (15+ call sites)
```

Changes:

1. **`LoreKeeperContext.tsx`** — all lore state + bootstrap effects live here
2. **`useLoreKeeper.ts`** — thin re-export; throws if used outside provider
3. **`main.tsx`** — mounts `LoreKeeperProvider` once inside `MockDataProvider`
4. **Evolution removed from bootstrap** — lazy via `refreshEvolution()`

## Expected Waterfall (After)

On authenticated chat page load:

| Request | Count | Trigger | Cached? |
|---------|-------|---------|---------|
| `/api/conversation/threads/.../ensure-visible` | 1 | Thread routing | — |
| `/api/conversation/threads/.../messages` | 1 | Active thread | — |
| `/api/conversation/threads/facets` | 1 | Sidebar facets | GET cache |
| `/api/entries` | **1** | LoreKeeperProvider bootstrap | GET cache |
| `/api/timeline` | **1** | LoreKeeperProvider bootstrap | GET cache |
| `/api/timeline/tags` | **1** | LoreKeeperProvider bootstrap | GET cache |
| `/api/chapters` | **1** | LoreKeeperProvider bootstrap | GET cache |
| `/api/evolution` | **0** | Not on chat load | — |
| `/api/knowledge/claims` | 1 | Knowledge panel | GET cache |
| `/api/entities/certified-index` | 1 | Entity index | GET cache |
| `/api/counts` | 1 | Badge counts | GET cache |
| `/api/user/authority` | 1 | Auth gate | GET cache hit |

### Requests removed per chat load

| Endpoint | Before | After | Saved |
|----------|--------|-------|-------|
| `/api/entries` | 3–4 | 1 | 2–3 |
| `/api/timeline` | 3–4 | 1 | 2–3 |
| `/api/timeline/tags` | 3–4 | 1 | 2–3 |
| `/api/chapters` | 3–4 | 1 | 2–3 |
| `/api/evolution` | 1–2 | 0 | 1–2 |
| **Total duplicate requests** | **~12–16** | **~4** | **~8–12** |

### Latency removed from critical path

- **~7500ms** — evolution no longer on chat load
- **~200–400ms** — eliminated redundant timeline/chapters/entries round-trips

## Component → Request Map (After)

| Request | Owner |
|---------|-------|
| entries, timeline, tags, chapters | `LoreKeeperProvider` mount effect |
| evolution | Explicit `refreshEvolution()` when evolution UI opens |
| thread messages | `ChatThreadProvider` / `useChatThreads` |
| knowledge claims | Knowledge/claims panel |
| certified-index | Entity resolution layer |

Manual refreshes after mutations (e.g. `useChat` calling `refreshEntries()` post-ingestion) remain intentional and are not duplicates of bootstrap.

## Verification Checklist

- [ ] Open `/chat/:id` — Network tab shows **one** each of entries/timeline/tags/chapters
- [ ] Network tab shows **zero** `/api/evolution` on load
- [ ] `[Error Tracking] Slow API call: /api/evolution` no longer appears during auth/bootstrap
- [ ] Evolution UI still works when user navigates to evolution features (`refreshEvolution()`)

## Remaining Startup Optimizations (Not Implemented)

| Issue | Priority | Notes |
|-------|----------|-------|
| Parallel bootstrap bundle (entries + timeline + chapters in one API) | P3 | Would save 2 RTTs; requires new aggregate endpoint |
| Extend `apiCache` TTL for stable lore GETs | P3 | Low risk; entries change more often than chapters |
| Defer non-critical fetches (certified-index, claims) until panel open | P2 | Reduces initial parallel fan-out |
