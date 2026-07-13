# JSON contract inventory (baseline)

**Status:** Living doc — Phase 0 of the JSON communication plan.  
**Last updated:** 2026-07-12

## Channels

| Channel | Transport | Contract home |
|---------|-----------|----------------|
| REST `/api/*` | `application/json` | Evolving → `@lorebook/api-contracts` envelopes |
| Chat stream | SSE `data: {json}` | `@lorebook/api-contracts` chat stream events |
| Ingestion WAL | `ingestion_jobs.payload` jsonb | Planned (Phase 4) |
| MCP `/mcp` | JSON-RPC 2.0 | `apps/server/src/mcp/*` + planned package mirror |

## Shared package (PR A/B)

`packages/api-contracts` (`@lorebook/api-contracts`):

- `apiErrorEnvelopeSchema` / `unwrapApiData`
- `chatStreamEventSchema` + `parseChatStreamEvent` / `formatSseDataLine`
- `chatStreamDurabilitySchema`

Wired:

- Server: `apps/server/src/utils/sseWrite.ts`, `routes/chat.ts`, `devFallbackService.ts`
- Web: `hooks/useChatStream.ts` (parse frames + CSRF/timezone headers)

## High-risk untyped hot spots (next)

1. `ingestionJobStore` payload `Record<string, unknown>`
2. Dual books BFF (`sendSuccessDual`) consumers on web
3. `chat-memory/stream` + guest stream (align to shared SSE schema)
4. Sparse Zod on experimental/admin write routes
5. OpenAPI hand-maintained vs route registry

## Top CORE surfaces to contract-test

1. `POST /api/chat/stream` SSE sequence  
2. Chat durability JSON pre-stream errors  
3. `GET /api/books/*` dual envelope unwrap  
4. `POST /api/conversation/threads`  
5. `POST /api/lexical/preview` / lorebook-parse  
6. MCP tools (`search_memories`, `ingest_story`, …)
