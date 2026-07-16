# Chat durability + lexical/composer root-cause map

Date: 2026-07-16  
Observed via production mobile screenshots (failed send, junk chips, oversized composer).

## Send path (current)

```
Composer submit
  → useChat.sendMessage
    → preserveStoryAttempt (localStorage vault)     [durable on device]
    → optimistic user + assistant bubbles (pending)
    → streamChat /api/chat/stream
        → SSE persistence events (user/assistant saved|error)
        → generation chunks / done / error(+durability)
    → threadPersistenceTracker (thread-level chip)
    → on failure: restore composer from vault OR mark user saved
```

Key files:

| Stage | Path |
| --- | --- |
| Submit | `apps/web/src/features/chat/hooks/useChat.ts` |
| Device vault | `apps/web/src/features/chat/services/storySafetyVault.ts` |
| Thread sync chip | `apps/web/src/features/chat/services/threadPersistenceTracker.ts` + `ThreadSaveChip.tsx` |
| Bubble status | `Message.persistStatus`: only `pending \| saved \| failed` in `ChatMessage.tsx` |
| Summary banner | `ThreadSummaryBar.tsx` |
| Lexical preview | `apps/server/.../lexicalPreviewService.ts` → composer chips |
| Chip strip | `ComposerEntityChips.tsx`, `composerEntityStrip.ts` |
| Mobile shell | `ChatComposer.tsx`, `chat-theme.css` (`.journal-composer-shell--mobile`) |

## Root causes

### P0 — Contradictory “safe” vs “session only”

1. **One tri-state for two axes** — `persistStatus` collapses local vault, cloud save, and generation into `pending|saved|failed`. Generation failure often marks the assistant bubble `failed` and may still show the same copy as cloud failure.
2. **Copy lies by conflation** — on stream error with `!userSaved`, UI says *“original words are safe… restored to composer”* (true: localStorage vault) **and** bubble says *“Not backed up to cloud — kept in this session”* (also true, but different layer). Users hear “safe = cloud.”
3. **Reload is unsafe advice** — `ChatMessage` always suggests “Try sending again or reload” when `persistStatus === 'failed'`, even when the only durable copy is the vault / in-memory thread.
4. **Thread chip vs message chip** — header `SYNC_FAILED` / “Not backed up” is **thread-scoped** (`threadPersistenceTracker`) but reads **app-wide**. One failed message paints the whole header red and wraps on mobile.
5. **Summary banner overclaims** — “Summary unavailable — your messages are still saved” does not consult `persistStatus` or the tracker; it can display next to session-only failures.
6. **Duplicate failure surfaces** — same warning on user bubble footer + assistant error bubble + header chip.

### P1 — Lexical junk chips

1. Server `filterNoiseSpans` drops bare pronouns (`my`, `you`, …) but **not** interrogatives (`what`, `who`) or command verbs (`tell`, `show`).
2. Sentence-initial capitalization promotes `What` / `Tell` into concept-like spans (briefcase styling via type color).
3. Client `isSelfBleedLabel` / `SELF_NAMES` omit **`my`**, so possessive self surface forms can still chip as “my”.
4. Valid entities (real employers, schools) share nearly the same chip chrome as junk → trust collapse.
5. “Archived / tap ✓ to restore” reuses confirm affordances for lifecycle restore; labels are easy to misread.

### P1 — Mobile composer

1. Expanded shell still mounts **full chip strip + meta + 5 tools** above a field capped at `min(44dvh)` — chips dominate short prompts.
2. Collapsed bar exists (`defaultCollapsed`) but analysis tools are not gated behind a single toggle when expanded/keyboard-open.
3. Overlay of home (“Continue Your Story”) is a z-index / sheet vs flow issue when composer expands over non-chat surfaces.
4. Safe-area / `visualViewport` hooks exist (`useVisualViewportInset`) but keyboard-open still leaves a tall tool chrome.

## Target model (implemented next)

```ts
MessageLifecycle {
  local: not_started | saving | saved | failed
  cloud: not_started | queued | syncing | saved | failed
  processing: not_started | queued | processing | completed | failed
}
```

UI must never say “safe” without naming **which** layer succeeded. Reload only after `local === saved` **and** user confirms cloud is optional.
