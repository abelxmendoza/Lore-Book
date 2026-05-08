# High-Value Ideas — Core Loop Impact

Ideas that directly improve memory accuracy, user trust, core chat UX, debugging capability, or retention. Build these before anything in `IDEAS_BACKLOG.md`.

---

## 1. Memory Trace Debugger

**Why it matters:** Without this, the system is a black box. When a user says "why didn't you remember that?", there is no answer. This is the single most important debugging and trust tool.

**What it does:** Reconstructs the full lineage of how a chat message became (or didn't become) a memory:

```
chat_message
  → conversation_message (normalized)
  → utterances (sentence-level splits)
  → extracted_units (EXPERIENCE, PERCEPTION, FEELING, THOUGHT)
  → memory_artifacts (journal_entries, perception_entries, insights)
  → resolved_events
```

**API already designed — not wired:**

- `GET /api/conversation/trace/chat/:chatMessageId` — forward trace from message
- `GET /api/conversation/trace/memory/:memoryId` — backward trace to source
- `GET /api/conversation/trace/session/:sessionId` — full session trace

**What's missing:** API endpoints exist as spec, backend pipeline exists. UI not started. Connecting them is the work.

**Effort estimate:** 3–5 days (API wiring + basic UI).

---

## 2. Memory Explorer — "What Do You Know About Me?"

**Why it matters:** The #1 user trust feature. Without a way to see what the system has stored, users assume it isn't working. This is what turns skeptics into believers.

**What it does:** Transform the current HQIPanel into a full memory browser:

- Default view: recent memories as cards
- Real-time search (semantic + keyword + cluster)
- Expandable cards showing linked memories
- Filter sidebar (date, type, topic, character)

**Component structure designed:**

```
apps/web/src/components/memory-explorer/
├── MemoryExplorer.tsx
├── MemoryCard.tsx
├── MemoryFiltersSidebar.tsx
├── SearchResults.tsx
└── LinkedMemoriesSection.tsx
```

**What's missing:** Full component implementation. The data APIs exist (`GET /api/memories`, HQI search). Building the UI is the work.

**Effort estimate:** 4–6 days.

---

## 3. Inline Memory Confirmation

**Why it matters:** The feedback loop is invisible. When the AI stores something, the user sees nothing. No signal = no trust. This is a one-day fix with outsized trust impact.

**What it does:** After the AI processes a message that results in a memory being stored, show a small persistent indicator:

```
💾 Remembered: "Omega failed the first trial" → linked to Chapter 2
```

Options: toast notification, sidebar card, chat message annotation, subtle icon on the message.

**What's missing:** The backend already writes to Supabase. The response metadata already contains `entryId`. The frontend just needs to render something when `metadata.entryId` is present in the stream response.

**Effort estimate:** 1–2 days.

---

## 4. RAG Context Optimization

**Why it matters:** Every chat message currently fetches characters, locations, chapters, timelines, relationships, interests, workout events, and biometrics — regardless of what the message is about. This is expensive, slow, and noisy.

**What it does:** Replace the kitchen-sink RAG fetch with a focused, intent-aware context builder:

1. Classify what the message is asking about (entity, event, feeling, etc.)
2. Fetch only the 3–5 most relevant memory clusters
3. Inject a compact "always-on" context block (pinned memories, recent chapter, key characters)
4. Keep the full fetch available as a fallback for broad questions

**Where to change:** `services/omegaChatService.ts` → `buildRAGPacket()` method.

**Current state:** `RAG_OPTIMIZATION_PLAN.md` (now in archive) has a detailed plan. The core ideas are sound — they just haven't been implemented.

**Effort estimate:** 3–4 days. High performance and cost impact.

---

## 5. Clickable Citation Sources in Chat

**Why it matters:** When the AI says "Based on your entry from March...", users want to click that and see it. Right now sources appear in the sidebar but aren't linked from the response text.

**What it does:** Inline citations in responses that open the actual memory entry, journal entry, or character card.

```
The villain fears abandonment [📎 Memory, Dec 2024] based on three
separate entries where you described his backstory.
```

**What's missing:** Backend already returns `sources` array in response metadata. Frontend `ChatMessage.tsx` needs to parse citation markup and render clickable links.

**Effort estimate:** 2–3 days.

---

## 6. Conversation Persistence Across Refresh

**Why it matters:** Right now, if you refresh the browser, the entire chat history disappears. For a "lorekeeper" this is a jarring experience — your conversation with your AI is ephemeral.

**What it does:** Save chat messages to Supabase `chat_messages` table during the session, and reload them on next visit. The backend already has `chat_messages` and `chat_sessions` tables.

**What's missing:** The frontend doesn't call `GET /api/chat/history/:sessionId` on load. The route and service exist (`chatOrchestrationRouter` in `routes/chatOrchestration.ts`). It just needs to be wired into the chat component.

**Effort estimate:** 1–2 days.

---

## 7. Narrative Integrity Bug Fixes

**Why it matters:** These are active bugs that contradict the core architectural principles. They're not roadmap items — they're broken behavior that should be fixed before anything else gets built on top of them.

See [NARRATIVE_INTEGRITY.md](../architecture/NARRATIVE_INTEGRITY.md) for exact file/line references.

- `omegaMemoryService.ts` marks claims inactive when conflicts detected (destructive — violates blueprint)
- `contradictionDetector.ts` uses accusatory language ("you contradicted")
- `truthVerificationService.ts` implies objective truth judgment (needs rename + language change)

**Effort estimate:** 1 day. Mostly language changes and removing one function call.

---

## 8. Session-to-Session Memory (Episodic Continuity)

**Why it matters:** Each conversation starts cold. The AI has access to stored memories via RAG, but has no memory of *talking to you yesterday*. This breaks the companion experience.

**What it does:** After a conversation ends, auto-generate a 3–5 sentence summary and store it. On the next session, inject the last 3 conversation summaries as context.

**What's missing:** No session summarization job. The conversation_sessions table exists. Need a `summarizeSession()` function that fires when a session closes and a retrieval step that fetches summaries at session start.

**Effort estimate:** 2–3 days.
