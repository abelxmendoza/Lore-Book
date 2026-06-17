# API Canonical Map

**Status:** Active consolidation (additive only — legacy routes are **not** deleted).  
**Last updated:** 2026-06-17

## Principle

Every legacy mount stays registered. New canonical mounts delegate to the same services. Deprecated mounts return `Deprecation`, `Link`, and `Sunset` headers (see `apps/server/src/middleware/deprecation.ts`).

## Canonical → Legacy

| Canonical (use this) | Legacy (still works) | Notes |
| -------------------- | -------------------- | ----- |
| `GET /api/books/:domain` | Multiple book endpoints | BFF one-call loads |
| `GET /api/memory/*` | `/api/omega-memory`, `/api/memory-recall` | Claims, recall, coverage |
| `GET /api/governance/*` | `/api/contradictions`, `/api/contradiction-alerts`, `/api/belief-reconciliation` | Unified governance |
| `GET /api/chat-threads/health` | `GET /api/diagnostics/thread-health` | Chat durability |
| `POST /api/chat-threads/health/repair` | `POST /api/diagnostics/thread-health/repair` | Thread repair |
| `GET /api/narrative/theme-threads` | `GET /api/threads` | Saga/arc theme threads (not chat threads) |
| `GET /api/timeline-v2/chronology/*` | `GET /api/chronology/*` | Nested under timeline v2 |
| `GET /api/timeline-v2/hierarchy/*` | `GET /api/timeline-hierarchy/*` | Nested under timeline v2 |
| `POST /api/search` (`mode`) | `/api/search/universal`, `/api/memory-recall/query` | `mode=universal` or `recall` |
| `POST /api/inference/sync` | Per-book refresh calls | Cross-book orchestrator |

## Books BFF

| Route | Replaces (partially) |
| ----- | -------------------- |
| `GET /api/books/characters` | `/api/characters/list` + `/api/characters/duplicates` + `/api/counts` |
| `GET /api/books/locations` | `/api/locations` + `/api/locations/suggestions` |
| `GET /api/books/projects` | `/api/projects` + `/api/projects/duplicates` + suggestions |
| `GET /api/books/skills` | `/api/skills` + `/api/skills/suggestions` |
| `GET /api/books/family` | `/api/family/summary` |
| `GET /api/books/discovery` | Contradictions + revealed-self summary |

Response shape: `{ success, data, ...legacyKeys }` via `sendSuccessDual`.

## Inference orchestrator domains

`POST /api/inference/sync` runs T1 by default; `tier=t2` adds heavy rescan domains.

| Domain | Tier | Purpose |
| ------ | ---- | ------- |
| `graph_recovery` | T1 | Relationship/event graph backfill |
| `locations` | T1 | Location normalization |
| `organizations` | T1 | Org normalization |
| `public_figures` | T1 | Public figure inference |
| `social_standing` | T1 | Social standing recompute |
| `character_importance` | T1 | Character importance scores |
| `achievements_check` | T1 | Achievement unlock check |
| `projects_suggestions` | T1 | Warm projects suggestion index |
| `skills_suggestions` | T1 | Warm skills suggestion index |
| `quests_suggestions` | T1 | Warm quests suggestion index |
| `character_rescan` | T2 | Full character conversation rescan |
| `relationship_classify` | T2 | Entity fact classification backfill |
| `essence_profile` | T2 | Essence profile extraction |
| `romantic_rescan` | T2 | Full romantic lexical rescan |

## Chat vs theme threads

| System | Canonical API | Purpose |
| ------ | ------------- | ------- |
| **Chat threads** | `/api/conversation/threads/*` | Message persistence, SSE chat |
| **Theme threads** | `/api/narrative/theme-threads/*` | Saga/arc memberships in timeline hierarchy |

These are **different concepts** — do not merge.

## Next steps (no deletions until reviewed)

1. Migrate web clients to `/api/books/*` and `/api/memory/*`
2. Add OpenAPI generation from `routeRegistry.ts`
3. Introduce `/api/v1` prefix for external API
4. After 90-day sunset window, **review** legacy mounts for removal (not automatic)

See also: [api-consolidation-roadmap.md](./api-consolidation-roadmap.md), [api-inventory.md](./api-inventory.md).
