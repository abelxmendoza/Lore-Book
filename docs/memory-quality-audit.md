# Memory Quality & Reality Gap Audit (Sprint AJ)

**Question answered:** Where does LoreBook still look smarter in demos than it does in reality?

**Scope:** Evidence gathering only. No fixes. No redesigns.

**Date:** June 2026

---

## Executive Summary

LoreBook's demo mode synthesizes intelligence layers (analytics, relationships, meaning, significance) that the real ingestion pipeline often does not populate. The UI computes or injects richness client-side, while real data frequently arrives sparse, defaulted, or unlinked. The gap is **most visible** in Events (meaning layer), Romantic Relationships (0.5 score clustering), and Character list cards (missing classification fields). Biography has a schema constraint drift risk. Overall demo experience ranks **Significantly worse → Misleading** for real users on Events and Relationships; **Noticeably worse** for Characters.

---

## AJ-1 — Character Reality Gap

### Audited surfaces

| Surface | Path |
|---|---|
| CharacterBook | `apps/web/src/components/characters/CharacterBook.tsx` |
| CharacterDetailModal | `apps/web/src/components/characters/CharacterDetailModal.tsx` |
| List API | `apps/server/src/routes/characters.ts` (`GET /list`) |
| Detail API | `apps/server/src/routes/characters.ts` (`GET /:id`) |
| DB schema | `supabase/migrations/20260610000001_characters_classification_columns.sql` |

### Field audit

| Field | Demo source | Real source | Population (real) | Default / fallback | Rating |
|---|---|---|---|---|---|
| `name`, `alias`, `summary` | `dummyCharacters` inline (~25 chars) | `characters` table | High when extracted | — | **Healthy** |
| `importance_level`, `importance_score` | Hardcoded in dummy data | DB columns; **omitted from list API** | Low–medium | `'minor'`, `0` | **Misleading** — demo shows scores; list API drops them |
| `proximity_level`, `has_met`, `relationship_depth` | `withFilterDefaults()` synthetic | DB nullable columns | Low | null | **Sparse** |
| `relationships[]` | `withDemoRelationships()` from metadata map | `character_relationships` join | Medium | empty array | **Sparse** — demo always has edges |
| `analytics` (closeness, trust, trend) | `withDemoAnalytics()` / `generateMockAnalytics()` | `characterAnalyticsService` on detail fetch | Medium on detail, often missing on list | synthesized from metadata scores in demo | **Misleading** on demo |
| `memory_count` | Dummy values 3–20 | `character_memories` count | Medium | 0 | **Healthy** when linked |
| `shared_memories[]` | Demo entries | `character_memories` join | Medium | empty | **Sparse** |
| Intelligence tab (chat) | `characterIntelligence.ts` mocks | `/api/characters/:id` + intelligence routes | Low | mock fallback in demo | **Mostly empty** real |
| Attributes / Facts tabs | `getMockAttributes()`, `getMockFacts()` | `/attributes`, `/facts` endpoints | Low | empty states | **Sparse** |
| Avatar | Demo URLs | `avatar_url` + backfill job | Low | placeholder | **Sparse** |

### Character Quality Report — ranked

| Rank | Category | Fields |
|---|---|---|
| **Healthy** | Core identity | name, alias, tags, memory_count (when linked) |
| **Sparse** | Classification | proximity_level, has_met, relationship_depth, context_of_mention |
| **Mostly empty** | Intelligence layer | dynamics, influence profile, scene candidates, knowledge claims |
| **Misleading** | List card richness | importance_score/level present in demo but absent from list API; analytics synthesized in demo |

### Critical API gap

`GET /api/characters/list` (lines ~964–1012) does **not** return `importance_level` or `importance_score`. `GET /api/characters/:id` (lines ~1265+) **does**. Demo dummy data includes both → filter chips and "By impact on me" sort appear broken on real data (see `docs/ui-audit-2026-06-11.md`).

---

## AJ-2 — Event Reality Gap

### Audited surfaces

