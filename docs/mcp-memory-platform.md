# LoreBook MCP Memory Platform

**Status:** Architecture spec · **Date:** 2026-06-22  
**Goal:** Expose LoreBook's memory graph as a secure, provenance-first MCP server usable by ChatGPT Developer mode, Claude, Cursor, VS Code agents, robotics stacks, and future model hosts.

**Thesis:** LoreBook already has the memory graph (omega entities/claims, characters, journal entries, provenance edges, working-memory assembly). MCP is a **new transport + auth + policy layer** on top of existing domain services — not a parallel memory system.

---

## 1. System context

```
┌─────────────────────────────────────────────────────────────────────────┐
│  MCP clients (ChatGPT Dev mode, Claude Desktop, Cursor, local agents)   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ MCP (streamable HTTP / SSE)
                                │ OAuth 2.1 + PKCE
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  apps/mcp-server (new) — thin protocol adapter                          │
│  • Tool registry + versioning                                           │
│  • readOnlyHint / destructive annotations                               │
│  • Rate limits + audit log                                            │
│  • Maps MCP tool calls → LoreBook domain commands                       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Internal RPC (same process or HTTP to apps/server)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  apps/server — existing domain layer (reuse, do not fork)               │
│  memoryRetriever · entitySearchService · omegaMemoryService             │
│  provenanceEdgeService · characterRegistry · workingMemoryAssembler     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Supabase Postgres + pgvector + RLS                                   │
│  journal_entries · omega_entities · omega_claims · provenance_edges     │
│  characters · entity_relationships · mcp_* tables (new)               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design principles

| Principle | Implementation |
|-----------|----------------|
| **Provenance-first** | Every read returns `sources[]`; every write appends provenance edges + audit row |
| **Never lose memory** | Writes go through MRQ / revision protocol; deletes are soft + event-sourced |
| **User-scoped only** | OAuth token → `user_id`; all queries filtered; no cross-tenant tools |
| **Multi-model** | MCP is model-agnostic; tool schemas are JSON Schema, not OpenAI-specific |
| **Horizontal scale** | Stateless MCP workers; Postgres is source of truth; Redis optional for rate limits |

---

## 2. MCP server package (`apps/mcp-server`)

### Transport

| Mode | Use case |
|------|----------|
| **Streamable HTTP** (primary) | ChatGPT Developer mode, remote agents, production |
| **stdio** (dev) | Cursor / Claude Desktop local testing |
| **SSE** (legacy compat) | Older MCP clients until they adopt streamable HTTP |

Hosted URL pattern: `https://mcp.lorebookai.com/v1` (Railway service separate from main API for blast-radius isolation).

### Server `instructions` field (first 512 chars self-contained)

```
LoreBook MCP exposes the user's personal memory graph. Always call search_memories
or search_entities before asserting facts. Write tools require user confirmation
in ChatGPT — never chain destructive writes without explicit user intent.
Prefer get_entity + get_relationships over guessing. All results include
provenance sources; cite them in responses.
```

Full instructions (in MCP initialize) cover tool sequencing, rate limits, and disambiguation when multiple entities match.

### Tool annotations (ChatGPT Developer mode)

| Tool | `readOnlyHint` | Notes |
|------|----------------|-------|
| `search_memories` | `true` | |
| `search_entities` | `true` | |
| `get_entity` | `true` | |
| `get_timeline` | `true` | |
| `get_relationships` | `true` | |
| `create_memory` | `false` | Queues via MRQ; returns `pending_review` when gated |
| `update_memory` | `false` | Revision, not overwrite |
| `correct_fact` | `false` | Creates correction record + provenance |
| `merge_entities` | `false` | **High risk** — requires `confirm: true` param |
| `create_relationship` | `false` | |

---

## 3. Tool catalog (v1)

All tools accept optional `_version: "1"` for forward compatibility. Responses include:

```typescript
type McpToolResult<T> = {
  ok: boolean;
  data: T;
  provenance: ProvenanceBundle;
  tool_version: string;
  request_id: string;
};

type ProvenanceBundle = {
  sources: Array<{
    artifact_type: string;
    artifact_id: string;
    relation: string;
    confidence?: number;
    excerpt?: string;
    occurred_at?: string;
  }>;
  truth_state?: string;
};
```

### Read tools

#### `search_memories`
- **Maps to:** `memoryRetriever.retrieve()`, `memoryService.semanticSearchEntries()`
- **Input:** `{ query: string, limit?: number, date_from?: string, date_to?: string }`
- **Output:** Ranked journal entries + omega claims with provenance excerpts

