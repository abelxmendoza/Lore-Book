# Story Surface Report

**Sprint:** Arc API & Story Surface — Phase 4  
**Date:** 2026-06-16  
**Status:** Complete — API contracts ready, no major UI build

## Mission

Expose story intelligence as first-class platform capabilities. LoreBook can now answer story questions via HTTP, not only chat prompts.

---

## Success criteria

| Question | API |
|----------|-----|
| What story am I living? | `GET /api/life/arcs` |
| What chapter am I in? | `GET /api/life/current-chapter` |
| What conflicts are shaping my life? | `GET /api/life/conflicts` |
| What is growing / fading? | `GET /api/life/momentum` |
| Why does LoreBook believe that? | `provenance` on every response |

---

## UI response contracts

### Life Arcs Panel → `GET /api/life/arcs`

```json
{
  "success": true,
  "generatedAt": "2026-06-16T…",
  "arcs": [{
    "id": "signal:family_arc",
    "title": "Family Arc",
    "category": "family",
    "momentum": "growing",
    "score": 40,
    "evidence": ["9 recent mentions (30d)"],
    "sources": ["episodes", "goals", "projects"],
    "provenance": {
      "evidenceCount": 12,
      "episodes": [{ "id": "…", "label": "…", "date": "…" }],
      "goals": [],
      "projects": [{ "id": "…", "label": "Family" }],
      "relationships": [],
      "events": [],
      "confidence": 0.89
    },
    "startDate": "2026-03-01",
    "latestActivity": "2026-06-10"
  }],
  "signalInventory": { "family": 38, "creative": 24.2 },
  "lifeDirection": {
    "movingToward": ["Family Arc (family)", "…"],
    "gainingMomentum": ["Family Arc", "…"],
    "fading": [],
    "deservesAttention": ["…"]
  }
}
```

**Panel bindings:** title, category chip, momentum badge, score bar (`score / maxScore`), expandable provenance lists.

---

### Current Chapter Card → `GET /api/life/current-chapter`

```json
{
  "success": true,
  "generatedAt": "2026-06-16T…",
  "chapter": {
    "label": "Family and LoreBook are both gaining momentum…",
    "narrative": "…",
    "evidence": ["9 recent mentions (30d)", "…"],
    "provenance": {
      "evidenceCount": 25,
      "episodes": [],
      "goals": [],
      "projects": [],
      "relationships": [],
      "events": [],
      "confidence": 0.64
    },
    "dominantArcs": [
      { "id": "…", "title": "Family Arc", "momentum": "growing", "confidence": 0.89 }
    ]
  }
}
```

**Card bindings:** hero narrative, evidence chips, dominant arc pills, "Ask about this" → chat prefill.

---

### Conflict Panel → `GET /api/life/conflicts`

```json
{
  "success": true,
  "generatedAt": "2026-06-16T…",
  "conflicts": [{
    "kind": "project",
    "label": "LoreBook build vs employment transition (Amazon)",
    "evidence": ["LoreBook Arc", "Amazon Arc"],
    "severity": "high",
    "provenance": {
      "evidenceCount": 4,
      "goals": [],
      "projects": [],
      "relationships": [],
      "confidence": 0.7
    }
  }]
}
```

**Panel bindings:** severity color, label, evidence list, linked goals/projects from provenance.

---

### Momentum Indicators → `GET /api/life/momentum`

```json
{
  "success": true,
  "generatedAt": "2026-06-16T…",
  "items": [{
    "id": "signal:lorebook_arc",
    "title": "LoreBook Arc",
    "category": "creative",
    "momentum": "growing",
    "score": 26.2,
    "confidence": 0.58,
    "evidenceCount": 14,
    "latestActivity": "2026-06-12",
    "evidence": ["13 recent mentions (30d)"]
  }],
  "summary": {
    "emerging": 0,
    "growing": 5,
    "stable": 0,
    "declining": 0,
    "completed": 0
  }
}
```

**Indicator bindings:** momentum → color/icon per `arc-ui-readiness.md`, tooltip from `evidence[]`.

---

## Architecture

```
Client panels
    ↓
GET /api/life/*
    ↓
lifeStoryApiService (cache 30s)
    ↓
lifeArcSynthesisService (projection)
    ↓
Existing tables (goals, journal, orgs, events, relationships)
```

Chat RAG continues to use the same synthesis service — **one engine, two surfaces** (HTTP + prompt).

---

## Next UI sprint (not in scope)

1. `LifeArcsPanel` component wired to `/api/life/arcs`
2. `CurrentChapterCard` on dashboard
3. `ConflictAlert` strip when `conflicts.length > 0`
4. Shared `ArcMomentumBadge` component

See [`arc-ui-readiness.md`](arc-ui-readiness.md) for visual spec.
