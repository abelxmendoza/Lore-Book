# Knowledge Coverage Audit

**Sprint:** Knowledge Coverage & Trust Center  
**Generated:** 2026-06-17  
**Service:** `apps/server/src/services/trust/knowledgeCoverageService.ts`

## Purpose

Per-domain audit answering: *how much does LoreBook know in each Book domain, and how well is it backed by evidence?*

## Domains (10)

| Domain | Primary tables | Evidence signals |
|--------|----------------|------------------|
| Characters | `characters`, `entity_facts` | Facts per character, memory coverage audit |
| Locations | `locations`, `entity_facts` | Location facts |
| Organizations | `organizations` | Org facts |
| Projects | `projects`, `project_suggestions` | Active projects + pending suggestions |
| Goals | `goals` | Goal records |
| Skills | `skills`, `skill_suggestions` | Skills + pending suggestions |
| Communities | `social_communities` | Community records |
| Relationships | `romantic_relationships`, `character_relationships` | Relationship edges |
| Events | `resolved_events`, `event_candidates` | Resolved vs candidate events |
| Households | `organizations` (type `family`, household metadata) | Household org rows |

## Metrics (per domain)

### `entity_count`
Count of primary entities in the domain (non-archived where applicable).

### `evidence_count`
Supporting signals: `entity_facts`, pending suggestions, resolved events, etc.

### `confidence_distribution`
Buckets derived from `coverage_score`:

| Bucket | Score range |
|--------|-------------|
| high | 76–100 |
| medium | 51–75 |
| low | 1–50 |
| none | 0 |

### `coverage_score`
0–100 heuristic per domain:

- **Characters:** `min(100, (facts/entities)*40 + 30)` plus archived count tracked separately
- **Locations / Organizations:** evidence-to-entity ratio × 25
- **Projects:** `min(100, 50 + entities*5)` when projects exist
- **Goals / Communities:** baseline 55–60 when entities exist
- **Skills:** `min(100, 45 + skills*4)`
- **Relationships:** `min(100, 40 + edges*8)`
- **Events:** `min(100, 35 + resolved*2)`
- **Households:** `50 + household_count*10`

### Knowledge states (Phase 2 merge)

State counts are merged from `knowledgeStateService` after coverage audit:

| State | Meaning |
|-------|---------|
| known | Evidence-backed or confirmed entity |
| suggested | Detected but not promoted (suggestions, thin profiles) |
| unverified | Exists but lacks evidence |
| conflicted | Duplicate names or unresolved contradictions |
| archived | Abandoned / archived records |

## API access

```
GET /api/trust/overview
GET /api/trust/domains
GET /api/trust/domains/:domain
```

## Founder validation (expected shape)

On a well-populated founder account, expect roughly:

| Domain | Example entities | Typical state |
|--------|------------------|---------------|
| Characters | Abuela, LoreBook contacts | known |
| Characters | Tío Ray, new chat mentions | suggested / unknown |
| Locations | Club Metro | known or unverified until facts added |
| Projects | LoreBook, Amazon | known |
| Organizations | Amazon (employer) | known |
| Relationships | Family ties | known; gaps for orphans |
| Conflicts | Duplicate character names | conflicted |

Run live audit: `GET /api/trust/overview` while authenticated.

## Related files

- `apps/server/src/services/trust/knowledgeStateService.ts` — state classification
- `apps/server/src/services/trust/trustCenterService.ts` — orchestrator
- `apps/server/src/services/diagnostics/memoryCoverageAudit.ts` — character evidence depth