#### `search_entities`
- **Maps to:** `entitySearchService.searchEntities()`
- **Input:** `{ query: string, types?: EntitySearchType[], limit?: number }`
- **Output:** Certified + mentionable entities with match kind (`exact` | `alias` | `fuzzy`)

#### `get_entity`
- **Maps to:** characters / omega_entities / locations unified via certified entity index
- **Input:** `{ id: string }` — accepts `char_*`, `omega_*`, or certified index id
- **Output:** Entity card + linked claims summary + relationship count

#### `get_timeline`
- **Maps to:** chronology engine + `journal_entries` date range + `character_timeline_events`
- **Input:** `{ start_date: string, end_date: string, entity_id?: string }`
- **Output:** Ordered events with provenance links

#### `get_relationships`
- **Maps to:** `relationshipPersistenceService` + romantic_relationships + ER edges
- **Input:** `{ entity_id: string, direction?: 'outbound' | 'inbound' | 'both' }`
- **Output:** Typed edges with confidence + source message ids

### Write tools

All writes:
1. Validate OAuth scope includes `memory:write` (or per-tool scope)
2. Append `mcp_tool_audit_log` row (before execution)
3. Route through existing mutation protocols (P1 creation, P3 revision — see `docs/canonical-protocols-and-registries.md`)
4. Append `provenance_edges` from `mcp_call` artifact → created/updated artifact
5. Return `ProvenanceBundle` with new artifact ids

#### `create_memory`
- **Maps to:** `omegaMemoryService.ingestText()` + journal pipeline when autobiographical
- **Input:** `{ text: string, memory_type?: 'semantic'|'episodic', entities?: string[], occurred_at?: string }`
- **Policy:** Never direct `omega_claim` insert — always MRQ path

#### `update_memory`
- **Input:** `{ memory_id: string, text?: string, truth_state?: TruthState }`
- **Policy:** Creates revision chain (`REVISED_BY` edge), preserves prior row

#### `correct_fact`
- **Maps to:** `CorrectionAuthority` + `user_corrections`
- **Input:** `{ fact_id: string, correction: string, reason?: string }`

#### `merge_entities`
- **Maps to:** `characterMergeService` + entity resolution core
- **Input:** `{ entity_a: string, entity_b: string, preferred_name?: string, confirm: true }`
- **Policy:** Rejects unless `confirm === true` (agent must get user approval first)

#### `create_relationship`
- **Maps to:** `relationshipPersistenceService.persistFromInterpretation` adapter
- **Input:** `{ source_id: string, target_id: string, type: string, scope?: string, evidence?: string }`

### Future tools (v2+)

| Tool | Existing foundation |
|------|---------------------|
| `semantic_search` | `multiVectorRetrieval`, hybrid RRF in `memoryRetriever` |
| `graph_traversal` | `provenanceEdgeService` BFS |
| `working_memory_assembly` | `assembleWorkingMemory()` |
| `episodic_memory_retrieval` | `memoryRecallEngine` |
| `identity_integrity_validation` | `identityIntegrityPolicy`, `entityLifecycleDiagnostics` |

---

## 4. Authentication & authorization

### OAuth 2.1 (ChatGPT Developer mode compatible)

```
Authorization Server: https://auth.lorebookai.com  (Supabase Auth + custom AS metadata)
Resource Server:      https://mcp.lorebookai.com
```

| Flow | Client |
|------|--------|
| **Authorization Code + PKCE** | ChatGPT, web connectors |
| **Client Credentials** | Server-to-server (enterprise, disabled by default) |
| **Mixed auth** | `initialize` + `tools/list` public; tool execution requires token |

### Scopes

| Scope | Grants |
|-------|--------|
| `memory:read` | All read tools |
| `memory:write` | create/update/correct |
| `entity:write` | merge_entities, create_relationship |
| `memory:admin` | Bulk export, delete (off by default) |

### Token → user binding

```typescript
// Every tool handler starts with:
const ctx = await authenticateMcpRequest(req); // JWT → user_id
assertUserActive(ctx.userId);
return withUserScope(ctx.userId, () => domainService.search(...));
```

**Never** accept `user_id` as a tool parameter.

### ChatGPT-specific safety

- Mark write tools without `readOnlyHint`
- Document in tool descriptions: *"Use this when the user explicitly asks to save or correct a memory. Requires confirmation in ChatGPT Developer mode."*
- `merge_entities` description includes: *"Destructive — only call after user confirms merge in chat."*

---

## 5. Security model

### Threat matrix

