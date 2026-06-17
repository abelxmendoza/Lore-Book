# Current Chapter Report

**Sprint:** Life Arc & Story Intelligence — Phase 4  
**Date:** 2026-06-16  
**Status:** Complete

## Summary

LoreBook generates a **Current Chapter** narrative by composing dominant active arcs, career/creative overlap, relationship recovery signals, and active goals — with explicit evidence strings for the model to cite.

---

## Generation logic

`buildCurrentChapter()` in `lifeArcSynthesisService.ts`:

1. **Growing arcs** — if ≥2, lead with dual-momentum framing
2. **Active arcs** — else center on highest stable/growing arc
3. **Career + creative overlap** — "building LoreBook while transitioning back into work"
4. **Relationship recovery** — append if relationship arc is declining
5. **Active goals** — fill gap if narrative still thin
6. **Biography fallback** — `deriveCurrentChapter()` from living biography when sparse

Output shape:

```ts
{
  label: string;      // Capitalized narrative sentence
  narrative: string;  // Same as label
  evidence: string[]; // Citable signals (max 6)
}
```

---

## Founder current chapter (2026-06-16)

### Narrative

> Family and LoreBook are both gaining momentum while building LoreBook while transitioning back into work.

### Evidence

- 9 recent mentions (30d); category signal: family
- 13 recent mentions (30d); category signal: creative
- LoreBook + career signals

### Interpretation

| Layer | Reading |
|-------|---------|
| **Dominant arc** | Family — highest signal score (38.0) and growing momentum |
| **Secondary arc** | LoreBook — creative build gaining 13 mentions in 30d |
| **Transition** | Amazon/career arc growing — employment re-entry parallel to product build |
| **Missing layer** | Relationship recovery not appended — Relationship Arc not rule-matched in 90d corpus |

### Comparison to sprint example

Sprint target example:

> "Building LoreBook while transitioning back into work and rebuilding confidence after a difficult relationship period."

**Partial match:** LoreBook + employment transition captured. Relationship recovery omitted because romantic arc signals did not trigger the Relationship Arc rule in the current window.

---

## Prompt injection

The chapter appears in the system prompt as:

```
**LIFE ARC SYNTHESIS** (narrative projection from existing memory — cite evidence, do not invent)

**Current Chapter:** Family and LoreBook are both gaining momentum while building LoreBook while transitioning back into work.
Evidence: 9 recent mentions (30d); category signal: family; ...
```

Placed immediately after **WORKING MEMORY** so the model treats arc synthesis as authoritative narrative context.

---

## Accuracy levers

| Lever | Effect |
|-------|--------|
| Extend journal window beyond 90d | Surfaces older relationship arc for recovery framing |
| Populate `life_arcs` table | Named arcs from biography projection improve stability |
| Tune `buildCurrentChapter` prose | Reduce redundant "while" clauses when multiple growing arcs |
| Relationship rule sensitivity | Lower threshold for `sol` / `breakup` in goals table |

---

## Validation

Story questions classified as `GOAL_QUERY` receive both WMA goals (2) and full arc synthesis block including current chapter.

```bash
npx tsx apps/server/scripts/lifeArcSynthesisAudit.ts
# Phase 4 output under "--- Phase 4: Current chapter ---"
```
