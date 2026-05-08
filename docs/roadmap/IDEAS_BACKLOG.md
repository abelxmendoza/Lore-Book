# Ideas Backlog — Cool But Not Core-Loop Critical

Good ideas. Build them after the core loop (chat → remember → recall) is solid and trusted.

---

## Voice Input

**Why it's good:** For a lore-keeping app, voice is the natural capture mode. You're at a show, something happens, you want to capture it without typing.

**Implementation path:** Web Speech API (free, built into Chrome/Safari) → pipe transcribed text into the normal chat flow. No backend changes needed.

**Effort estimate:** 2–3 days. The input surface changes; everything downstream stays the same.

**Why it's backlog:** The text chat doesn't work reliably yet. Fix that first.

---

## Calendar Integration

**Design exists:** See `docs/archive/CALENDAR_INTEGRATION.md`

OAuth with Google/Apple Calendar → import events → enrich memory with scheduled context. "On Nov 3rd you had a meeting with X" becomes available as a memory source.

**Why it's backlog:** Requires OAuth flow, a third-party dependency, and careful handling of what gets ingested. Nice-to-have.

---

## Photo Integration

**Design exists:** See `docs/archive/PHOTO_INTEGRATION.md`

Photo upload → OCR/EXIF metadata extraction → entity linking → timeline entry. "Here's a photo from that show in Austin" becomes a memory anchor.

**Why it's backlog:** Requires storage (S3/Supabase Storage), OCR pipeline, and image processing. High infrastructure cost for v1.

---

## Import From Anywhere

People have lore scattered across Google Docs, Notion, old journals, Discord messages, Twitter DMs. A "paste anything, I'll extract what matters" feature would immediately give new users a reason to trust the memory system — they can bootstrap it with existing notes.

**Why it's backlog:** Parser robustness is tricky. A rough implementation would create more noise than value. Better to build it right when the extraction quality is solid.

---

## Export Your Lore

A JSON or Markdown export of all memories, characters, events, and chapters. Builds user trust ("I can leave any time"), reduces churn anxiety, and makes the system feel less like a black box.

**Why it's backlog:** Low risk, low urgency. The data is in Supabase — an export endpoint is a day of work. Not urgent until you have real users who care about their data portability.

---

## Admin Console Features

**Design exists:** See `docs/archive/ADMIN_FEATURES.md`

Planned features:
- System health dashboard (server uptime, DB connection pool, cache hit rates)
- Enhanced user management (bulk actions, activity timeline, impersonation)
- Background job monitor (live status of all cron jobs)
- Error log viewer (filterable with stack traces)
- Memory and lore analytics (per-user activity, feature usage rates)

**Why it's backlog:** No users yet. An admin console for zero users is overhead with no return.

---

## RL-Based Recommendation Personalization

**Design exists:** See `docs/archive/REINFORCEMENT_LEARNING_RECOMMENDATIONS.md`

The chat persona RL is implemented (contextual bandits for persona selection). The next layer would be RL for *what kind of memory prompt to surface* — learning which recommendation types (goal check-in, pattern observation, memory recall) work for each user.

**Why it's backlog:** The RL infrastructure exists but it needs real user signal to train. No users = no training data = premature.

---

## Model Fine-Tuning

**Infrastructure exists:** `services/activeLearning/trainingDataCollector.ts` is collecting correction data. The data is ready.

What's missing is the training pipeline itself (OpenAI Fine-Tuning API, or local transformers). This would meaningfully improve entity extraction and sentiment accuracy for individual users.

**Why it's backlog:** Cost and infrastructure. Fine-tuning is expensive at small scale. Worth it at 100+ active users per user.

---

## LoreKeeper Narrative Compiler (LNC)

**Design exists:** `docs/guides/LNC_V0.1_SPECIFICATION.md`, `docs/guides/LNC_DEVELOPER_GUIDE.md`

The LNC is a compiler that turns conversation into a structured AST — NarrativeAtoms, compile-time epistemic type checking, formal grammar for life events. A genuinely interesting piece of architecture.

**Why it's backlog:** It's a PhD-level abstraction for a v1 product. The biography system works without it. Build it when the simpler version starts showing cracks.

---

## Epistemic Lattice / Formal Proof System

**Design exists:** `docs/architecture/EPISTEMIC_LATTICE.md`

A formal proof system for belief propagation — tracking how beliefs propagate through the knowledge graph and when they can be considered "proven" by accumulated evidence.

**Why it's backlog:** Academically interesting, practically unnecessary for v1. The current confidence scoring and belief lifecycle tracking serves the same purpose with 10% of the complexity.

---

## Enterprise Features

From `docs/archive/ENTERPRISE_IMPROVEMENTS.md`:
- SSO/SAML integration
- Team/organization accounts
- Role-based access control
- Compliance exports (SOC2, GDPR audit trails)
- White-label deployment

**Why it's backlog:** Zero users. Enterprise before product-market fit is the wrong order.