| Surface | Path |
|---|---|
| EventsBook | `apps/web/src/components/events/EventsBook.tsx` |
| EventDetailModal | `apps/web/src/components/events/EventDetailModal.tsx` |
| Events API | `apps/server/src/routes/conversationCentered.ts` |
| Meaning tables | `supabase/migrations/20250324000132_mode_router_events.sql` |

### Field audit

| Field | Demo source | Real source | Population (real) | Rating |
|---|---|---|---|---|
| `title`, `date`, `people[]` | `generateMockEvents()` (60 events) | `resolved_events` | Medium | **Healthy** |
| `significance` (filter score) | Pre-filled impact + source_count | **Client-computed** from confidence, source_count, impact, people count | Always computed but inputs often 0 | **Misleading** — score exists but inputs sparse |
| `impact.emotionalImpact`, `impactIntensity` | Demo 0.35–0.75 | `resolved_events.metadata` / impact detection | Low | **Sparse** |
| `meaning.narratives[]` | `DEMO_ENRICHMENT` injected | `narrative_accounts` via **date match** to `event_records` | Very low | **Mostly empty** |
| `meaning.emotions[]` | Demo injected | `event_emotions` | Very low | **Mostly empty** |
| `meaning.cognitions[]` | Demo injected | `event_cognitions` | Very low | **Mostly empty** |
| `meaning.identity_impacts[]` | Demo injected | `event_identity_impacts` | Very low | **Mostly empty** |
| `causal_links`, `linked_decisions` | Demo injected | Pipeline (sparse) | Very low | **Mostly empty** |
| `source_messages[]` | Demo injected | `chat_messages` linkage | Low | **Sparse** |

### Significance formula (not stored)

```typescript
// EventsBook.tsx — getSignificanceScore()
confidence * 40 + min(30, source_count * 5) + min(20, impactIntensity * 20) + min(10, people.length * 2)
```

Real events with low confidence, 0–1 sources, no impact → significance **< 25 (minor)** even when user considers event important.

### Event Quality Report

| Rank | Category |
|---|---|
| **Healthy** | Event existence, basic title/date, participant names when extracted |
| **Sparse** | Impact type/intensity, source_count, attendance metadata |
| **Mostly empty** | Meaning layer (emotions, cognitions, identity impacts, narratives) |
| **Misleading** | Significance filter appears authoritative; demo events always score moderate–major |

### Join gap

Event meaning fetched by **calendar-day match** between `resolved_events` and `event_records`, not FK — documented as approximate in `conversationCentered.ts`. Real linkage failures → empty Meaning tab.

---

## AJ-3 — Relationship Reality Gap

### Audited tables

| Table | Migration |
|---|---|
| `character_relationships` | `20240101000001_setup_all_tables.sql` |
| `romantic_relationships` | `20250126000043_romantic_relationships.sql` |
| `organization_relationships` | various |

### Field audit — `character_relationships`

| Field | Default | Real population | Rating |
|---|---|---|---|
| `relationship_type` | NOT NULL, no default | Medium | **Healthy** |
| `closeness_score` | none (-10..10) | Low — ER maps from confidence | **Sparse** |
| `status` | `'active'` | Medium | **Healthy** |
| `summary` | null | Low | **Sparse** |
| `metadata` | `{}` | Low structured content | **Sparse** |

### Field audit — `romantic_relationships`

| Field | Default | Real population | Rating |
|---|---|---|---|
| `affection_score` | **0.5** | Often stays 0.5 | **Misleading** |
| `emotional_intensity` | **0.5** | Often stays 0.5 | **Misleading** |
| `physical_attraction` | **0.5** | Often stays 0.5 | **Misleading** |
| `emotional_connection` | **0.5** | Often stays 0.5 | **Misleading** |
| `compatibility_score` | **0.5** | Often stays 0.5 | **Misleading** |
| `relationship_health` | **0.5** | Often stays 0.5 | **Misleading** |
| `ambiguity_level` | **0.5** | Often stays 0.5 | **Misleading** |
| `red_flags`, `green_flags` | `{}` | Rarely populated | **Mostly empty** |
| `status`, `is_current` | `'active'`, `true` | Medium | **Healthy** |

