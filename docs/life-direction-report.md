# Life Direction Report

**Sprint:** Life Arc & Story Intelligence — Phases 5–6  
**Date:** 2026-06-16  
**Status:** Complete

## Summary

LoreBook now surfaces **where life is moving**, **what is gaining or fading**, and **what deserves attention** — plus explicit **conflict detection** across goals, projects, relationships, and time — all derived from existing memory evidence.

---

## Phase 5 — Conflict Detection

### Rules

| Kind | Trigger | Example |
|------|---------|---------|
| **goal** | ≥2 active goals | Multiple active goals competing for attention |
| **goal** | abandoned + active coexist | Abandoned goals alongside active priorities |
| **project** | LoreBook + Amazon both non-completed, Amazon growing | LoreBook build vs employment transition |
| **time** | community growing + LoreBook growing | Social life vs productivity/building |
| **relationship** | family arc active + personal/career goals | Family obligations vs personal goals |

Severity: `low` | `medium` | `high` based on count and arc momentum overlap.

### Founder conflicts (2026-06-16)

| Severity | Conflict | Evidence |
|----------|----------|----------|
| **medium** | Multiple active goals competing for attention | 2 active goal titles |
| **high** | LoreBook build vs employment transition (Amazon) | LoreBook Arc · Amazon Arc |
| **medium** | Social/community life vs productivity/building | Goth Community Arc · LoreBook Arc |
| **low** | Abandoned goals alongside active priorities | abandoned goal → active goals |

These appear in prompt under `**Tensions / Conflicts:**` with severity tags.

---

## Phase 6 — Life Direction

### Output structure

```ts
lifeDirection: {
  movingToward: string[];      // growing arcs, top 3
  gainingMomentum: string[];  // all growing arc titles
  fading: string[];           // declining arc titles
  deservesAttention: string[]; // high/medium conflicts + growing career arcs
}
```

### Founder snapshot (2026-06-16)

| Field | Value |
|-------|-------|
| **Moving toward** | Family Arc (family), LoreBook Arc (creative), Amazon Arc (career) |
| **Gaining momentum** | Family Arc, LoreBook Arc, Amazon Arc, Goth Community Arc, Learning Arc |
| **Fading** | — (none detected) |
| **Deserves attention** | Multiple active goals competing for attention; LoreBook vs Amazon; Social vs productivity; Amazon Arc |

### Evidence-based reading

**Where is life moving?**  
Toward family re-engagement, product build (LoreBook), and career re-entry (Amazon) simultaneously — not a single-thread story.

**What is gaining momentum?**  
All five detected arcs are **growing**; no arc flagged declining in the 30d window.

**What is fading?**  
Nothing in current signals — prior relationship arc may be complete/absent rather than actively declining.

**What deserves attention?**  
The **high-severity** LoreBook vs Amazon tension: two growing arcs competing for time and identity. Secondary: goal sprawl (2+ active) and social vs build time tradeoff.

---

## Integration with chat

### Prompt block (excerpt)

```
**Life Direction:**
- Moving toward: Family Arc (family), LoreBook Arc (creative), Amazon Arc (career)
- Gaining momentum: Family Arc, LoreBook Arc, Amazon Arc, Goth Community Arc, Learning Arc
- Fading: none detected
- Deserves attention: Multiple active goals competing for attention, LoreBook build vs employment transition (Amazon), ...
```

### Query routing

| Question type | Intent | Goals in WMA | Arc direction |
|---------------|--------|--------------|---------------|
| "Where is life moving?" | GOAL_QUERY | ✅ 2 | ✅ full block |
| "What is gaining momentum?" | LIFE_REVIEW | — | ✅ full block |
| "What deserves attention?" | LIFE_REVIEW | — | ✅ conflicts + attention |

Arc synthesis runs on **every** RAG build, so direction is available even when WMA does not load goals.

---

## Phase 7 — Reconstruction validation

| Metric | Result |
|--------|--------|
| Story questions with arc block | **7/7** |
| Story questions with goals | **5/7** |
| Conflicts surfaced | **4** (1 high, 2 medium, 1 low) |
| Direction fields populated | **4/4** |
| Generic advice risk | Low — all strings trace to arc titles / evidence |

### Before vs after

| Capability | Pre-sprint | Post-sprint |
|------------|------------|-------------|
| "What matters most?" | Goal list only | Goals + conflicts + attention queue |
| "Where is life moving?" | Scattered WMA items | Named arcs with momentum |
| Employment vs build tension | Implicit in retrieval | Explicit high-severity conflict |
| Evidence citation | Per-item scores | Arc-level evidence strings |

---

## Phase 6 — Story validation

| Account | Arcs | Chapter | Identity domains |
|---------|------|---------|------------------|
| Founder | 5 arcs (family, creative, career, community, learning) | Multi-arc narrative with evidence | family > creative > career |
| Developer | Not in auth — skipped | — | — |

Cross-account validation requires `DEVELOPER_EMAIL` or `app_metadata.role=developer` in Supabase Auth. Episode data exists for a developer account per `episode-gap-analysis.md`; auth linkage pending.

### Accuracy (founder)

| Dimension | Assessment |
|-----------|------------|
| Arc accuracy | Named arcs match org/journal signals (LoreBook, Amazon, Family, Goth) |
| Chapter accuracy | Captures LoreBook + employment transition; relationship recovery omitted |
| Identity accuracy | Domain inventory aligns with known life domains |