| Threat | Mitigation |
|--------|------------|
| **Prompt injection → exfiltration** | User-scoped RLS; no bulk export tool in v1; rate limits |
| **Prompt injection → destructive writes** | MRQ gating; `confirm` flags; ChatGPT write confirmation UI |
| **Malicious MCP client** | OAuth client registration; per-client rate limits; audit log |
| **Cross-user access** | JWT `sub` = `user_id`; integration tests per tool |
| **Token theft** | Short-lived access tokens (15m); refresh rotation; `aud` claim = `mcp.lorebookai.com` |

### Rate limiting

| Tier | Read RPM | Write RPM |
|------|----------|-----------|
| Free | 60 | 10 |
| Plus/Pro | 300 | 60 |
| Enterprise | Custom | Custom |

Implementation: Redis token bucket keyed by `user_id` + `client_id`. Return MCP error `-32029` (resource exhausted) with `Retry-After`.

### Audit log (append-only)

Every tool invocation writes:

```sql
INSERT INTO mcp_tool_audit_log (
  user_id, client_id, tool_name, tool_version,
  input_hash, output_summary, status, latency_ms,
  request_id, ip_hash, created_at
);
```

Raw payloads stored encrypted in `mcp_tool_payload_archive` (90-day retention, GDPR delete cascades).

---

## 6. Database schema (new tables)

Existing tables reused: `journal_entries`, `omega_entities`, `omega_claims`, `provenance_edges`, `characters`, `entity_relationships`, `user_corrections`.

### `mcp_oauth_clients`

```sql
CREATE TABLE mcp_oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('public', 'confidential')),
  redirect_uris TEXT[] NOT NULL,
  allowed_scopes TEXT[] NOT NULL DEFAULT '{memory:read}',
  owner_user_id UUID REFERENCES auth.users(id),  -- null = platform client (ChatGPT)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
```

### `mcp_tool_audit_log`

```sql
CREATE TABLE mcp_tool_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_version TEXT NOT NULL DEFAULT '1',
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,          -- SHA-256 of canonical JSON input
  output_artifact_ids TEXT[] DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'denied', 'rate_limited')),
  error_code TEXT,
  latency_ms INT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX mcp_audit_user_time_idx ON mcp_tool_audit_log (user_id, created_at DESC);
CREATE INDEX mcp_audit_tool_idx ON mcp_tool_audit_log (tool_name, created_at DESC);
```

### `mcp_tool_versions`

```sql
CREATE TABLE mcp_tool_versions (
  tool_name TEXT NOT NULL,
  version TEXT NOT NULL,
  schema JSONB NOT NULL,             -- JSON Schema for input
  deprecated_at TIMESTAMPTZ,
  sunset_at TIMESTAMPTZ,
  PRIMARY KEY (tool_name, version)
);
```

### `mcp_events` (event sourcing backbone)

```sql
CREATE TABLE mcp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  aggregate_type TEXT NOT NULL,      -- 'memory', 'entity', 'relationship'
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,          -- 'MemoryCreated', 'EntityMerged', ...
  payload JSONB NOT NULL,
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX mcp_events_aggregate_idx ON mcp_events (user_id, aggregate_type, aggregate_id, created_at);
```

### RLS

```sql
ALTER TABLE mcp_tool_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_audit_own ON mcp_tool_audit_log
  FOR SELECT USING (user_id = auth.uid());
-- Inserts via service role only (MCP server)
```

---

## 7. API layout

### Public endpoints (`apps/mcp-server`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/mcp` | Streamable HTTP MCP (JSON-RPC) |
| `GET` | `/.well-known/oauth-authorization-server` | OAuth metadata |
| `GET` | `/.well-known/openid-configuration` | OIDC (optional) |
| `POST` | `/oauth/token` | Token exchange (or delegate to Supabase) |
| `GET` | `/health` | Liveness |

### Internal domain API (`apps/server` — existing + thin additions)

New router: `apps/server/src/routes/mcpDomain.ts` (internal only, mTLS or shared secret from MCP worker):

```
POST /internal/mcp/execute
{ tool, version, input, user_id, request_id, client_id }
→ domain handler result + provenance bundle
```

Keeps business logic in one place; MCP package stays a protocol shell.

---

## 8. Provenance contract

Every read tool attaches sources by walking `provenance_edges` (max depth 3) from result artifacts.

Every write tool creates:

```
mcp_call:{request_id}  --EXTRACTED_FROM-->  journal_entry | omega_claim | correction
```

Truth states flow from existing `omega_claims.truth_state` and `TruthState` enum in `provenance/types.ts`.

Example response fragment:

```json
{
  "data": { "memories": [{ "id": "je_abc", "text": "...", "date": "2025-03-01" }] },
  "provenance": {
    "sources": [
      {
        "artifact_type": "journal_entry",
        "artifact_id": "je_abc",
        "relation": "CITED_IN",
        "confidence": 0.91,
        "excerpt": "We went to Metro that night...",
        "occurred_at": "2025-03-01T22:00:00Z"
      }
    ],
    "truth_state": "CANONICAL"
  }
}
```

