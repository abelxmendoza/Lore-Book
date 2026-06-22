# FEATURE REALITY REPORT

LoreBook's surface area is enormous relative to a pre-launch product. This is the
single biggest *strategic* risk: effort and reliability budget are spread across
many systems, most of which deliver no proven user value yet.

---

## By the numbers

- **~348 service directories/files** under `apps/server/src/services/`.
- **177 registered route groups** (`routeRegistry.ts`), classified by the codebase
  itself into tiers:

| Tier | Count | Meaning |
|---|---|---|
| `CORE_RUNTIME` | 91 | auth/chat/ingestion/entity/threads/continuity |
| `EXPERIMENTAL` | 79 | under development, **gated off** unless `ENABLE_EXPERIMENTAL_RUNTIME=true` |
| `ADMIN` | 4 | internal tooling |
| `RESEARCH` | 3 | exploratory |

The existence of this classification + the `ENABLE_EXPERIMENTAL_RUNTIME` gate is a
**major asset** — the team already has the mechanism to ship a small, trustworthy
core and hide the rest. Use it aggressively.

---

## Classification

### Production Critical (keep, harden)
- Chat stream + `omegaChatService` generation
- Ingestion pipeline + `omegaMemoryService` (entity/claim formation)
- Memory retrieval (`memoryRetriever`, RAG packet, working-memory assembler)
- Entity/identity (characters, organizations, locations canonical tables + merges)
- Auth, subscription/Stripe, onboarding/import
- **Response Compiler** (new) — grounding/provenance/contradiction + action chips

### Useful (surfaced, real value, secondary)
- Characters/Locations/Organizations/Projects "books"
- Timeline, family tree, relationship intelligence
- Corrections / memory review queue (trust surface)
- Continuity card / thread intelligence

### Experimental (gated off — keep off for launch)
- The 79 `EXPERIMENTAL` route groups: paracosm, inner-mythology, shadow-engine,
  dreams, RPG, alternate-self, revealed-preference, distortion, cognitive-bias,
  backward-storytelling, many "engine" surfaces, etc.

### Dead / Diagnostics-Only (resource cost, no user impact)
- Prior archaeology audit: **~48 dead server files** (Life-OS stratum: ~19 workers,
  paracosm, RPG).
- **Shadow/partial cores**: `entityResolutionCore` (shadow), `episodeSegmentationCore`
  (~75% real but unwired). These represent *fake progress* — they look done but
  don't run on the live path. Either wire `entityResolutionCore` (it's the
  recommended single resolve-before-write gate — high value) or delete the shadow.

---

## Systems that exist but are never surfaced
- Episode segmentation (table unapplied / unwired)
- Several "engine" routes registered but not consumed by the web app
- Inspector/diagnostics outputs (including the Response Compiler inspector) computed
  but not shown in any UI

## Systems consuming resources with no user impact
- Background fire-and-forget jobs on every message (memoir, lifestory, epiphany,
  group detection) — they cost LLM/DB on the hot path's tail for value that is not
  surfaced in a first session. Consider gating these behind explicit feature use or
  lower cadence.

---

## Recommendation
1. **Launch on `CORE_RUNTIME` only.** Keep `ENABLE_EXPERIMENTAL_RUNTIME=false`.
2. **Delete the ~48 dead files** (reduces audit surface, build, and confusion).
3. **Resolve the shadow cores**: promote `entityResolutionCore` to the real
   identity gate (P0 reliability win) or remove it.
4. **Stop paying for unsurfaced background jobs** per message until they earn their
   place via measured retention impact.
5. Treat the experimental tier as the post-launch backlog, not launch scope.
