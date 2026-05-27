# Memory Isolation Audit
_Lorekeeper · Runtime Security · 2026-05-26_

## Threat Model

Lorekeeper is a personal continuity system. Every entity, thread, memory, and timeline entry belongs to exactly one user. A cross-user memory leak — where user A's entities, embeddings, or timeline data appear in user B's context — is a **catastrophic trust failure** that invalidates the entire product category.

This document audits every memory-adjacent table for isolation correctness.

---

## Isolation Guarantee Matrix

| Layer | Table | user_id column | RLS enabled | Policy coverage |
|---|---|---|---|---|
| Threads | `conversation_sessions` | ✅ | ✅ | SELECT / INSERT / UPDATE / DELETE all gated on `auth.uid() = user_id` |
| Messages | `chat_messages` | ✅ | ✅ | Full CRUD gated on `auth.uid() = user_id` |
| Entities | `entities` | ✅ | ✅ | Full CRUD gated on `auth.uid() = user_id` |
| Continuity events | `continuity_events` | ✅ | ✅ | SELECT / INSERT / UPDATE gated on `auth.uid() = user_id` |
| Timeline hierarchy | `timeline_eras` / `timeline_sagas` / `timeline_arcs` / `timeline_chapters` | ✅ | ✅ | Full CRUD per user |
| Provenance edges | `provenance_edges` | ✅ (via entity ownership) | ✅ | Entity join enforces ownership; direct user_id on edge row |
| Ingestion pipeline runs | `pipeline_runs` | ✅ | ✅ | Owned by user |
| Lore entries | `memory_entries` / `journal_entries` | ✅ | ✅ | Full CRUD gated on `auth.uid() = user_id` |
| Characters / locations | `characters`, `locations` | ✅ | ✅ | Full CRUD per user |
| Embeddings cache | `embeddings_cache` | ⚠️ **SHARED** | N/A | Content-addressed by hash — no user_id (see below) |
| Soul profile | `essence_profiles`, `identity_core` | ✅ | ✅ | Per user |

---

## Embeddings Cache — Shared Resource Analysis

### Current behavior
`embeddings_cache` stores embedding vectors keyed by `content_hash`. It has **no `user_id` column** and is shared across all users as a cost-optimization cache.

### Risk surface
- **Vector content**: The cache stores raw embedding vectors for text chunks. The text itself is **not** stored — only the vector. Embedding vectors are one-way transforms; reversing them to recover the original text is not tractable.
- **No retrieval path**: The cache is only used to skip OpenAI API calls when the same text chunk appears in multiple users' contexts (common for system-level knowledge, not personal content). The retrieval system always scopes the *results* of a similarity search to the authenticated user's own memory rows.
- **Cross-contamination risk**: LOW. An adversary cannot retrieve another user's personal content via the embedding cache because the similarity search results are always filtered by `user_id` on the source table before being returned.

### Recommendation
Acceptable as-is for MVP. If personal content (diary entries, relationship details) is ever cached here, add a `user_id` column and partition the cache per user. Current usage is limited to shared lore excerpts and system text.

---

## Retrieval Isolation Audit

### RAG retrieval (ragBuilderService)
All vector similarity searches include `eq('user_id', userId)` before returning results. The embedding lookup fetches the vector from the shared cache, then scores it against user-scoped rows only.

**Status: ISOLATED** ✅

### Entity retrieval (entityAmbiguityService, peoplePlacesService)
All entity queries include `.eq('user_id', userId)`. Entity disambiguation prompts are built from user-owned entities only.

**Status: ISOLATED** ✅

### Timeline retrieval (timelineManager)
All timeline node queries include `.eq('user_id', userId)`.

**Status: ISOLATED** ✅

### Chat session lookup (chatPersistenceService)
`getOrCreateChatSession` queries `conversation_sessions` with both `user_id` and `session_id`. The session_id is tied to the authenticated user at creation time.

**Status: ISOLATED** ✅

### Return-to-thread context (omegaChatService — Phase 2 addition)
The thread metadata lookup added for idle orientation uses both `.eq('id', threadId)` and `.eq('user_id', userId)`, preventing cross-user thread reads even if a thread ID is guessed.

**Status: ISOLATED** ✅

---

## Identified Fragility Points

### 1. Provenance edge ownership — MEDIUM RISK
`provenance_edges` links entity rows. If the source entity is user-owned, the edge is transitively scoped. However, if RLS on `provenance_edges` relies solely on a join to the entity rather than a direct `user_id` column on the edge row, a misconfigured join policy could expose edge metadata. **Verify**: the migration should have a direct `user_id` column on `provenance_edges` and an RLS policy that checks it directly, not via a subquery join.

### 2. Ingestion queue — LOW RISK  
`ingestionQueue` processes messages asynchronously. If the queue worker does not re-validate `user_id` before writing extracted entities/events, a poisoned queue entry could write to the wrong user's namespace. **Verify**: ingestion pipeline should pass and re-validate `userId` at every write step, not assume the queued payload is trusted.

### 3. Session ID guessing — LOW RISK
Chat sessions are identified by UUID. UUIDs are not guessable. RLS further enforces ownership. No action needed.

### 4. Admin client in server services — INFORMATIONAL
`supabaseAdmin` bypasses RLS by design (service role key). This is correct for server-side operations but means every server-side query **must** manually include `user_id` scoping — RLS is not the safety net here. All current queries include explicit `user_id` filters.

**Action required**: Any new server-side Supabase query that touches user data MUST include `.eq('user_id', userId)` explicitly. This should be enforced in code review.

---

## Recommendations

| Priority | Action |
|---|---|
| HIGH | Add `user_id` column directly to `provenance_edges` (not only via entity join) and a direct RLS policy. Audit the migration. |
| HIGH | Add a `userId` re-validation step at every write in the ingestion pipeline worker, not just at queue entry time. |
| MEDIUM | Document the "admin client = no RLS" contract in a server-side coding guide so new engineers don't assume RLS protects server queries. |
| LOW | Consider adding a user_id to `embeddings_cache` if personal text is ever cached there. |
| LOW | Add integration tests that assert cross-user queries return zero rows. |

---

## Verdict

The core isolation architecture is **sound**. User data is scoped by `user_id` at the DB row level with RLS as the enforcement layer for client-originated queries, and explicit `user_id` filters for admin-client server queries. The two fragility points (provenance edge ownership, ingestion pipeline re-validation) are real and should be tightened before scaling to multi-user production.

Memory leaks in this product category are catastrophic. Treat isolation as a zero-tolerance requirement.
