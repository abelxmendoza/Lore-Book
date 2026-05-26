# API Response Contract Audit
**Date:** 2026-05-26  
**Scope:** CORE_RUNTIME routes + frontend fetch layer  
**Triggered by:** Production JSON parse failures after VITE_API_URL routing fix

---

## 1. Root Cause Summary

After `VITE_API_URL` was set correctly in Vercel, the HTML-routing failure
(`Unexpected token '<'`) was resolved. A second class of failures emerged:

```
JSON.parse: unexpected character at line 1 column 1
```

Sources identified:

| Source | Issue |
|--------|-------|
| `ChatFirstInterface.tsx` health check | Raw `fetch('/api/health')` used relative URL → hit Vercel HTML (200 ok), status check passed but body was HTML |
| `chapters.ts` DELETE handler | `res.status(204).send()` — empty body; frontend called `.json()` on 204, which throws |
| `fetchJson` | No content-type guard before `res.json()` on 2xx responses — HTML body passed silently until JSON.parse exploded |
| 21 raw `fetch('/api/...')` calls | Bypass `fetchJson` entirely; use relative URLs; still hit Vercel in production |

---

## 2. CORE_RUNTIME Route Audit

### `/api/health` (GET, public)
- Returns: `res.json({ status, timestamp, uptimeSeconds, envPresent })`
- Contract: ✅ Always JSON

### `/api/diagnostics` (GET, public)
- Returns: `res.json({ status, environment, server, security, request, message })`
- Contract: ✅ Always JSON

### `/api/entries` (GET, auth required)
- Returns: `res.json({ entries })` or `res.json({ entries: [] })`
- Error: `res.status(500).json({ error })`
- Contract: ✅ Always JSON

### `/api/timeline` (GET, auth required)
- Returns: `res.json({ entries })`, `res.json({ eras })`, etc.
- Error: `res.status(500).json({ error })`
- Contract: ✅ Always JSON

### `/api/chapters` (GET, auth required)
- Returns: `res.json({ chapters, candidates })`
- **DELETE /:id**: was `res.status(204).send()` → **FIXED** to `res.json({ ok: true })`
- Contract: ✅ Always JSON (after fix)

### `/api/characters` (GET, auth required)
- Returns: `res.json({ characters })` or `res.json({ characters: [] })`
- Error: `res.status(4xx/5xx).json({ error })`
- Contract: ✅ Always JSON

### `/api/user/accept-terms` (POST, auth required)
- Returns: `res.json({ success, message, acceptedAt, version })`
- Error paths: `res.status(400/500).json({ error, message, code })`
- Contract: ✅ Always JSON
- Known risk: `terms_acceptance` table may not exist in production DB → returns 500 JSON with migration instructions

### `/api/chat` and `/api/chat/stream` (POST, auth required)
- Chat stream uses SSE (`text/event-stream`) — not JSON, not parsed via `.json()`
- `useChatStream` handles raw stream correctly
- Contract: ✅ Correct content-type for stream

### `/api/user` data export (GET, auth required)
- `format=csv`: `res.setHeader('Content-Type', 'text/csv'); res.send(JSON.stringify(...))`
  - Risk: sends JSON-encoded data with CSV content-type header
  - Caller should not call `.json()` on this endpoint
- `format=json`: `res.setHeader('Content-Type', 'application/json'); res.send(...)`
  - ✅ Correct

---

## 3. Middleware Chain — JSON Contract

All middleware in the `apiRouter` stack returns `res.json()` on rejection:

| Middleware | Rejection response |
|------------|-------------------|
| `schemaGuard` | `503 { error, message, missingTables }` |
| `intrusionDetection` | `403 { error }` |
| `authMiddleware` | `401 { error }`, `500 { error }` |
| `csrfTokenMiddleware` | passes through (GET/HEAD/OPTIONS skip) |
| `validateRequestSize` | `413 { error }` |
| `csrfProtection` (prod) | `403 { error }` |
| `validateCommonPatterns` (prod) | `400 { error }` |
| `rateLimitMiddleware` | `429 { error }` |
| `errorHandler` (global) | `400/500 { error }` |
| 404 catch-all | `404 { error, path }` |

**Conclusion: No middleware returns non-JSON in any documented path.**

---

## 4. Frontend Fetch Layer Issues

