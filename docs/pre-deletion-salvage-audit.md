# Pre-Deletion Salvage Audit

> **Policy:** Do not drop tables, delete services, or remove routes until each row in this
> document is **re-read**, **grep-verified**, and marked **SAFE** with a merge/salvage plan.
> Script consolidation already removed duplicate *runners*; this gate applies to **schema and
> application code**.

**Last verified:** 2026-06-18 (post script-consolidation sprint)

---

## 0. Corrections to Phase 0 assumptions

The consolidation report (`docs/architecture-consolidation-report.md`) listed several items as
"dead schema." Re-verification against `apps/server/src` shows **some are still wired**:

| Candidate | Report said | Actual (2026-06-18) | Safe to drop? |
|---|---|---|---|
| `omega_relationships` | No writers | **Redirected (2026-06-18)** — merge + summary + audit now use `character_authority_map` / `character_relationships`. Table may still exist in DB; **do not DROP** until migration + prod verification. | **NO** (schema drop) — app refs cleared |
| `entity_canonical_map` | Zero app writers/readers | Only migration seed + `migration-drift-baseline.json` | **YES** (schema-only) |
| `timelines_v2` | No migration | **No Supabase migration**, but **live code**: `timelineV2.ts`, `/api/timeline-v2`, web `TimelinePageV2`, hooks, tests | **NO** — redirect or add migration; do not delete UI/routes blindly |
| `social_edges` | Retire | **Active writes/reads** in `socialStorage.ts` | **NO** |
| Chronology V1 | Retire | **Active**: `routes/chronology.ts`, `chronologyWorker`, `contextAggregator`, recommendation generators | **NO** |
| `people_places` | Retire after migration | **50+ references** across WMA, RAG, authority, merge, diagnostics | **NO** — run salvage script first |

---

## 1. Salvage already consolidated (scripts)

These former one-off scripts were merged; logic preserved in:

| Former | Consolidated into | Salvage status |
|---|---|---|
| `fixEntityQuality`, `promoteOrphanLocations`, `reExtractEntities` | `cleanupLegacyEntities.ts` | **Run `promote-locations` before table drop** |
| 4× migration runners | `migrate.ts` + `migrationRunner.ts` | Behavior preserved |
| 3× scoring backfills | `backfill-scores.ts` | Behavior preserved |
| ~13 audit scripts | `audit.ts` + `audits/*` | Behavior preserved |
| `chatMemoryUtilizationAudit` (src copy) | Removed duplicate; canonical in `audits/wma/` | OK |

**Not deleted (intentionally kept):** `true-mvp-diagnostic.ts`, root orphan/entity-fact audits,
`run-base-migrations.sh`, populate/dummy seeders, `generate*` foundation scripts.

---

## 2. Per-candidate gate checklist

Each candidate must pass all gates before a drop migration:

1. **Grep** — `rg '<table>' apps/server apps/web scripts` (exclude docs/migrations)
2. **Salvage** — useful logic copied or redirected to canonical store
3. **Data migration** — one-off script run in prod/staging with dry-run
4. **Tests** — unit/integration/e2e for redirect path
5. **Migration** — `DROP TABLE` only after 1–4

### 2.A `entity_canonical_map` — **drop migration ready**

| Gate | Status | Notes |
|---|---|---|
| App readers/writers | ✅ None in `src/` | Superseded by `character_authority_map` |
| Salvage | N/A | Migration seed only; no runtime logic to merge |
| Merge target | `character_authority_map` | Active authority bridge |
| Migration | ✅ `20260618130000_drop_entity_canonical_map.sql` | Drops table + RLS policy only; keeps `entity_mentions.canonical_entity_id` |
| Prod row count (2026-06-18) | **0 rows** | Safe to apply; seed INSERT never populated live data |
| **Verdict** | **Apply migration in staging → prod** | Do not remove create migration `20260529000008` from history |

### 2.B `omega_relationships` — **app redirect complete; schema drop gated**

| Gate | Status | Notes |
|---|---|---|
| Readers | ✅ Redirected | `omegaMemoryService.summarizeEntity`, `memoryCoverageAudit` → `character_relationships` + authority map |
| Writers | ✅ Redirected | `mergeEntities` relinks `character_authority_map` instead of UPDATE on legacy table |
| **Salvage plan** | ✅ Done in code | `characterAuthorityService.resolveByOmegaEntity` + `character_relationships` |
| **Verdict** | **Do not DROP table yet** | Run prod grep + optional row-count check; then drop migration |

