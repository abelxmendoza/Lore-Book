# Ontology Analytics Report

Generated: 2026-06-16. Runtime analytics via `generateOntologyAnalytics()`.

## Tracked Signals

| Metric | Source |
|--------|--------|
| `keyword_hits` | Glossary keyword → count of entities with `ontology_keywords` |
| `entity_matches` | Characters + people_places with `ontology_tags` |
| `relationship_matches` | Entities with non-empty `relationship_hints` |
| `query_matches` | Entities with `query_hints` |

## Identifiers

- **Unused keywords** — glossary entries with zero entity matches (enrichment not yet backfilled or never mentioned).
- **Dead aliases** — glossary aliases not present on any enriched entity metadata.
- **High-value keywords** — top keywords by entity match count.

## API

```
GET /api/ontology/analytics
GET /api/ontology/analytics?userId=<uuid>  # per-user scope
```

## Initial Expectations

Until backfill runs, most keywords will appear unused — enrichment only applies to **new or updated** character promotions after this sprint.

## Recommended Actions

1. Run character ontology backfill script (future).
2. Prune or merge dead aliases with zero corpus hits.
3. Promote high-value keywords to arc/scene detection rules.
4. Add ingestion-time analytics increment (optional `ontology_usage` table).
