# Dead Code — Last 48 Hours

Date: 2026-06-16 · Audit only. Scope: code created/touched in recent commits (ad9fd1d → 41e089f). "Dead" = zero non-test, non-self callers (grep-verified).

## Disposition

### SAFE DELETE (zero callers, no behavioral impact)
| Item | Path | Evidence |
|---|---|---|
| `episodeSegmentationCore` (+ test) | `services/conversationCentered/episodeSegmentationCore.ts` | 0 non-self refs; no `episodes` table; "consolidating core" never wired |
| `entityResolutionCore` | `services/entities/entityResolutionCore.ts` | 0 refs; duplicate of the live `entityResolutionService` (6 refs) + `omegaMemoryService.resolveEntities` |
| `billing/pricing.ts` | `services/billing/pricing.ts` | 0 importers since `billingRouter` deletion |

### NEEDS WIRING (built + correct, but only reachable manually — not dead, not live)
| Item | Current reach | To make live |
|---|---|---|
| `entityPollutionRepair` | `diagnostics.ts` endpoint only | call from ingestion or a scheduled job |
| `threadRecoveryService` / `threadDurabilityChecks` | `diagnostics.ts` endpoints only | wire to a periodic durability sweep |
| `threadIntelligence` fields `projects` / `episodes` / `open_loops` | rendered, never populated | feed producers (episodes need segmentation wired first) |
| recovery services (relationship/event) | **now wired live** via `graphRecoveryTrigger` (883d947) | ✅ already done |

### NEEDS REWRITE / RECONCILE
| Item | Issue |
|---|---|
| `migrations/` vs `supabase/migrations/` | partially duplicated migration trees → drift risk (the schema-drift bug came from here). Reconcile to one source of truth. |
| `lifeReconstructionAudit.ts` (two copies: `apps/server/scripts/` and `apps/server/src/scripts/`) | duplicate audit scripts in two locations |

## DB dead weight (created/aggravated, from advisors)
- **5 duplicate indexes** (`extracted_units`, `locations`, `resolved_events`, `skills`, `utterances`) — drop one of each.
- **~200 unused indexes** — review/drop; they tax every write.

## Removable estimate
- **Immediate safe:** ~350 LOC (3 files) + the `billing/` directory + 5 duplicate indexes.
- **After wiring decisions:** the diagnostics-only services either get wired or stay as ops tools (not deletable — they have value as manual recovery).

## Note on "dead" vs "manual"
Most of Composer's recent output is **not dead — it's manual-only** (reachable via `/api/diagnostics`). That's a legitimate ops pattern, but it must not be counted as "live runtime." Only the 3 SAFE-DELETE items are genuinely dead.
