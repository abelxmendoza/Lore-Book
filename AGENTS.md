# LoreBook agent guidance

This file is the checked-in rule layer for humans and coding agents working in
this repo. Treat local IDE “memories” (Cursor/Codex) as a helpful recall layer —
**not** as the only source for rules that must always apply.

## Always apply

- Founder privacy: follow `.cursor/rules/no-founder-pii.mdc`. Never commit founder
  emails, the founder UUID, or blocked personal lore strings in apps/ or scripts/.
- Prefer synthetic fixtures (`Vanguard Robotics`, `Marcus` / `Jamie`, `MemoVault`).
- Do not commit secrets (`.env`, tokens, service-role keys).
- Only create git commits / PRs / production deploys when the user explicitly asks.
- Prefer small, focused diffs; match existing style; no drive-by refactors.

## Memory philosophy (product)

LoreBook is a **life memory system**, not a chat-summary memory bolt-on.

| Concept | LoreBook name | Where it lives |
| --- | --- | --- |
| Durable recall into future turns | Living Memory (use) | Working Memory Assembler, canon facts |
| Propose durable facts from a turn | Living Memory (write) | Ingestion → Memory Review Queue |
| Ambient external → memory | Life Chronicle | Chat, journal, X intake, Life Log |
| User governance | Memory Review / Privacy | Discovery + Privacy surfaces |

Full mapping: [`docs/product/living-memory-and-life-chronicle.md`](docs/product/living-memory-and-life-chronicle.md).

### Product invariants

1. Provenance over vibes — claims cite evidence; do not invent biographical detail.
2. Review before canon for high-risk writes (MRQ is the trust choke point).
3. No screen-recording Chronicle — ambient intake is opt-in life sources only.
4. Working Memory is assembled per turn and discarded; it is not a second database.
5. User controls (`useLivingMemory`, `writeLivingMemory`, `ambientCapturePaused`)
   must be respected on chat and integration paths.

## Architecture pointers

- Core loop / modes: `docs/architecture/`
- Working Memory: `docs/working-memory-assembler.md`
- Continuity maturation: `docs/runtime/continuity-maturation-roadmap.md`
- LoreBook vs ChatGPT: `docs/lorebook-vs-chatgpt-v2.md`

## Deploy reality

- Frontend production: Vercel Git integration → `lorebookai.com`
- Backend production: Railway → `lore-book-production.up.railway.app`
- Smoke: `npm run smoke:health:prod`
- GitHub `deploy.yml` may skip Vercel CLI if secrets are unset; Git deploy still ships.