### 2.C `timelines_v2` — **broken but wired**

| Gate | Status | Notes |
|---|---|---|
| DB table | ❌ No migration in `supabase/migrations/` | Runtime errors if route hit |
| Code | ❌ Full stack wired (server route + web UI + tests) | |
| **Salvage plan** | Option A: add migration + keep feature. Option B: redirect `/api/timeline-v2` to `chronology_index` / `life_arcs` read model, then deprecate UI | |
| **Verdict** | **Do not delete** — fix or redirect first |

### 2.D `people_places` — **largest migration**

| Gate | Status | Notes |
|---|---|---|
| References | ❌ ~50 files | WMA, RAG, authority, registry, merge services |
| Salvage script | ✅ `cleanupLegacyEntities.ts` | `promote-locations`, `fix-quality`, `reextract` |
| **Required before drop** | 1) `promote-locations --all-users` 2) Redirect readers to `characters`/`locations` 3) Stop writes in `peoplePlacesService` 4) Drop table | |
| **Verdict** | **Phase 1+** — not Phase 0 |

### 2.E Chronology V1 vs V2

| System | Status | Verdict |
|---|---|---|
| V1 (`services/chronology/chronologyEngine`) | Active routes + workers | **Remain** until V2 parity proven |
| V2 (`chronologyV2/chronologyService`, `chronology_index`) | Active; `backfill-chronology-index.ts` targets this | **Keep path** |

---

## 3. Recommended sequence (no deletions until gated)

### Step 1 — Reference guard (done in CI)

Static test `tests/architecture/preDeletionReferences.test.ts` fails if forbidden tables
gain new references in `apps/server/src` without allowlist update.

### Step 2 — Safest schema drop (migration created)

Migration **`20260618130000_drop_entity_canonical_map.sql`** drops the dead bridge table.
Apply via `npm run migrate` / Supabase CLI after staging review. Does **not** drop
`entity_mentions.canonical_entity_id` (still used by graph retrieval).

### Step 3 — `people_places` data migration (dry-run logged 2026-06-18)

Dry-run against live Supabase (`.env`):

```
Users scanned: 1
Users with orphans: 1
Orphan places found: 1
Would promote: 1  — "Love" (people_places id 3d71202d-…)
```

Execute when ready (non-dry-run):

```bash
cd apps/server
npx tsx src/scripts/cleanupLegacyEntities.ts promote-locations --all-users
```

### Step 4 — Redirect `omega_relationships` reads ✅ (2026-06-18)

- `omegaMemoryService` merge + summary → `character_authority_map` / `character_relationships`
- `memoryCoverageAudit` → authority map + `character_relationships`
- App refs cleared; **table DROP still gated** (prod row-count check)

### Step 5 — `timelines_v2` decision

Product choice: ship migration vs retire UI. Cannot drop code until decision made.

### Step 6 — Entity store unification (Phase 1)

Follow consolidation report Phase 1 — merge onto `characters` spine with `character_authority_map`.

---

## 4. Commands reference (consolidated tooling)

```bash
# Migrations
npm run migrate -- base|ontology|file <path>

# Scoring backfill
npx tsx scripts/backfill-scores.ts all --user <email>

# Legacy people_places cleanup
cd apps/server && npx tsx src/scripts/cleanupLegacyEntities.ts promote-locations --dry-run --all-users

# Audits
cd apps/server && npx tsx scripts/audit.ts wma|story|episodes|integrity

# Regression tests
cd apps/server && npm run test:scripts && npm run test:audits
```

---

## 5. Sign-off before any DROP

- [x] Row re-grep'd on current branch (`entity_canonical_map`, `omega_relationships` app refs)
- [x] Salvage script dry-run logged (`promote-locations --dry-run --all-users`, 1 orphan)
- [x] Redirect PR merged + tests green (`omega_relationships` redirect)
- [ ] Stakeholder sign-off on data loss scope (`entity_canonical_map` seed rows)
- [ ] Supabase migration reviewed + applied in staging (`20260618130000_drop_entity_canonical_map.sql`)
