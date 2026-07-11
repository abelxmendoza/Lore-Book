# Session Delta — What Changed Since Last Time

**Date:** 2026-07-11  
**Status:** Enhanced on top of Sprint H WhatChanged surface

## Distinction from return points

| Surface | Question it answers |
|---------|---------------------|
| **Return point** | What is still unfinished / waiting? |
| **Session delta** | What completed or newly appeared while you were away? |

Both can show quietly; they must not dump the whole memory store.

## Behavior

- Fires after a qualifying gap (existing UI: ~20h–60d, ≥3 messages on thread)
- **Max 3 factual lines**, with a **headline** (highest-priority delta)
- Zero lines when nothing meaningful changed (theme alone does not count)
- Dismissible; never blocks chat
- No OpenAI calls

## Ranking priority (high → low)

1. Completed goals  
2. Resolved waits (when provided)  
3. Abandoned goals (“moved on from…”)  
4. New people (named)  
5. New meaning labels  
6. Reinforced people  
7. Memory / chat volume  
8. Timeline events  
9. Theme (only with other signal)

## Data sources (read-only)

- `journal_entries`, `chat_messages`
- `characters` (+ reinforced via source_entry_ids)
- `character_timeline_events`
- `goals` (completed / abandoned since)
- `autobiographical_meaning_artifacts` (new ACTIVE)
- biography snapshot theme (secondary only)

## API

`GET /api/conversation/what-changed?since=<ISO>`

Response adds:

```json
{
  "headline": "You finished: Rocket Lab interview prep",
  "lines": ["…", "…"],
  "summary": { "hasChanges": true, "completedGoals": [], "headline": "…" }
}
```

## Gate

```bash
npm run test:session-delta
```

## Files

- `apps/server/src/services/chat/sessionDelta.ts` — pure ranking  
- `apps/server/src/services/chat/whatChangedService.ts` — richer fetch + delta  
- `apps/web/.../WhatChangedSinceLastTime.tsx` — headline + capped list  
- `docs/session-delta-what-changed.md`