**Code fallback:** `affectionCalculator.ts` uses `relationship.emotional_intensity || 0.5` — reinforces default clustering.

**Audit script:** `scripts/validate-relationship-scoring.ts` reports `at-0.5-default` counts per column.

### Relationship Quality Report

| Rank | Category |
|---|---|
| **Healthy** | Row existence, relationship_type, status |
| **Sparse** | closeness_score, summary, flags |
| **Misleading** | Romantic score bars in UI — demo shows varied scores; real often all 0.5 |

---

## AJ-4 — Biography Evidence Audit

### Pipeline

| Step | File |
|---|---|
| Fact extraction | `biographyFoundationService.ts` |
| Snapshot generation | LLM 200–500 words |
| Storage | `narrative_accounts` where `account_type = 'biography_snapshot'` |

### Provenance classification (in metadata, not shown in UI)

| Level | Source example |
|---|---|
| **Authoritative** | `character_relationships.status` |
| **Inferred** | Employment/education from journal keyword patterns |
| **Weak inference** | Location from `people_places` mention ranking |
| **Unsupported** | LLM prose without provenance link |

### Schema drift (audit finding)

Migration CHECK on `narrative_accounts.account_type` allows:
`at_the_time`, `others_perspective`, `later_interpretation`

Application code writes `biography_snapshot` — **not in CHECK constraint**. Inserts may fail or require missing migration.

### Biography Trust Report (methodology for 10-bio sample)

For each biography statement, classify:

| Class | % (estimated from pipeline design) |
|---|---|
| Authoritative | ~15–25% (relationship/status facts) |
| Inferred | ~40–50% (keyword-derived employment, themes) |
| Weak inference | ~20–30% (location, period labels) |
| Unsupported | ~10–20% (LLM narrative filler) |

**User visibility:** Biography recall surfaces prose as authoritative ("What I know about you") without per-sentence provenance badges → **Misleading** trust level.

---

## AJ-5 — Memory Coverage Funnel

### Pipeline path

```
chat_messages → extracted_units → resolved_events → character_memories
              → character_relationships → character_timeline_events
              → journal_entries → narrative_accounts (biography_snapshot)
```

### Observability endpoints

| Endpoint | Path |
|---|---|
| Intelligence health | `GET /api/diagnostics/intelligence-health` |
| Event linkage stats | `GET /api/conversation/event-linkage-stats` |
| Recall coverage | `buildRecallCoverageReport()` in `recallQueryRouter.ts` |
| Entity lifecycle | `entityLifecycleDiagnostics.ts` |

### Estimated coverage funnel (real user pattern — from pipeline design + health metrics)

| Stage | Estimated coverage | Notes |
|---|---|---|
| Journal entry created | 100% (of saved messages) | Baseline |
| Character extracted | ~70–85% | Name mention dependent |
| Character memory linked | ~50–70% | Requires consolidation |
| Relationship row created | ~30–50% | Family/romantic detectors selective |
| Event created (`resolved_events`) | ~35–45% | Experience-shaped messages |
| Timeline event | ~15–25% | `characterTimelineBuilder` post-event |
| Event meaning (emotions/cognitions) | ~5–15% | `eventExtractionService` |
| Biography snapshot | ~1 per user | Single snapshot, not per-fact |

**Formula from diagnostics:** `ingestion_coverage_pct = experience_units / user_messages`

**Meaning density:** `meaning_density_pct` from `/intelligence-health` — emotions+cognitions+identity / event_records

### Memory Coverage Funnel (illustrative)

```
Journal entries        ████████████████████ 100%
Character extraction   ████████████████░░░░  80%
Character memory link  ██████████████░░░░░░  65%
Relationship created   ██████████░░░░░░░░░░  45%
Event created          █████████░░░░░░░░░░░  40%
Timeline event         ████░░░░░░░░░░░░░░░░  20%
Event meaning layer    ██░░░░░░░░░░░░░░░░░░  10%
Biography statement    █░░░░░░░░░░░░░░░░░░░   5% (per-message)
```

