# Current Chapter API Report

**Sprint:** Arc API & Story Surface — Phase 4–5  
**Date:** 2026-06-16  
**Status:** Complete

## Endpoint

```
GET /api/life/current-chapter
Authorization: Bearer <token>
```

Read-only. Returns the user's synthesized life chapter with evidence and provenance.

---

## Response contract

```json
{
  "success": true,
  "generatedAt": "2026-06-16T19:58:00.000Z",
  "chapter": {
    "label": "Family and LoreBook are both gaining momentum while building LoreBook while transitioning back into work.",
    "narrative": "Family and LoreBook are both gaining momentum while building LoreBook while transitioning back into work.",
    "evidence": [
      "9 recent mentions (30d)",
      "category signal: family",
      "13 recent mentions (30d)",
      "category signal: creative",
      "LoreBook + career signals"
    ],
    "provenance": {
      "evidenceCount": 25,
      "episodes": [{ "id": "…", "label": "…", "date": "2026-06-10" }],
      "goals": [{ "id": "…", "label": "…", "status": "active" }],
      "projects": [{ "id": "…", "label": "LoreBook" }],
      "relationships": [],
      "events": [],
      "confidence": 0.64
    },
    "dominantArcs": [
      { "id": "signal:family_arc", "title": "Family Arc", "momentum": "growing", "confidence": 0.89 },
      { "id": "signal:lorebook_arc", "title": "LoreBook Arc", "momentum": "growing", "confidence": 0.58 }
    ]
  }
}
```

---

## Generation logic

Sourced from `buildCurrentChapter()` in `lifeArcSynthesisService.ts`:

1. Identify **growing** arcs (≥2 → dual-momentum framing)
2. Overlay **career + creative** pattern ("building LoreBook while transitioning back into work")
3. Append **relationship recovery** if relationship arc is declining
4. Fill with **active goals** if narrative still thin
5. Fall back to **biography era** label if sparse

API layer adds:
- `provenance` — merged from top 3 dominant arcs (growing/emerging/stable)
- `dominantArcs` — arc pills for UI

---

## Founder validation

| Check | Result |
|-------|--------|
| Narrative present | ✅ Multi-arc sentence |
| Evidence strings | ✅ 5 items |
| Provenance refs | ✅ evidenceCount 25 |
| Confidence | 0.64 (moderate — multi-arc blend) |
| Dominant arcs | Family + LoreBook (growing) |
| Consistency with `/api/life/arcs` | ✅ Same `generatedAt` snapshot |

### Accuracy notes

| Layer | Captured | Missing |
|-------|----------|---------|
| Family momentum | ✅ | — |
| LoreBook build | ✅ | — |
| Employment transition | ✅ | — |
| Relationship recovery | ❌ | Relationship Arc not rule-matched in 90d window |

---

## UI integration

### Current Chapter Card

| Field | Binding |
|-------|---------|
| Headline | `chapter.narrative` |
| Evidence chips | `chapter.evidence[]` |
| Arc pills | `chapter.dominantArcs[]` |
| "Why?" expand | `chapter.provenance` grouped lists |
| Confidence indicator | `chapter.provenance.confidence` |
| Refresh | Re-fetch; respect `generatedAt` |

### Chat CTA

```
Tell me more about my current chapter
```

Pre-filled from card action — WMA routes to `GOAL_QUERY`, RAG includes `lifeArcSynthesisBlock`.

---

## Developer account

Not present in Supabase Auth at audit time. When linked, same endpoint returns tenant-isolated chapter for that user.

---

## Run validation

```bash
npx tsx apps/server/scripts/lifeStoryApiAudit.ts
```
