# Local Validation Guide

How to verify the app is working correctly before and after any change.

---

## Quick Reference

```bash
npm run dev              # Start frontend + backend together
npm run dev:server       # Backend only (port 4000)
npm run dev:web          # Frontend only (port 5173)
npm run smoke            # HTTP smoke tests (server must be running)
npm run validate         # TypeScript + unit tests + HTTP checks
npm run check:supabase   # Supabase env vars + network connectivity
```

---

## Step-by-Step: Full Local Validation

### 1. Start the backend

```bash
npm run dev:server
```

**Expected output (clean startup):**

```
✅ Loaded .env from: /path/to/lorekeeper/.env
INFO  Security check passed
INFO  Route registration complete: 21 public, 123 protected routes
INFO  Memory extraction worker started
INFO  Daily insight generation job registered
INFO  Weekly graph update job registered
INFO  Lore Book API listening on 4000
```

**Known non-fatal warnings you can ignore:**

```
ERROR Failed to register Personal Strategy Engine training job
ERROR Failed to fetch sessions for processing  ← Supabase unreachable (only in sandbox)
```

The server is healthy if you see `Lore Book API listening on 4000`.

---

### 2. Run the smoke test

```bash
npm run smoke
```

**Expected output:**

```
💨  Lorekeeper Smoke Test

   Target: http://localhost:4000

  ✅  GET /health  — status=ok
  ✅  GET /api/chat/test-openai  — 401 auth required — middleware responding correctly
  ✅  POST /api/chat/stream  [normal conversation]  — auth required
  ✅  POST /api/chat/stream  [explicit log command]  — auth required

──────────────────────────────────────────────────
  4 passed  |  0 failed

✅  Smoke test passed.
```

The 401 responses are correct — auth is working. Chat stream endpoints require a logged-in Supabase JWT.

**If smoke fails:**

| Failure | Likely cause |
|---------|-------------|
| `GET /health` fails | Server not running, or crashed on startup |
| `Connection refused` | `npm run dev:server` not started |
| `500` on chat stream | Check server logs for unhandled exception |

---

### 3. Run the full validate

```bash
npm run validate
```

**Expected output (server running):**

```
🔍  Lorekeeper — Local Validation

[ 1/4 ]  Frontend TypeScript
  ⚠️   Frontend TypeScript (tsc --noEmit)
       416 pre-existing error(s) — server still runs via tsx

[ 2/4 ]  Backend TypeScript
  ⚠️   Backend TypeScript (tsc --noEmit)
       ~571 pre-existing error(s) — server still runs via tsx

[ 3/4 ]  Unit tests — mode router
  ✅  Mode router regression tests

[ 4/4 ]  Server HTTP checks
  ✅  Server health  (status=ok)
  ✅  Chat stream  (401 auth required)
  ✅  OpenAI connectivity  (401 auth required)

──────────────────────────────────────────────────
  4 passed  |  2 warned  |  0 failed  |  0 skipped
```

**Expected output (server NOT running):**

```
[ 4/4 ]  Server HTTP checks
  ⏭   Server health  — server not running
  ⏭   Chat stream  — server not running
  ⏭   OpenAI connectivity  — server not running
```

Start the server and re-run for full coverage.

---

### 4. Check Supabase connectivity

```bash
npm run check:supabase
```

**Expected output (on your machine with internet):**

```
🗄️   Supabase Connectivity Check

  ✅  SUPABASE_URL  (https://jawzxiiwfagliloxnnkc.supabase.co)
  ✅  SUPABASE_ANON_KEY  (eyJhbGciOiJIUzI1NiIsInR5...)
  ✅  SUPABASE_SERVICE_ROLE_KEY  (eyJhbGciOiJIUzI1NiIsInR5...)
  ✅  Supabase REST reachable  HTTP 200
  ✅  Read from conversation_sessions  (0 row(s) returned)

✅  Supabase connectivity verified.
```

**If this fails with `ENOTFOUND`:** The Supabase URL is correct but there's no network access (e.g. you're in a sandboxed environment). This is expected in CI or restricted environments. The env vars are still valid.

---

## Known Pre-Existing Warnings

These are in the codebase before your changes. They don't block the server from running because `tsx` skips TypeScript type checking at runtime.

| Warning | Count | Impact |
|---------|-------|--------|
| Frontend TypeScript errors | ~416 | None at runtime (Vite uses esbuild) |
| Backend TypeScript errors | ~571 | None at runtime (tsx uses esbuild) |
| Personal Strategy training job fails to register | 1 | Background job only, non-blocking |

These need to be fixed eventually (see [ROADMAP.md](../roadmap/ROADMAP.md)) but don't indicate the app is broken.

---

