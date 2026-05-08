# The Core Loop — Request to Response

The complete data flow for a single chat message, from user keystroke to streamed response. Every other system in the app is downstream of this loop working correctly.

---

## The Heartbeat

```
User types a message
  │
  ▼
Frontend (React/Vite) — apps/web
  │  Authenticated POST /api/chat/stream
  │  Body: { message, conversationHistory, entityContext? }
  │  Header: Authorization: Bearer <supabase_jwt>
  │
  ▼
Auth Middleware — apps/server/src/middleware/auth.ts
  │  Validates Supabase JWT
  │  Attaches req.user = { id, email }
  │  → 401 if missing or invalid
  │
  ▼
Rate Limit + Security Middleware
  │  CSRF protection (production only)
  │  Rate limiting (per user)
  │  Input sanitization
  │
  ▼
Chat Route — apps/server/src/routes/chat.ts
  │  POST /api/chat/stream
  │  Validates request schema (zod)
  │  Calls omegaChatService.chatStream()
  │
  ▼
Mode Router — services/modeRouter/modeRouterService.ts        ← FIRST GATE
  │  Classifies the message into one of:
  │
  │  UNKNOWN              → falls through to full AI pipeline ↓
  │  ACTION_LOG           → log + brief AI ack, skip main pipeline
  │  EXPERIENCE_INGESTION → capture experience, minimal ack
  │  MEMORY_RECALL        → database lookup, cite sources
  │  NARRATIVE_RECALL     → multi-version story response
  │  EMOTIONAL_EXISTENTIAL → emotional support, no memory lookup
  │  NEEDS_CLARIFICATION  → ask what they mean before ingesting
  │
  │  Pattern matching first (<50ms)
  │  LLM fallback (gpt-4o-mini) for ambiguous cases
  │
  ▼  [UNKNOWN path — the main conversation path]
  │
RAG Packet Builder — services/omegaChatService.ts → buildRAGPacket()
  │  Fetches from Supabase in parallel:
  │    - Related journal entries (semantic search)
  │    - All characters
  │    - All locations
  │    - All chapters
  │    - Timeline hierarchy (eras, sagas, arcs)
  │    - Romantic relationships
  │    - Recent corrections
  │    - Character attributes
  │    - Interests, workout events, biometrics
  │  Result: a "lore packet" injected into the system prompt
  │
  ▼
System Prompt Builder — omegaChatService.ts → buildSystemPrompt()
  │  Assembles a ~2000-3000 token system prompt from:
  │    - Core persona (Archivist / Therapist / Strategist / Gossip Buddy blend)
  │    - Timeline summary (last 20 events)
  │    - Character knowledge
  │    - Location knowledge
  │    - Chapter knowledge
  │    - Continuity warnings
  │    - Soul profile / essence
  │    - Safety guidance (if stress signals detected)
  │
  ▼
OpenAI Streaming Call — lib/openai.ts
  │  Model: gpt-4o-mini (configured in .env as OPENAI_MODEL)
  │  Mode: streaming (Server-Sent Events)
  │  conversationHistory passed as prior messages
  │  System prompt as the "system" role message
  │
  ▼
SSE Stream Back to Frontend
  │  Response format:
  │    data: {"type":"metadata","data":{sources,entryId,...}}
  │    data: {"type":"chunk","content":"Hello"}
  │    data: {"type":"chunk","content":" there"}
  │    data: {"type":"done"}
  │
  ▼
Frontend Stream Handler — hooks/useChatStream.ts
  │  Reads SSE chunks
  │  Appends each chunk to the displayed message in real time
  │  onMetadata() → stores sources, entryId for citation display
  │  onComplete() → message finalized
  │
  ▼
User sees response (word by word)
```

---

## Parallel: Memory Extraction (Fire-and-Forget)

While the stream is being sent to the user, the backend runs these **non-blocking** background operations:

```
Message saved to chat_messages (Supabase)
  │
  ├── Conversation Ingestion Pipeline
  │     → Splits into utterances
  │     → Extracts semantic units (EXPERIENCE, FEELING, BELIEF, etc.)
  │     → Creates journal_entries from EXPERIENCE units
  │     → Assembles resolved_events
  │
  ├── Entity Extraction
  │     → Detects character names / aliases
  │     → Creates/updates character records
  │     → Detects locations
  │
  ├── Passing Thought Detection
  │     → Classifies short messages as thoughts/insecurities
  │     → Stores for Soul Profile
  │
  └── Essence Extraction
        → Extracts identity signals (values, fears, strengths)
        → Updates essence profile
```

These run asynchronously. They don't block the response. If they fail, the chat still works.

---

## Memory Recall Path (MEMORY_RECALL mode)

When the mode router classifies a message as `MEMORY_RECALL` (e.g. "What did I say about the villain?"):

```
Mode Router → MEMORY_RECALL
  │
  ▼
Memory Recall Engine — services/memoryRecall/memoryRecallEngine.ts
  │  1. Parse the query (what entity/topic/time?)
  │  2. Semantic search against journal_entries + extracted_units
  │  3. Apply contract filter (CANON only)
  │  4. Score by recency + confidence + relevance
  │  5. Check for narrative conflicts (multiple versions)
  │
  ▼
Recall Formatter — services/memoryRecall/recallChatFormatter.ts
  │  Formats results with:
  │    - Source citations (entry date, confidence label)
  │    - Narrative divergence annotations if versions conflict
  │    - Silence response if nothing is found ("I don't have a record of that")
  │
  ▼
Response streamed back (same SSE format)
  │  metadata includes: recall_sources, response_mode='RECALL'
```

---

## The Key Invariants This Loop Relies On

1. **The mode router must not over-classify.** If `UNKNOWN` is too narrow, normal conversation hits the wrong handler and returns canned responses instead of real AI. This was the "Noted." bug. See regression tests in `apps/server/tests/modeRouter.test.ts`.

2. **The OpenAI key must be valid.** If expired or quota-exceeded, the stream opens and immediately closes. No error shown to user. Check `GET /api/chat/test-openai` (requires auth token).

3. **Supabase must be reachable for memory to work.** The AI response itself doesn't require Supabase (it streams directly from OpenAI). But memory extraction, RAG context, and recall all require Supabase. If Supabase is down, the AI responds but has no memory context.

4. **VITE_API_URL must point to the backend.** If missing or wrong, the frontend calls an empty URL and all requests silently fail. Set in `apps/web/.env.local`.

5. **conversationHistory must be sent.** The frontend maintains the session history in React state and passes it with every request. If this is lost (page refresh, state reset), the AI loses context of the current conversation.

---

## Where Each Step Lives

| Step | File |
|------|------|
| Auth middleware | `apps/server/src/middleware/auth.ts` |
| Chat route | `apps/server/src/routes/chat.ts` |
| Mode router | `apps/server/src/services/modeRouter/modeRouterService.ts` |
| Mode handlers | `apps/server/src/services/modeRouter/modeHandlers.ts` |
| RAG packet builder | `apps/server/src/services/omegaChatService.ts` → `buildRAGPacket()` |
| System prompt builder | `apps/server/src/services/omegaChatService.ts` → `buildSystemPrompt()` |
| OpenAI client | `apps/server/src/lib/openai.ts` |
| Ingestion pipeline | `apps/server/src/services/conversationCentered/ingestionPipeline.ts` |
| Memory recall engine | `apps/server/src/services/memoryRecall/memoryRecallEngine.ts` |
| Frontend stream hook | `apps/web/src/hooks/useChatStream.ts` |
| Chat UI | `apps/web/src/features/chat/` |