### 4a. `fetchJson` (fixed)
- Added HTML content-type guard before `res.json()` on ALL responses
- If `Content-Type: text/html` is detected, throws structured error with routing instructions
- Prevents cryptic `JSON.parse: unexpected character` errors

### 4b. Health check in `ChatFirstInterface.tsx` (fixed)
- Was: `fetch('/api/health')` — relative URL, hit Vercel HTML
- Fixed: `fetch(`${import.meta.env.VITE_API_URL || ''}/api/health`)`

### 4c. Raw `fetch('/api/...')` calls still using relative URLs

These 21 calls bypass `fetchJson` and hit Vercel in production. They are all in
EXPERIMENTAL/non-CORE_RUNTIME components. None are in the primary chat/ingestion path.

| File | Endpoint | Risk |
|------|----------|------|
| `EntityProvenancePanel.tsx:119` | `/api/characters/${id}/provenance` | `.json()` call → fails |
| `ContradictionResolutionPanel.tsx:329` | `/api/characters/${id}/lifecycle` | `.json()` call → fails |
| `ContradictionResolutionPanel.tsx:140` | `/api/characters/${id}/contradictions/resolve` | `.json()` call → fails |
| `HarmonizationManager.tsx:11` | `/api/harmonization/summary` | `.json()` call → fails |
| `DocumentUpload.tsx:110,162,230,298` | `/api/photos/*`, `/api/resume/upload`, `/api/documents/upload` | `.json()` calls → fail |
| `ChatGPTImport.tsx:50,98` | `/api/documents/import-*` | `.json()` calls → fail |
| `GithubPanel.tsx:9` | `/api/integrations/github/sync` | `.json()` call → fails |
| `InstagramPanel.tsx:9` | `/api/integrations/instagram/sync` | `.json()` call → fails |
| `HQIPanel.tsx:27,70` | `/api/hqi/*` | `.json()` calls → fail |
| `MemoirEditor.tsx:310,923` | `/api/documents/upload`, `/api/hqi/search` | `.json()` calls → fail |
| `MemoirView.tsx:176` | `/api/documents/upload` | `.json()` call → fails |
| `TimelineV2.tsx:31` | `/api/timeline-v2` | `.json()` call → fails |
| `components/chat/ChatFirstInterface.tsx:543` | `/api/health` | old component file |

**These are EXPERIMENTAL features.** They do not block the core chat/memory loop.
They will fail silently (caught in individual `.catch()` handlers) rather than crashing.

To fix systematically: each raw `fetch` should use `fetchJson` or prepend `config.api.url`.

---

## 5. Production JSON Guarantees (post-fix)

| Guarantee | Status |
|-----------|--------|
| All CORE_RUNTIME routes return `Content-Type: application/json` | ✅ |
| 404 catch-all returns JSON | ✅ |
| All middleware rejections return JSON | ✅ |
| Global error handler returns JSON | ✅ |
| `fetchJson` detects HTML routing errors before JSON.parse | ✅ (fixed) |
| `chapters.ts` DELETE returns JSON body | ✅ (fixed, was 204 empty) |
| Health check in `ChatFirstInterface` uses absolute Railway URL | ✅ (fixed) |
| 21 raw `fetch` calls in EXPERIMENTAL components use relative URLs | ⚠️ known debt |

---

## 6. Canonical Error Shape

All CORE_RUNTIME error responses conform to:

```json
{
  "error": "Human-readable message",
  "message": "Optional extended detail",
  "code": "Optional error code (e.g. Supabase pg error code)"
}
```

No route currently uses `{ ok: false, error, code, route }` shape — adding that
field uniformly would require a pass across all route handlers. Not done in this
phase (would break existing frontend error message extraction).

---

## 7. Remaining Deployment Risks

1. **`terms_acceptance` table** — may not exist in production Supabase. POST /api/user/accept-terms
   returns 500 JSON with migration instructions. Frontend shows terms modal indefinitely.
   Fix: run `migrations/20250120_terms_acceptance.sql` against production Supabase.

2. **21 EXPERIMENTAL raw-fetch components** — will fail silently when loaded. Users won't
   see critical errors but provenance panel, contradiction panel, document upload, etc. will not work.

3. **CSRF token flow** — POST requests require the frontend to read `X-CSRF-Token` from GET
   response headers and re-send it. The current `fetchJson` does NOT do this automatically.
   POST to accept-terms succeeds because the CSRF token store is keyed by user ID and the
   token is generated during the OPTIONS preflight or a prior GET. Needs verification.