---

## 9. ChatGPT Developer mode integration

### App registration checklist

1. Enable Developer mode in ChatGPT settings
2. Create app → Remote MCP → `https://mcp.lorebookai.com/mcp`
3. Auth: OAuth (LoreBook AS)
4. Scopes: `memory:read memory:write entity:write`
5. Toggle tools on in app details; refresh after deploys

### Prompting guidance (user-facing docs)

```
Use LoreBook search_memories with query "Saturday Metro night" before answering.
To save a fact, call create_memory only after I confirm. Do not use browsing.
```

### Tool description template

```
search_memories — Search the user's autobiographical memory graph.
Use this when: answering questions about past events, people, or facts.
Do not use when: the user is brainstorming fiction (use chat only).
Returns provenance excerpts — cite them in your reply.
```

---

## 10. Implementation roadmap

### Phase 0 — Foundation (2 weeks)

- [ ] `apps/mcp-server` package scaffold (TypeScript, `@modelcontextprotocol/sdk`)
- [ ] Streamable HTTP transport + stdio dev mode
- [ ] OAuth: Supabase JWT validation + scope claims in `app_metadata`
- [ ] `mcp_tool_audit_log` migration + insert middleware
- [ ] Internal `/internal/mcp/execute` bridge to server

### Phase 1 — Read tools (2 weeks)

- [ ] `search_memories`, `search_entities`, `get_entity`
- [ ] `get_timeline`, `get_relationships`
- [ ] Provenance bundle on all reads
- [ ] Rate limiting (in-memory → Redis)
- [ ] Integration tests per tool with fixture user

### Phase 2 — Write tools (3 weeks)

- [ ] `create_memory` → MRQ path only
- [ ] `update_memory`, `correct_fact`
- [ ] `create_relationship`
- [ ] `merge_entities` with `confirm` gate
- [ ] `mcp_events` event sourcing
- [ ] Security review + ChatGPT Developer mode beta

### Phase 3 — ChatGPT + Cursor launch (2 weeks)

- [ ] Hosted `mcp.lorebookai.com` on Railway
- [ ] OAuth AS metadata + ChatGPT app submission
- [ ] User settings UI: "Connected apps" + revoke tokens
- [ ] Audit log viewer in account settings

### Phase 4 — Advanced tools (ongoing)

- [ ] `semantic_search` (multi-vector)
- [ ] `working_memory_assembly`
- [ ] `graph_traversal`
- [ ] `identity_integrity_validation`
- [ ] Webhooks for write confirmations (enterprise)

### Phase 5 — Scale & compliance

- [ ] Horizontal MCP workers (stateless)
- [ ] Per-tenant encryption keys for payload archive
- [ ] SOC2 audit trail exports
- [ ] ZDR mode: no payload archive, audit metadata only

---

## 11. Mapping to existing code

| MCP tool | Reuse |
|----------|-------|
| `search_memories` | `apps/server/src/services/chat/memoryRetriever.ts` |
| `search_entities` | `apps/server/src/services/search/entitySearchService.ts` |
| `get_entity` | `certifiedEntityIndexService` + character/omega routes |
| `get_timeline` | chronology engine + `journal_entries` |
| `get_relationships` | `relationshipPersistenceService`, ER tables |
| `create_memory` | `omegaMemoryService.ingestText()` |
| `correct_fact` | `provenance/CorrectionAuthority.ts` |
| `merge_entities` | `characterMergeService` + `entityResolutionCore` |

**Do not duplicate** retrieval or mutation logic in the MCP package.

---

## 12. Success metrics

| Metric | Target |
|--------|--------|
| Read tool p95 latency | < 800ms |
| Write tool MRQ queue rate | 100% (zero direct claim writes) |
| Provenance coverage | 100% of read results include ≥1 source |
| Audit log completeness | 100% of tool calls logged |
| Cross-user leakage | 0 (CI security tests) |

---

## 13. Open decisions

1. **Separate Railway service vs same process** — recommend separate for blast radius; shared Postgres.
2. **Supabase as AS vs custom** — start with Supabase JWT + custom scope claims; graduate to full AS if ChatGPT requires CIMD/DCR.
3. **stdio distribution** — npm `@lorebook/mcp-server` for local agents vs bundled binary.

---

*This spec extends `docs/canonical-protocols-and-registries.md` and `docs/architecture/CORE_LOOP.md`. MCP writes must obey P1 (creation) and P3 (revision) protocols.*
