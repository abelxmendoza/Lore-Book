# Arc Signal Inventory

Status: Arc Reconstruction Readiness Audit — Phase 2 + Phase 3.
Companion: [arc-readiness-report.md](arc-readiness-report.md).

Every signal class an arc generator could group on, with the **live founder counts**, the source table, and a readiness call. Founder account `789bd607…`.

## Signal table

| Signal | Source table | Founder count | Quality | Arc-ready? |
| --- | --- | --- | --- | --- |
| **People** | `omega_entities` (PERSON) + `people_places` | 97 / 52 total entities; people incl. Tía Grace, Jerry, James, Kelly | dual-store, some misclassification | ⚠️ usable, dedup first |
| **Relationships** | `character_relationships` (21), `romantic_relationships` (4) | 25 | real (Sol breakup captured) | ✅ |
| **Events** | `resolved_events` (30), `event_candidates` (7) | 37 | real but noisy (4× "Captured Conversation") | ⚠️ |
| **Repeated events** | `resolved_events` + `event_continuity_links`, `event_unit_links` | recurring: Amazon onboarding, interviews, LoreBook builds | linkable | ✅ |
| **Locations** | `locations` (6) | San Diego, Anaheim, First Street Pool, Mile Square Park, Club Metro, Abuela's House | clean | ✅ |
| **Organizations** | `organizations` (6) | Amazon, Clever Programmer Bootcamp, Kforce, Los Goths, My Family, Tía Grace's Household | clean, high-signal | ✅ |
| **Communities** | `organizations` (Group/social) + `arc_memberships` | Los Goths, "Juan's group" | present | ✅ |
| **Skills** | `skills` (14), `skill_progress`, `skill_usage_events` | 14 | structured | ✅ |
| **Repeated episode themes** | `continuity_events` (425!) | dominant: career, building LoreBook, family, goth community | richest signal | ✅ (but episodes themselves missing) |
| **Goals** | `goals` | **MISSING TABLE** | — | ❌ |
| **Values** | `values` | **MISSING TABLE** | — | ❌ |
| **Projects** | `projects` | **MISSING TABLE** | — | ❌ (LoreBook is captured as events, not a project entity) |

**Headline:** 9 of 12 signal classes are live with real data; the strongest is `continuity_events` (425). The three missing (goals/values/projects) are migration-drift, not design gaps.

## Phase 3 — Founder arc candidates (grounded in real entities/events)

The data already paints a coherent life. Each candidate below is named from **actual rows**, with the signals that would seed it:

### 1. Career — STRONG ✅
- Signals: orgs `Amazon`, `Clever Programmer Bootcamp`, `Kforce`; events `Clever Programmer Bootcamp loan`, `job offer last week`, `official offer letter`, `starting work at Amazon`, `Amazon Onboarding`, `Kelly Interview Process`, `important meetings and interviews`.
- A clean bootcamp → interviews → offer → Amazon onboarding progression. **The strongest arc.**

### 2. LoreBook / Creative — STRONG ✅
- Signals: events `I Code Lorebook`, `Yesterday I Stayed In To Build Lorebook`, `Testing The Chat Improvements`.
- ⚠️ Captured as events, not a `project` — would be stronger with a Project entity (currently missing).

### 3. Family — STRONG ✅
- Signals: orgs `My Family`, `Tía Grace's Household`; people `Tía Grace`, `Jerry`, `James`; locations `Abuela's House`; events `Costco with Abuela`, `Leslie's Graduation Party`.

### 4. Community / Goth subculture — STRONG ✅ (a distinctive, high-identity arc)
- Signals: orgs `Los Goths`, `Juan's group`; locations `Club Metro` (anniversary, "Goth Tio danced"); events `Gothicumbia`, `Club Metro`.

### 5. Relationships / Romantic — MEDIUM ✅
- Signals: `romantic_relationships`(4), event `Sol Breakup`, person `Kelly`.

### 6. Health — WEAK ⚠️
- Signals: event `went for a run` (single). Insufficient for a trustworthy arc yet.

### 7. Financial — WEAK ⚠️
- Signals: indirect only (`Bootcamp loan`, Amazon income implied). No financial signal table populated.

### Summary
**5 strong + 1 medium + 2 weak** candidate arcs are inferable **today** from real data — confirming the *signal* exists. The blocker is not signal; it's that episodes (the grouping unit) don't persist and provenance is empty (see readiness report). Once episodes + provenance land, Career / LoreBook / Family / Goth-Community / Relationships are immediately generatable; Health/Financial need more capture.

## Recommended arc seed priority
1. Career, 2. LoreBook, 3. Family, 4. Goth Community, 5. Relationships — then revisit Health/Financial after more ingestion. Drive seeding from `organizations` + `resolved_events` + `continuity_events` (the three richest, cleanest stores).
