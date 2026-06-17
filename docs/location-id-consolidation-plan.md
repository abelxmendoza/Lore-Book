# Location ID Consolidation Plan (Phases 3–5)

Status: Location Authority Consolidation Sprint — canonical decision + the precedence fix (shipped) + consistency path.
Companions: [location-authority-audit.md](location-authority-audit.md), [location-merge-fix-report.md](location-merge-fix-report.md), [location-domain-health-report.md](location-domain-health-report.md).

## Phase 3 — Canonical ID decision

**Decision: `locations.id` is the single canonical location authority.**

| Candidate | Pros | Cons |
| --- | --- | --- |
| **`locations`** ✅ | Purpose-built location table; has `normalized_name`, `type`, `metadata`, importance; already the authority for `/duplicates`, `/merge`, `PATCH`, `facts`, suggestions; has merge/dedup machinery | Not every place mention has a row yet (8 canonical-only, 3 orphan places) |
| `people_places` | Higher row count (52); captures raw mentions | Mixed people **and** places in one table; no location-specific fields; not consumed by any write path; would require rewriting merge/duplicates/PATCH to point at it (more churn, wrong direction) |

Choosing `people_places` would mean re-pointing every consumer at a people+places mega-table — the opposite of "reduce complexity." `locations` is already where all writes converge; make the **read** path agree.

**Migration impact:** none structural. No new tables. The work is (a) make `listLocations` emit `locations.id`, (b) ensure every place has a canonical row (promote orphans), (c) extend the resolver to the remaining consumers.

## Phase 4 — Fix `listLocations` precedence (SHIPPED)

Root behaviour: `upsertLocation` accumulates by normalized name; people_places was processed before canonical locations, and the id-overwrite guard only replaced synthesized `location-<slug>` ids — so a people_places id **won** over the canonical `locations.id`.

Fix ([locationService.ts](../apps/server/src/services/locationService.ts) `upsertLocation`): canonical rows (`source === 'registry'`) now **always** win the id:

```ts
const isCanonical = source === 'registry';
if (fixedId && (isCanonical || existing.id.startsWith('location-'))) {
  existing.id = fixedId;   // canonical locations.id is authoritative
}
```

Requirement satisfied:
- **Canonical row exists → emit `locations.id`.** ✅
- **Canonical row missing → fallback entity id allowed.** ✅ (people_places id; merge resolver promotes it)
- **No synthesized ids leak when a canonical row exists.** ✅

### Validation (founder, live)
`listLocations` emitted **16 cards**:

| id type | count | mergeable? |
| --- | --- | --- |
| canonical `locations.id` | **13** | ✅ directly |
| people_places id (orphan fallback) | 3 | ✅ via Phase-1 resolver (promote/map) |
| synthesized `location-*` | **0** | — |

Before the fix the same Book emitted mostly people_places ids. Named places now resolve to canonical: Abuelas House, First Street Pool, Costco, Club Metro (anniversary) → `CANONICAL`.

## Phase 5 — ID consistency (one id, every operation)

Target: list → select → edit → merge → delete → duplicate-review all use the **same** id.

| Operation | Status |
| --- | --- |
| list → select | ✅ Book now emits `locations.id` (13/16; 3 orphan fallbacks) |
| merge | ✅ resolver accepts any id, operates on `locations.id` |
| duplicate review | ✅ already `locations.id` |
| edit (`PATCH /:id`) | ⚠️ still `locations.id`-only — fails on the 3 orphan fallback ids |
| facts (`GET /:id/facts`) | ⚠️ same as PATCH |
| delete (via merge) | ✅ |
| episode references | ⚠️ verify `resolvedLocationIds` = `locations.id` |

### Remaining steps to full consistency (small, no new tables)
1. **Promote the 3 orphan places** to canonical `locations` rows (one-time backfill: insert a `locations` row for each `people_places` place lacking a normalized-name match). Removes the only non-canonical ids the Book emits → list becomes 100% `locations.id`.
2. **Reuse `resolveCanonicalLocationId`** in `PATCH /:id` and `GET /:id/facts` (extract it to a shared helper) so edit/facts tolerate any id during the transition.
3. **Confirm ingestion** writes `locations.id` into chat-message `location_ids` (the source of episode `location_ids`), so episode→location joins use the same authority.

## Safe rollout order
1. ✅ Phase 1 merge resolver (tolerate drift today).
2. ✅ Phase 4 precedence (stop emitting mixed ids).
3. Backfill orphan places → canonical rows (idempotent; reversible).
4. Extend resolver to PATCH/facts; verify ingestion.
5. Once the Book is 100% canonical and consumers all resolve, the resolver becomes a no-op safety net — **no compatibility layer left behind.**

No new tables introduced; net effect is **fewer** id spaces in play.
