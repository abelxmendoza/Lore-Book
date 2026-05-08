# Roadmap — Active Priorities

> Pulled from: `IMPROVEMENT_PLAN.md`, `HARSH_CRITIQUE_RESPONSE.md`, `NARRATIVE_INTEGRITY_ANALYSIS.md`  
> For unimplemented feature ideas, see `IDEAS.md`. For tech debt, see `TECH_DEBT.md`.

---

## Reality Check (From HARSH_CRITIQUE_RESPONSE.md — Still Valid)

These criticisms were written as self-assessment and remain accurate:

1. **No public demo** — The app runs locally. No one else can try it. This is the #1 blocker for any external validation.
2. **Massive scope creep** — 50+ engines, complex architecture. Most users want simple journaling + good memory. The cathedral was built before the church.
3. **No users** — Zero external validation. The system may be technically impressive but practically inaccessible.
4. **Backend doesn't reliably start** — Multiple ESM import errors were discovered and fixed. There may be more.

---

## Tier 1 — Make the Core Loop Reliable (This Week)

These are the things that make everything else possible.

### 1. Validate end-to-end chat works
- [ ] Backend starts cleanly (`npm run dev:server` with zero errors)
- [ ] Frontend connects to backend
- [ ] A logged-in user can send a message and get a real AI response
- [ ] Mode router correctly identifies normal conversation vs explicit log commands
- [ ] Messages are saved to Supabase

**Test command:** `npm run smoke` and `npm run validate`

### 2. Narrative Integrity — Fix Active Bugs
See `docs/architecture/NARRATIVE_INTEGRITY.md` for file-level specifics.

- [ ] Fix destructive memory invalidation in `omegaMemoryService.ts`
- [ ] Fix accusatory language in `contradictionDetector.ts`
- [ ] Rename `truthVerificationService` → `narrativeConsistencyService`

### 3. Backend Startup — Fix Remaining ESM Errors
The Personal Strategy Engine training job fails to register on startup (one remaining import error deep in the training cluster). Non-blocking currently, but needs to be fixed.

---

## Tier 2 — Make It Feel Alive (This Month)

### 4. Memory Confirmation UI
When the AI stores something from a conversation, show a small "Remembered: X" indicator. Without this, users assume the memory isn't working.

### 5. "What do you know about me?" Page
A read-only view where the AI summarizes everything it knows — characters, key events, pinned memories, personality profile.

See `docs/roadmap/IDEAS.md#memory-explorer`.

### 6. Session Memory
After a conversation ends, auto-generate a 3-5 sentence summary and store it. Inject the last 3 summaries as context on next session. Gives the AI "episodic memory" across sessions without blowing token budgets.

### 7. Onboarding Flow
3 steps: (1) tell the AI your name and what you're working on, (2) add one character, (3) first real chat exchange.

---

## Tier 3 — Technical Quality

### 8. TypeScript Cleanup
- 416 frontend TS errors, 571 backend TS errors (all pre-existing, tracked by `npm run validate`)
- These don't block the server (tsx ignores them) but represent type safety debt
- Prioritize: fix errors in files you're actively modifying

### 9. Test Coverage
Current: ~80% backend tests passing, minimal frontend tests.
See `docs/guides/TESTING.md` for specifics.

### 10. RAG Performance
The RAG packet building fetches characters, locations, chapters, timeline, relationships, interests, workout events on every single message. This is expensive and noisy. See `docs/guides/RAG_GUIDE.md` for optimization plan.

---

## Tier 4 — When Core Loop Works

- Deploy backend (Railway or Render)
- Voice input
- Import from anywhere (Google Docs, Notion, Discord)
- Export your lore
- Public demo / hosted version

---

## What NOT to Build Right Now

- More engines (there are already 50+)
- More routes (there are already 25+)
- The Epistemic Lattice / formal proof system
- Enterprise features
- Subscription/billing improvements

**Focus:** Chat → Remember → Recall. Everything else is downstream of that working reliably.
