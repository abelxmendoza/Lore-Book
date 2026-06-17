# Ontology Activation Report

Generated: 2026-06-16. Sprint: Ontology Activation + Narrative Compiler Foundation.

## Goal

Make the ontology engine load-bearing: entity understanding, relationship hints, scene detection, arc synthesis, and narrative compilation.

## Ingestion Paths Audited

| Path | Entity creation | Promotion | Resolution | Enrichment (before) | Enrichment (after) |
|------|-----------------|-----------|------------|---------------------|-------------------|
| **Character foundation** | `promoteEntityToCharacter` | people_places → characters | `characterRegistry`, `characterAuthorityService` | None | ✅ `mergeOntologyIntoMetadata()` |
| **Omega / ingestion pipeline** | people_places upsert | Via foundation | Authority map | None | ⚠️ Indirect via foundation promotion |
| **Character registry** | `classifyForCreation` | merge/defer | Authority-first | None | Pending: enrich on merge |
| **Resolved events** | Event entities | N/A | temporal | None | Future: enrich event titles |
| **Organizations** | org create | N/A | dedup by name | None | Future: enrich org names |

## Wired: `enrichEntity()` → Metadata

**Service:** `services/ontology/ontologyEnrichmentService.ts`

Persisted fields on `characters.metadata`:

- `ontology_tags` — ROOT/CATEGORY/SUBCATEGORY paths
- `domains` — root types (PERSON, FAMILY, …)
- `categories`, `subcategories`
- `ontology_keywords`, `ontology_aliases`
- `relationship_hints`, `query_hints`
- `ontology_enriched_at`

**Integration point:** `characterFoundationService.promoteEntityToCharacter()` and `updateCharacter()`.

## Narrative Consumption

| Consumer | Ontology usage |
|----------|----------------|
| `sceneDetectionService` | `discoverEntities()` + co-occurrence rules |
| `lifeArcSynthesisService` | Keyword/category regex (parallel to glossary) |
| `turningPointDetectionService` | Life-event keyword patterns |
| Future: retrieval/WMA | `ontology_tags` on characters for query expansion |

## Explorer & API

- `GET /api/ontology` — hierarchy + analytics (admin)
- `GET /api/ontology/analytics` — keyword hit counts
- UI: `/ontology` (admin-only)

## Remaining Activation Work

1. Enrich `people_places.metadata` at upsert time (ingestion pipeline).
2. Enrich `organizations` and `resolved_events` on write.
3. Use `relationship_hints` in `familyGraphService` edge inference.
4. Feed ontology keyword hits into arc title rule generation (replace static regex over time).
5. Backfill ontology metadata for existing characters.

## Success Criteria

Ontology is no longer a standalone glossary — it tags entities at ingestion and powers scene detection + future story compilation. Character promotion is the first canonical hook; expand to all entity writes next.
