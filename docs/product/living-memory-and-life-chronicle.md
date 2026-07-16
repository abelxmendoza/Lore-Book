# Living Memory & Life Chronicle

Date: 2026-07-16

Purpose: map ChatGPT/Codex **Memories** and **Chronicle** concepts onto LoreBook’s
life-graph product — without copying their UX, storage model, or screen-capture
risks.

---

## Principle

ChatGPT Memories are a helpful recall layer for a chat product.  
LoreBook *is* the memory product.

Required rules that must always apply stay in checked-in docs (`AGENTS.md`,
architecture contracts, privacy rules). User-facing Living Memory is a control
surface over durable life evidence — not the source of truth for product policy.

---

## Concept map

| ChatGPT / Codex idea | LoreBook native name | Existing substrate | Product surface |
| --- | --- | --- | --- |
| Durable chat memories injected later | **Living Memory** (use) | Working Memory Assembler, canon facts, recall engine | Chat answers; Continuity |
| Generate memories from a finished task | **Living Memory** (write) | Ingestion → Memory Review Queue → journal / claims | Discovery → Memory Review |
| Review / edit / forget memories | **Memory Review & Corrections** | MRQ, correction dashboard, privacy delete/redact | Discovery → Review / Fixes |
| Per-task “use / don’t generate” | **Thread memory stance** (planned) | Mode router + ingestion gates | Chat thread menu |
| Chronicle (ambient screen → memory) | **Life Chronicle** (ambient intake) | Chat episodes, journal, X/Twitter sync, Life Log, Project Chronicle | Integrations + Life Log |
| Pause Chronicle | **Pause ambient capture** | Living Memory prefs + per-source intake modes | Discovery → Living Memory |
| Memories as unencrypted local files | **User-owned life graph** (server, provenanced) | Episodes, claims, entities, timeline | Memory Explorer, Timeline, Saga |
| Consolidation across tasks | **Continuity + consolidation** | Continuity runtime, duplicate consolidator, biography | Continuity Intelligence |

---

## How LoreBook differs (on purpose)

1. **Evidence over summary** — we store episodes and claims with provenance, not
   opaque chat summaries.
2. **Review before canon** — high-risk writes go through Memory Review; ambient
   sources default to conservative / ask-first modes.
3. **No screen recording Chronicle** — ambient intake is *opt-in life sources*
   (chat, journal, connected X, Life Log), never macOS screen capture.
4. **Working Memory is assembled, not persisted** — each turn builds a bounded
   packet; Living Memory prefs decide whether life evidence may enter that packet
   and whether the turn may propose new durable writes.
5. **Privacy is the license** — pause ambient, reject proposals, export, redact.

---

## Living Memory controls (user-facing)

Stored on the user profile as `metadata.living_memory`:

| Key | Default | Meaning |
| --- | --- | --- |
| `useLivingMemory` | `true` | Allow life-graph evidence into Working Memory / recall for chat |
| `writeLivingMemory` | `true` | Allow this session’s experiences to propose durable memory (MRQ / ingestion) |
| `ambientCapturePaused` | `false` | Pause Life Chronicle ambient intake (e.g. X sync → lore) |
| `externalContextWrites` | `true` | Allow writes originating from external/integration context |

These mirror Codex’s `use_memories` / `generate_memories` /
`disable_on_external_context` — named for a life product, not an agent IDE.

---

## Life Chronicle (ambient), not screen Chronicle

**In scope**

- Chat experiences the user chooses to share
- Journal / Life Log entries
- Connected social intake (X) with per-source lore intake mode
- Project Chronicle (product/founder milestones — internal ops surface)

**Out of scope (do not ship)**

- Continuous screen recording
- OCR of arbitrary desktop apps without explicit, per-source consent
- Silent memory generation from meetings or third-party chats

Prompt-injection risk still applies to any ambient text source (tweets, pasted
docs). Prefer review-first modes and never auto-promote high-risk claims.

---

## Where users manage this

1. **Discovery → Living Memory** — master toggles + links to Review / Continuity / X
2. **Discovery → Memory Review Queue** — approve, edit, defer, reject proposals
3. **Privacy & Security** — export, retention, account deletion
4. **Integrations (X)** — Link only / Balanced / Ask me first

---

## Agent / engineering note

Team guidance that must always apply belongs in `AGENTS.md` and checked-in docs.
Do not treat Cursor/Codex local memory files, Chronicle screen dumps, or chat
summaries as the authoritative rule set for LoreBook behavior.
