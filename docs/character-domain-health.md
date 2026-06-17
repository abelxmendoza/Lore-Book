# Character Domain Health

> Metrics dashboard for the **Character Authority Consolidation** sprint.
> Run `characterDomainHealthService.generateReport(userId)` for live numbers.

## Health metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `canonicalCharacters` | Rows in `characters` table | Stable after dedup |
| `peoplePlacesPersons` | Legacy discovery records (type=person) | ≤ canonicalCharacters |
| `probableDuplicates` | Pairs with confidence ≥ 0.85 not yet merged | **0** |
| `exactDuplicateGroups` | Connected duplicate clusters | **0** |
| `crossStoreCollisions` | `people_places` persons with no character link | **0** |
| `orphanRelationshipEdges` | Edges referencing deleted character IDs | **0** |
| `charactersWithoutRelationships` | Isolated nodes in social graph | Low (protagonist-only OK) |
| `charactersWithoutEpisodes` | No `character_memories` evidence | Low for active cast |
| `familyEdgeCount` | `relationship_type = family` | Grows with kinship inference |
| `friendEdgeCount` | `relationship_type = friend` | — |
| `romanticEdgeCount` | `relationship_type = romantic` | — |
| `authorityMapEntries` | Rows in `character_authority_map` | ≥ canonicalCharacters |

---

## Influence scoring

Each character receives an `influence_score` persisted in `characters.metadata`:

```
influence_score =
  interaction_count × 2
+ episode_count × 4
+ relationship_count × 6
+ event_count × 3
+ recent_mentions × 5
+ recency_boost (0–15, decays over 30 days)
```

### Product questions powered

| Question | Signal |
|----------|--------|
| Who influences me most? | Top `influence_score` |
| Who appears most? | `episode_count` + `recent_mentions` |
| Who am I drifting away from? | High prior mentions + `daysSinceLastMention ≥ 60` |

Service: `characterInfluenceService.getTopInfluencers()` / `getDriftingAway()`

---

## Relationship coverage

```
relationship_coverage = characters_with_edges / canonical_characters
family_coverage = characters_in_family_edges / characters_with_kinship_mentions
```

Low family coverage with high kinship mention count → run kinship inference + graph rebuild.

---

## Orphan reference checks

| Reference type | Table | Expected FK |
|----------------|-------|-------------|
| Relationship source | `character_relationships.source_character_id` | `characters.id` |
| Relationship target | `character_relationships.target_character_id` | `characters.id` |
| Episode evidence | `character_memories.character_id` | `characters.id` |
| Timeline event | `character_timeline_events.character_id` | `characters.id` |
| Authority link | `character_authority_map.canonical_character_id` | `characters.id` |
| Legacy discovery | `people_places.id` | mapped via authority map |

---

## Remediation playbook

### Duplicates detected
1. Review `characterDeduplicationService.auditDuplicates(userId)`
2. Run `socialGraphRebuildService.rebuildForUser(userId, { mergeDuplicates: true })`
3. Verify `character_authority_map` links updated

### Cross-store collisions
1. For each unlinked `people_places` person → `characterAuthorityService.resolveByPeoplePlace()`
2. Promote or merge via `characterFoundationService.promoteEntityToCharacter()`

### Orphan edges
1. Run graph rebuild (removes edges with invalid endpoints)
2. Re-run kinship inference if family edges dropped

### Stale influence scores
1. `characterInfluenceService.computeForUser(userId)` after major ingestion

---

## Success criteria

- Every person exists **exactly once** in `characters`
- Family Tree, Relationship Graph, Influence Scoring, Life Arcs, Episodes, and Story Intelligence all reference the **same canonical character ID**
- No split-brain identity storage between `people_places` and `characters`
- Alias variants (`Tio Juan`, `Mom`, `Ashley`) resolve through authority, not duplicate creation

---

## Related docs

- [character-authority-audit.md](./character-authority-audit.md) — full audit schema and architecture
- [canonical-ontology.md](./canonical-ontology.md) — entity lifecycle policy
- [family-graph-audit.md](./family-graph-audit.md) — family tree data sources
