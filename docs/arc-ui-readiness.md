# Arc UI Readiness

**Sprint:** Life Arc Detection — Phase 7  
**Date:** 2026-06-16  
**Status:** API live — UI design ready, components not built

## Purpose

Define UI surfaces that expose story intelligence from `lifeArcSynthesisService` without building them yet. Backend synthesis is live in chat prompts; UI would make arcs visible outside conversation.

---

## 1. Life Arcs Panel

**Placement:** Life OS sidebar or `/life/arcs` route — peer to Goals, Projects, Communities.

### Layout

```
┌─────────────────────────────────────────────────┐
│ Life Arcs                          [refresh]    │
├─────────────────────────────────────────────────┤
│ ● Family Arc          growing    ████████░░ 40  │
│ ● LoreBook Arc        growing    ██████░░░░ 26  │
│ ● Amazon Arc          growing    █████░░░░░ 20  │
│ ○ Goth Community Arc  emerging   ███░░░░░░░ 12  │
│ ○ Learning Arc        stable     ██░░░░░░░░  6  │
└─────────────────────────────────────────────────┘
```

### Data binding

| UI field | Source |
|----------|--------|
| Title | `candidateArcs[].title` |
| Category chip | `candidateArcs[].category` |
| Momentum badge | `candidateArcs[].momentum` |
| Score bar | `candidateArcs[].score` (normalized) |
| Evidence (expand) | `candidateArcs[].evidence[]` |
| Sources | `candidateArcs[].sources[]` |

### Interactions

- **Tap arc** → filtered timeline of journal entries + events matching category keywords
- **Momentum tooltip** → evidence strings (e.g. "13 mentions in last 30d")
- **Empty state** → "Not enough narrative signal yet — keep journaling"

### API shape

`GET /api/life/arcs` → `{ arcs, signalInventory, lifeDirection, generatedAt }` — **live**

See [`story-surface-report.md`](story-surface-report.md) for full response contracts.

---

## 2. Current Chapter Card

**Placement:** Home dashboard hero or chat empty-state above input.

### Layout

```
┌─────────────────────────────────────────────────┐
│ Current Chapter                                 │
│                                                 │
│ Building LoreBook while transitioning back      │
│ into work — family life gaining momentum.       │
│                                                 │
│ Evidence: 13 LoreBook mentions · Amazon arc ↑   │
│                              [Ask about this →] │
└─────────────────────────────────────────────────┘
```

### Data binding

| UI field | Source |
|----------|--------|
| Narrative | `currentChapter.narrative` |
| Evidence chips | `currentChapter.evidence[]` |
| CTA | Pre-fills chat: "Tell me more about my current chapter" |

### Design notes

- Single sentence max in hero; expandable for full evidence
- Regenerate on journal save (debounced) or daily cron
- Never show when `narrative` is fallback sparse-state copy

---

## 3. Arc Momentum Indicators

**Placement:** Inline on arc rows, chapter card, and optional chat citations.

### Momentum → visual language

| Momentum | Color | Icon | Label |
|----------|-------|------|-------|
| `emerging` | violet | ○ | New |
| `growing` | green | ● | Growing |
| `stable` | blue | ● | Steady |
| `declining` | amber | ◐ | Fading |
| `completed` | gray | ✓ | Complete |

### Evidence requirement

Every badge must link to ≥1 evidence string. No badge without provenance — matches narrative integrity rules.

---

## 4. Conflicts & Attention Strip (optional v2)

**Placement:** Below Current Chapter card when `conflicts.length > 0`.

```
⚠ LoreBook build vs employment transition (high)
⚠ Multiple active goals competing for attention (medium)
```

Source: `conflicts[]` + `lifeDirection.deservesAttention[]`.

---

## 5. Component inventory (for implementation sprint)

| Component | Priority | Depends on |
|-----------|----------|------------|
| `LifeArcsPanel` | P1 | `GET /api/life/arcs` |
| `CurrentChapterCard` | P1 | same endpoint |
| `ArcMomentumBadge` | P1 | momentum enum |
| `ArcEvidenceList` | P2 | evidence arrays |
| `LifeDirectionStrip` | P2 | lifeDirection object |
| `ConflictAlert` | P3 | conflicts array |

---

## 6. Readiness checklist

| Requirement | Status |
|-------------|--------|
| Synthesis service exists | ✅ `lifeArcSynthesisService.ts` |
| Prompt injection works | ✅ `lifeArcSynthesisBlock` in RAG |
| Momentum enum complete | ✅ emerging/growing/stable/declining/completed |
| REST endpoint | ✅ `GET /api/life/*` (4 routes) |
| Web components | ❌ not built |
| Real-time refresh | ❌ not built |

**Recommendation:** Ship `GET /api/life/arcs` as thin wrapper around `synthesizeLifeArcs()` before any UI work. Zero schema changes.

---

## 7. Accessibility

- Momentum colors paired with text labels (not color-only)
- Evidence list keyboard-navigable
- Chapter card readable at 200% zoom
- Screen reader: "Family Arc, growing, score 40, 9 mentions in last 30 days"
