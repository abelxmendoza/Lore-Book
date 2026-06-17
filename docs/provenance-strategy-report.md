# Provenance Strategy Report

**Sprint:** Arc API & Story Surface — Phase 3  
**Date:** 2026-06-16  
**Status:** Complete

## Principle

Users must be able to see **why** LoreBook believes a story. Every arc API response carries structured provenance — not opaque scores.

No new `provenance_edges` table. Provenance is **computed at read time** from existing memory rows that matched arc category/title rules.

---

## Provenance shape

```typescript
type ArcProvenance = {
  evidenceCount: number;      // total linked memory refs
  episodes: ProvenanceRef[];  // journal_entries
  goals: ProvenanceRef[];     // goals
  projects: ProvenanceRef[];  // organizations
  relationships: ProvenanceRef[]; // character_relationships
  events: ProvenanceRef[];    // resolved_events
  confidence: number;         // 0–1 derived from arc score
};
```

Each `ProvenanceRef`:

```typescript
{ id: string; label: string; date?: string | null; status?: string | null }
```

---

## Matching rules

An existing memory row links to an arc when:

1. **Category match** — text matches `CATEGORY_KEYWORDS[arc.category]` (e.g. family, career, creative)
2. **Title match** — text contains the arc's primary token (e.g. "LoreBook" from "LoreBook Arc")

Applied uniformly in `buildArcProvenance()` inside `lifeArcSynthesisService.ts`.

### Caps (prevent payload bloat)

| Type | Max per arc |
|------|-------------|
| Episodes | 8 |
| Goals | 6 |
| Projects | 6 |
| Relationships | 6 |
| Events | 6 |

Chapter endpoint merges provenance from top 3 dominant arcs (higher caps for episodes/events).

---

## Confidence model

```
confidence = min(1, round(arc.score / 45, 2))
```

| Score | Confidence | Interpretation |
|-------|------------|----------------|
| 40+ | 0.89+ | Strong multi-signal arc |
| 20–40 | 0.44–0.89 | Established arc |
| <20 | <0.44 | Weak / emerging |

Chapter confidence = average of dominant arc confidences.

Conflict confidence = average of related arc confidences, or 0.5 when only text evidence.

---

## Where provenance appears

| Surface | Provenance location |
|---------|---------------------|
| `GET /api/life/arcs` | `arcs[].provenance` |
| `GET /api/life/current-chapter` | `chapter.provenance` + `dominantArcs[].confidence` |
| `GET /api/life/conflicts` | `conflicts[].provenance` (linked goals/projects) |
| `GET /api/life/momentum` | `items[].evidenceCount`, `items[].confidence`, `items[].evidence` |
| Chat prompt | `lifeArcSynthesisBlock` evidence strings (text form) |

---

## Why not provenance_edges?

| Approach | Pros | Cons |
|----------|------|------|
| **Read-time projection (chosen)** | Zero schema, always fresh, matches synthesis | Recomputes on each request (mitigated by 30s cache) |
| Persisted provenance graph | Auditable history | New storage + extraction — explicitly out of scope |

Future: if `provenance_edges` matures, API can prefer edge-backed refs with projection fallback.

---

## Founder snapshot

| Arc | evidenceCount | Top sources |
|-----|---------------|-------------|
| Family Arc | ~18 | episodes, projects |
| LoreBook Arc | ~14 | episodes |
| Amazon Arc | ~12 | episodes, projects |
| Goth Community Arc | ~8 | episodes, projects |
| Learning Arc | ~4 | episodes |

Avg **15.2** evidence refs per arc — sufficient for "why" UI without overwhelming.

---

## UX guidance

1. **Default:** show `evidenceCount` + top 3 episode labels
2. **Expand:** full provenance lists grouped by type
3. **Deep link:** tap ref → navigate to journal entry / goal / org detail
4. **Never:** show confidence without at least one provenance ref (empty arcs show sparse-state copy)
