# Temporal Intelligence Audit (Phase 1–2)

Status: Temporal Intelligence & Event Date Resolution Sprint — audit + canonical model.
Note: temporal **query routing** is already in progress — `apps/server/src/services/temporal/temporalQueryService.ts` defines TODAY/YESTERDAY/THIS_WEEK/THIS_MONTH/TIME_RANGE/TEMPORAL_COMPARISON/TIMELINE query types (Phase 4 substantially landed). This doc covers Phase 1 (where occurrence time is confused with write time) and Phase 2 (the canonical model), and lists the ordering fixes Phases 6–7 need.

## Phase 1 — Where `created_at` proxies occurrence time

Occurrence columns **already exist** on every relevant table — the bug is that retrieval/timeline/synthesis often ignore them:

| Table | Occurrence column | Write column |
| --- | --- | --- |
| `resolved_events` | `start_time` | `created_at` |
| `event_records` | `event_date` (+ `event_date_end`) | `created_at` |
| `character_timeline_events` | `event_date` | `created_at` |
| `episodes` | `start_at` (+ `end_at`) | `created_at` |
| `journal_entries` | `date` | `created_at` |

### Misuse sites (sort/group by write time instead of occurrence)
| Location | Issue | Fix |
| --- | --- | --- |
| `services/timelineV2.ts:19` | timeline ordered by `created_at` | order by occurrence (`start_time`/`event_date`/`date`), `created_at` fallback |
| `services/timeline/timelineSyncService.ts` (×6: 245,281,358,439,462,499) | sync/order by `created_at` | occurrence-first ordering |
| `services/eventRecoveryService.ts:107` | events fetched ordered by `created_at` | order by `start_time` |
| `services/chat/memoryRetriever.ts:92`, `contextAwareMemoryRetrieval.ts:221` | recall ordered by `created_at` | occurrence-first for event/episode rows |
| `services/chat/workingMemoryAssembler.ts:924,938` | journal/chat ordered by `created_at` | use `journal_entries.date` for episodes |

### The pattern that's already correct (propagate this everywhere)
`services/continuityRuntime/arcs/dayOccasionService.ts:401`:
```ts
const sortTime = m.date ?? m.created_at;   // occurrence first, write time fallback
```
This is the canonical ordering rule. It exists in one place; it must become universal.

## Phase 2 — Canonical temporal model

Every memory/event carries:

```
event_occurred_at            timestamptz   -- when it actually happened
event_occurred_at_precision  text          -- EXACT | DAY | WEEK | MONTH | YEAR | APPROXIMATE | UNKNOWN
time_source                  text          -- USER_EXPLICIT | USER_APPROXIMATE | EXTRACTED | INFERRED | SYSTEM
created_at                   timestamptz   -- when it was written down (immutable)
updated_at                   timestamptz
```

Mapping onto today's columns (no big-bang rename — adopt a resolver):
- `occurredAt(row) = row.event_occurred_at ?? row.start_time ?? row.event_date ?? row.date ?? row.start_at ?? row.created_at`
- precision/source default to `UNKNOWN`/`SYSTEM` until the extraction engine (Phase 3) populates them.

Examples (from the brief):
- "I went to Club Metro on June 12" → occurred_at=2026-06-12, precision=DAY, source=USER_EXPLICIT
- "Last weekend I saw Ashley" → occurred_at=inferred weekend, precision=APPROXIMATE, source=USER_APPROXIMATE

## Phase 6 — Timeline authority (the one rule)

**Authoritative ordering = occurrence time, with `created_at` as fallback only.** A single helper `occurredAt(row)` (above) must back every timeline/episode/arc sort. Replace the misuse sites in the Phase 1 table with it.

## Phase 7 — Story intelligence

Arcs, episodes, chapters, and the life story must group by `occurredAt`, never `created_at`. **A memory written today about 2018 belongs in 2018.** Episode `start_at`, arc `start_date`, chapter `start_date` already exist; synthesis must read those, not row creation time.

## Phase 5 — Retrieval scoping (guardrails for TODAY/YESTERDAY)

`TODAY_QUERY` (etc.) must filter `occurredAt BETWEEN start-of-day AND end-of-day` over events/episodes/journal/chat, and **exclude** biography, skills, goals, relationships, identity summaries unless their `updated_at` falls in range. This prevents the "what did I do today → old events / biography leakage" failures.

## Remaining work (Phases 3,5,6,7,8 implementation)
- Phase 3: date-extraction engine (absolute/relative/range) storing `{ resolved_date, original_phrase, precision, source }`. Partially implied by `temporalQueryService`; needs the extractor on ingestion.
- Phase 5/6/7: apply `occurredAt()` ordering at the misuse sites; scope temporal queries; future-date guard (never return `occurredAt > now`).
- Phase 8: validation suite ("what did I do today/yesterday/in May" → only that window; no future/biography/identity leakage).

These touch the retrieval files currently under active edit (`chat.ts`, `contextScoringService`, `ragBuilderService`, `systemPromptBuilder`) — coordinate to avoid conflicts; the `occurredAt()` helper + the misuse-site table above are the concrete checklist.