## Manual Logged-In Test Flow

This is the only test that verifies the full end-to-end core loop including OpenAI and Supabase writes. Do this after `npm run smoke` passes.

### Setup
1. Start both services: `npm run dev`
2. Open `http://localhost:5173`
3. Log in with a Supabase account (sign up if needed)

### Test messages (send these in order)

**Test 1 — Normal conversation (should get real AI response)**
```
I thought the villain needed more depth.
```
Expected: A thoughtful AI response. NOT "Noted."
Check server terminal: should see `[ModeRouter] mode=UNKNOWN`

**Test 2 — Another normal conversation**
```
I felt like chapter 2 was dragging.
```
Expected: Engaged AI response about pacing/narrative.
Check server terminal: should see `[ModeRouter] mode=UNKNOWN`

**Test 3 — Explicit memory log (should get warm AI ack, NOT "Noted.")**
```
Log this: Omega failed the first trial.
```
Expected: Brief acknowledgment like "Got it, logged." or similar.
Check server terminal: should see `[ModeRouter] mode=ACTION_LOG`

**Test 4 — Memory recall**
```
What do you remember about the villain?
```
Expected: AI recalls whatever you've told it in previous messages.
Check server terminal: should see `[ModeRouter] mode=MEMORY_RECALL` or `UNKNOWN`

**Test 5 — Regression guard**
```
I decided the story should start at the funeral.
```
Expected: Real AI response. NOT "Noted."
Check server terminal: must NOT see `mode=ACTION_LOG` for this message.

### What "working" looks like

| Signal | Source |
|--------|--------|
| AI gives substantive responses | Browser chat UI |
| `[ModeRouter] mode=UNKNOWN` for normal conversation | Server terminal |
| `[ModeRouter] mode=ACTION_LOG` only for `log this:` style commands | Server terminal |
| No CORS errors | Browser console (F12 → Console) |
| No `Failed to fetch` errors | Browser console |
| Messages appear in Supabase `chat_messages` table | Supabase dashboard |

---

## Dev Mode Reference

### Mode 1 — Frontend Auth Bypass (`VITE_DEV_DISABLE_AUTH`)

Skips the Supabase login screen entirely. The app loads directly as a dev session.

**Setup:**

```bash
# apps/web/.env.local  (never commit this file)
VITE_DEV_DISABLE_AUTH=true
VITE_API_URL=http://localhost:4000
```

**How to run:**

```bash
npm run dev:web   # Frontend loads without login screen
```

**What the UI shows:** A small "Dev Auth" pill badge in the bottom-left corner.

**What it can prove:**

- Frontend renders and navigates correctly
- UI components load without auth-dependent data
- Mock data mode works

**What it cannot prove:**

- Real Supabase writes (uses no real user id)
- Memory saves or recall from a real account
- The full end-to-end core loop (chat → memory → recall)

**Production safety:** `VITE_DEV_DISABLE_AUTH` is only read when `import.meta.env.DEV === true` (Vite dev server). Production builds ignore it entirely.

---

### Mode 2 — Backend Auth Bypass (`DISABLE_AUTH_FOR_DEV`)

Bypasses Supabase JWT verification on ALL server routes. Uses a fixed dev user id (`00000000-0000-0000-0000-000000000000`).

**Setup:**

```bash
# .env  (root, or apps/server/.env.local — never commit as true)
DISABLE_AUTH_FOR_DEV=true
NODE_ENV=development
```

**How to run:**

```bash
npm run dev:server   # Server logs: [Auth] DEV_AUTH_BYPASS active
```

**Test without a token:**

```bash
curl -X POST http://localhost:4000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"I thought the villain needed more depth.","conversationHistory":[]}'
```

Expected: SSE stream opens and returns real AI response chunks.

**Combined with smoke test:**

```bash
DISABLE_AUTH_FOR_DEV=true npm run dev:server &
sleep 5
npm run smoke
```

All smoke checks should pass without a real token.

**What it can prove:**

- Full backend starts and routes correctly
- Chat pipeline works end-to-end (OpenAI stream, memory extraction, Supabase writes)
- Mode router classifies messages correctly
- Memory saves to Supabase under dev-user id

**What it cannot prove:**

- Real per-user data isolation
- Subscription/billing gating
- Any behavior that depends on a real user id

**Production safety:** If `DISABLE_AUTH_FOR_DEV=true` is detected in production, the server returns HTTP 500 and refuses ALL requests. It does not silently bypass.

---

### Mode 3 — Guest Mode (existing)

No setup required. Available from the login screen ("Continue as Guest").

**What it does:**

- 5-message chat limit, stored in localStorage
- Chat calls the real backend when available
- **New:** When backend is unreachable, shows a demo response instead of a fetch error

