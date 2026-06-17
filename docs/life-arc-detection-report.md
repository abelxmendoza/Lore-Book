# Life Arc Detection Report

**Sprint:** Life Arc & Story Intelligence — Phase 1–2  
**Date:** 2026-06-16  
**Status:** Complete — read-only synthesis layer live

## Summary

LoreBook can now detect **candidate life arcs** from existing memory signals without new extraction or storage. A projection service (`lifeArcSynthesisService`) scores domain signals, applies rule-based arc detection, and emits ranked arcs with momentum labels.

---

## Phase 1 — Arc Signal Inventory

### Method

Signals are read from existing tables only:

| Source | Weight | Recency |
|--------|--------|---------|
| `life_arcs` | 3.0 | — |
| `goals` (active) | 2.5 | — |
| `goals` (other) | 1.0 | — |
| `organizations` | 2.0 | — |
| `journal_entries` | 0.6–2.0 | ≤14d = 2.0, ≤45d = 1.2 |
| `resolved_events` | 1.5 | 90d window |
| `character_relationships` | 2.0 | — |
| `organizations` (community filter) | 1.8 | — |

Text is categorized into domains via keyword regex: career, family, relationship, health, creative, learning, community.

### Founder account signal strength (2026-06-16)

| Domain | Score | Interpretation |
|--------|-------|----------------|
| **family** | 38.0 | Strongest predictor — household, abuela, cousins dominate journal + org graph |
| **creative** | 24.2 | LoreBook build, scene events, creative projects |
| **custom** | 19.0 | Unclassified cross-domain narrative |
| **career** | 17.9 | Amazon onboarding, Kforce, employment transition |
| **community** | 9.8 | Los Goths, Club Metro, social scene |
| **relationship** | 7.9 | Romantic arc signals present but weaker than family/career |
| **learning** | 3.7 | Bootcamp, coding references |
| **health** | 1.6 | Sparse — gym/mental health mentions rare |

### Strongest arc predictors

1. **Journal episodes (90d)** — highest recency weight; drives momentum detection
2. **Organizations** — Amazon, Family, Los Goths map cleanly to named arcs
3. **Goals** — continuity signal for active vs abandoned priorities
4. **Relationships** — kinship metadata reinforces family arc
5. **Events** — supporting evidence for career/community timing

### Weak / missing signals

| Signal | Status |
|--------|--------|
| `life_arcs` table | Schema exists; **0 rows** on founder account — arcs inferred from rules |
| `episodes` table | Not present in production — journal entries used as episode proxy |
| `projects` table | Not present — `organizations` used as project proxy |

---

## Phase 2 — Arc clustering & detection

### Implementation

`apps/server/src/services/continuityRuntime/arcs/lifeArcSynthesisService.ts`

**Inputs:** goals, projects (orgs), episodes (journal), relationships, communities, events.

**Detection pipeline:**

1. Load signal bundle (90-day window)
2. Score category inventory
3. Emit arcs from `life_arcs` rows (if any)
4. Apply title rules when corpus matches:

| Rule | Category | Pattern |
|------|----------|---------|
| LoreBook Arc | creative | `lorebook` |
| Amazon Arc | career | `amazon` |
| Family Arc | family | `family`, `abuela`, `tia grace`, `cousin` |
| Goth Community Arc | community | `goth`, `club metro`, `los goths` |
| Relationship Arc | relationship | `sol`, `breakup`, `relationship` |
| Learning Arc | learning | `bootcamp`, `coding`, `clever programmer` |

5. Rank by `score = category_inventory + momentum_bonus`, cap at 8 arcs

### Detected arcs (founder, 2026-06-16)

| Arc | Category | Momentum | Score |
|-----|----------|----------|-------|
| Family Arc | family | growing | 40.0 |
| LoreBook Arc | creative | growing | 26.2 |
| Amazon Arc | career | growing | 19.9 |
| Goth Community Arc | community | growing | 11.8 |
| Learning Arc | learning | growing | 5.7 |

**Not detected:** Relationship Arc — pattern did not match strongly enough in 90d corpus.

---

## Phase 3 — Arc momentum

| Momentum | Meaning |
|----------|---------|
| **emerging** | 1–2 mentions in 30d, no prior-30d baseline |
| **growing** | Recent mentions exceed prior period |
| **stable** | Steady activity in window |
| **declining** | Older activity, nothing recent |
| **completed** | Goal marked completed for arc |

### Wiring

- `ragBuilderService` calls `synthesizeLifeArcs()` on every RAG build
- `lifeArcSynthesisBlock` injected into system prompt after WORKING MEMORY
- `contextScoringService` passes block through without re-scoring

---

## Audit

```bash
npx tsx apps/server/scripts/lifeArcSynthesisAudit.ts
```

---

## Next steps (optional)

- Backfill `life_arcs` from biography projection when table is empty
- Add Relationship Arc sensitivity when romantic keywords appear in goals/journal
- Unify `episodes` table when migration lands — swap journal proxy