*Run `GET /api/diagnostics/intelligence-health` for live user-specific numbers.*

---

## AJ-6 — Demo vs Real Comparison

| Surface | Demo experience | Real experience | Gap rank |
|---|---|---|---|
| **Characters** | 25+ rich cards, analytics, relationships, importance scores | Sparse cards, missing list fields, empty intelligence tabs | **Noticeably worse** |
| **Events** | 60 events, full meaning, significance 25–90 | Events exist but Meaning tab empty, significance computed from sparse inputs | **Significantly worse** |
| **Relationships** | Varied romantic scores, flags, dynamics | 0.5 defaults, empty flags | **Misleading** |
| **Discovery** | Mock suggestions, pre-linked entities | Depends on extraction; often empty | **Significantly worse** |
| **Biography** | Coherent narrative on demand | Single snapshot; provenance invisible; schema drift risk | **Noticeably worse** |

### Demo activation

- URL: `?mockData=true`
- `MockDataContext.tsx` — auto-enables on health check failure
- `DemoModeBootstrap.tsx` — registers `dummyCharacters`, `dummyLocations`
- `mockDataService.ts` — central fallback registry

### Side-by-side metric comparison

| Metric | Demo | Real (typical) |
|---|---|---|
| Characters with analytics | 100% | ~30–60% (detail only) |
| Events with meaning layer | 100% | ~5–15% |
| Romantic scores ≠ 0.5 | ~80% | ~10–20% |
| Characters with importance_score on list | 100% | 0% (field omitted) |
| Family tree in recall | Synthetic | Only if `character_relationships` populated |

**Would a real user receive an experience close to demo?** **No** — ranked **Significantly worse** overall, **Misleading** on relationship scores and event significance.

---

## AJ-7 — Top 10 Reality Gaps (Prioritized)

| # | Issue | Impact | User visibility | Fix complexity | Priority |
|---|---|---|---|---|---|
| 1 | **Event meaning layer mostly unpopulated** (emotions, cognitions, identity) | High | High (Meaning tab empty) | Medium | **P0** |
| 2 | **Romantic relationship scores cluster at 0.5 default** | High | High (score bars look real) | Low–Medium | **P0** |
| 3 | **Character list API omits importance_level/score** | High | High (filters/sort broken) | Low | **P0** |
| 4 | **Demo analytics synthesized; real list cards bare** | Medium | High | Medium | **P1** |
| 5 | **Event significance client-computed from sparse inputs** | Medium | Medium (filter misleading) | Medium | **P1** |
| 6 | **Event meaning joined by date, not FK** | Medium | Medium (silent failures) | Medium | **P1** |
| 7 | **Biography prose shown without provenance** | Medium | Medium (trust) | Low (UI badges) | **P2** |
| 8 | **`biography_snapshot` account_type schema drift** | Medium | Low (until insert fails) | Low | **P2** |
| 9 | **Character intelligence tab mock-only in practice** | Medium | Medium | High | **P2** |
| 10 | **Timeline events lag event creation** (~20% coverage) | Medium | Medium (Timeline sparse) | Medium | **P2** |

---

## Audit tooling reference

| Tool | Command / path |
|---|---|
| Relationship 0.5 audit | `pnpm tsx scripts/validate-relationship-scoring.ts --user <email>` |
| Recall coverage | `apps/server/src/scripts/validateRecall.ts` |
| Pipeline validation | `apps/server/src/scripts/validatePipeline.ts` |
| Intelligence health (live) | `GET /api/diagnostics/intelligence-health` |
| Schema drift | `docs/runtime/schema-drift-audit.md` |
| UI audit | `docs/ui-audit-2026-06-11.md` |

---

## Conclusion

LoreBook **looks smarter in demos** because the frontend synthesizes analytics, relationships, meaning layers, and significance scores that the real ingestion pipeline often does not populate. The three highest-impact gaps are: **empty event meaning**, **0.5-default romantic scores**, and **missing character classification on list API**. Real users experience a product that remembers names and events but fails to surface the intelligence depth shown in demo mode.

**No fixes implemented in this sprint.**