**What the UI shows:** `GuestBanner` at the top of the page + "Guest" pill badge.

**What it can prove:**

- Frontend chat UI renders correctly
- Guest flow (limits, banner, sign-up prompts) works

**What it cannot prove:**

- Memory persistence (guest has no Supabase account)
- Recall of previous sessions

---

### Mode 4 — Mock Data Mode (existing)

Toggle via URL: `http://localhost:5173?mockData=true`

**What it does:**

- UI data (characters, timeline, chapters) comes from `mocks/` files, not backend
- **New:** When backend is unreachable, chat shows a demo response instead of an error
- The "Mock Data" pill badge appears in the bottom-left corner

**What it can prove:**

- UI components render correctly with sample data
- Layout, navigation, visual design

**What it cannot prove:**

- Any real backend behavior

---

### Mode 5 — Dev AI Fallback (`DEV_AI_FALLBACK`)

**Why it exists:** When OpenAI returns `429 quota exceeded` or a network error, the chat endpoint returns HTTP 500. This blocks all UI development that touches the chat flow. The fallback intercepts those errors and returns labelled fake responses so the UI still renders correctly.

**Setup:**

```bash
# .env (root)
DEV_AI_FALLBACK=true
NODE_ENV=development
```

**How to run:**

```bash
DEV_AI_FALLBACK=true npm run dev:server
# or just npm run dev:server if .env already has it
```

**What the server logs when fallback fires:**

```text
INFO [AI] DEV_AI_FALLBACK used because: OpenAI 429 quota exceeded
```

**What the SSE response looks like:**

```text
data: {"type":"metadata","data":{"response_mode":"UNKNOWN","fallback":true,"fallback_reason":"OpenAI 429 quota exceeded"}}
data: {"type":"chunk","content":"[DEV FALLBACK — OpenAI 429 quota exceeded]\n\nThis is a dev fallback response..."}
data: {"type":"done"}
```

**Fallback responses by mode:**

| Message type | Fallback content |
| ------------ | ---------------- |
| Normal conversation (UNKNOWN) | Tagged note explaining fallback + how to add credits |
| Explicit log command (ACTION_LOG) | "Logged locally (dev fallback)..." |
| Memory recall question (MEMORY_RECALL) | "Recall unavailable in dev fallback mode..." |

**What it can prove:**

- Full SSE stream pipeline works end-to-end
- Mode router classifies messages correctly
- Frontend renders streamed responses
- Auth bypass, mode routing, and Supabase write attempts all work

**What it cannot prove:**

- Real OpenAI response quality
- Actual memory write/recall (Supabase writes are attempted but need network)

**Production safety:** Checked at startup in `securityCheck.ts`. If `DEV_AI_FALLBACK=true` in production, the security check logs a critical error. `isFallbackEnabled()` also returns `false` in production regardless of the flag.

---

### OpenAI 429 Quota Exceeded

When you see:

```text
"429 You exceeded your current quota, please check your plan and billing details."
```

This means the OpenAI API key has run out of credits. It is **not a code bug**.

**Fixes in order of preference:**

1. **Use `DEV_AI_FALLBACK=true`** — keeps UI development working immediately, no spend required
2. **Add credits** at [platform.openai.com/account/billing](https://platform.openai.com/account/billing), then restart the server
3. **Use a different key** — set `OPENAI_API_KEY=sk-...` in `.env` with a key that has credits

The validate script treats 429 as a warning, not a failure, when `DEV_AI_FALLBACK=true` is available.

---

### Mode Indicator Summary

| Badge shown | Meaning |
| ----------- | ------- |
| `Dev Auth` (purple) | `VITE_DEV_DISABLE_AUTH=true` in dev build |
| `Guest` (blue) | Guest session active |
| `Mock Data` (amber) | Mock data toggle is on |
| Red "Backend Offline" banner | `ConnectionStatus` detected server unreachable |
| No badge | Normal mode — authenticated, backend connected |
| Server log: `[AI] DEV_AI_FALLBACK used` | Fallback fired for this request |

---

## What Breaks the Core Loop

These are the specific things that can silently break the chat without a visible error:

1. **VITE_API_URL not set** — frontend calls empty URL, all requests fail silently. Check `apps/web/.env.local`.
2. **Server not running** — browser shows loading spinner forever. Check `npm run dev:server`.
3. **OpenAI key invalid or quota exceeded** — stream opens but immediately closes with no content. Check key at `platform.openai.com`.
4. **Supabase service role key wrong** — server starts but chat messages aren't saved, memory recall returns nothing. Check `.env`.
5. **Mode router misclassifying** — normal messages get "Noted." response. Run `npm run smoke` to catch this.
