# Character Authority Audit

> Generated as part of the **Character Authority Consolidation & Social Graph Hardening** sprint.
> Authority model: **`characters.id` is the single canonical person identity.**

## Problem Statement

The same real-world person can currently exist across multiple stores with different IDs:

| Store | Role today | Authority? |
|-------|------------|------------|
| `characters` | Character Book cards | **YES — canonical** |
| `people_places` (type=person) | Journal entity discovery | Legacy source only |
| `omega_entities` | Chat ER graph | Legacy source only |
| `character_relationships` | Social / family edges | References `characters.id` |
| `character_memories` | Episode / journal evidence | References `characters.id` |
| `character_timeline_events` | Event participation | References `characters.id` |
| `resolved_events.people` | Event people array | **Omega IDs — gap** |

### Failure modes observed

- Duplicate people with accent/title variants (`Tío Juan` vs `Tio Juan`)
- Kinship synonym splits (`Mom` vs `Mother`, `Abuela` vs `Grandma`)
- Nickname splits (`Ashley` vs `Ashley De La Cruz`)
- Cross-pipeline duplicates (journal `people_places` + chat `omega_entities` → two character cards)
- Broken family trees when edges point at duplicate IDs
- Fragmented influence scoring across split cards

---

## Per-entity audit schema

For every person-like entity, record:

```yaml
display_name:
aliases: []
characters.id:        # canonical when promoted
people_places.id:     # legacy discovery id
omega_entity_id:      # chat ER id (if any)
relationship_count:
episode_count:        # character_memories rows
event_count:          # character_timeline_events rows
references:
  - source: journal|chat|manual
    id:
    text:
duplicate_status: exact | probable | unique
canonical_character_id:
match_method: exact | alias | kinship_role | fuzzy | authority_map
confidence: 0-1
```

---

## Duplicate classes

### Exact duplicates
Same normalized name or alias after `normalizeNameKey()`:
- `Tío Juan` / `Tio Juan` (diacritic normalization)

### Probable duplicates
Title-aware matching + overlap boost:
- `Mom` / `Mother` (kinship role bucket)
- `Abuela` / `Grandma` (kinship role bucket)
- `Ashley` / `Ashley De La Cruz` (core name containment)
- `Step Dad Ben` / `Ben` (core name + kinship role)

### Intentional non-duplicates
Must **not** merge:
- `Tía Grace` / `Tía Lourdes` (shared title, different core names)
- `Sol` / `Solomon` (token overlap without containment)
- `Baby Bats` (collective — rejected by registry gate)
- Possessive forms (`Kelly's colleague` ≠ `Kelly`)

---

## Architecture (post-sprint)

```
mention (chat/journal)
  → characterAuthorityService.resolveCanonicalCharacterId()
      → resolveByName / resolveByAlias / resolveByPeoplePlace
      → title-aware match (characterNameMatching)
      → fuzzy + overlap (characterDeduplicationService)
  → merge OR create character
  → character_authority_map links all source IDs → characters.id
  → socialGraphRebuildService validates edges
  → characterInfluenceService computes scores
```

### Key services

| Service | Path | Role |
|---------|------|------|
| `characterAuthorityService` | `apps/server/src/services/characterAuthorityService.ts` | Single resolver choke point |
| `characterDeduplicationService` | `apps/server/src/services/characterDeduplicationService.ts` | Cross-store dedup + merge groups |
| `characterNameMatching` | `apps/server/src/utils/characterNameMatching.ts` | Title-aware + alias synonym matching |
| `socialGraphRebuildService` | `apps/server/src/services/socialGraphRebuildService.ts` | Edge integrity + dedup merge |
| `characterInfluenceService` | `apps/server/src/services/characterInfluenceService.ts` | Influence scoring |
| `characterDomainHealthService` | `apps/server/src/services/characterDomainHealthService.ts` | Health metrics |

### Database

- `character_authority_map` — maps `people_places`, `omega_entities`, `characters` → canonical `characters.id`
- Migration: `supabase/migrations/20260616140000_character_authority_map.sql`

---

## Ingestion policy (Phase 5)

**New rule:** `people_places` is discovery, not authority.

```
mention → resolve character (authority service)
       → create character if unresolved
       → link people_places id in character_authority_map
       → only fallback to people_places when character cannot be resolved
```

Wired in:
- `characterRegistry.classifyForCreation()` — authority check before fuzzy logic
- `characterFoundationService.promoteEntityToCharacter()` — registers authority links on create/merge

---

## Regression test matrix

| Case | Expected |
|------|----------|
| Abuela / Grandma | Single canonical ID |
| Mom / Mother | Single canonical ID |
| Tío Juan / Tio Juan | Single canonical ID |
| Ashley De La Cruz / Ashley | Single canonical ID |
| Sol / Solomon | **Different** IDs |
| Tía Grace / Tía Lourdes | **Different** IDs |
| Goth Tio | Resolve via kinship + context (no auto-merge without evidence) |
| Baby Bats | Rejected (collective) |
| Step Dad Ben / Ben | Single canonical ID |

Tests: `apps/server/tests/services/characterAuthority.test.ts`

---

## Remaining gaps

1. **`resolved_events.people`** still stores omega entity UUIDs — needs rewrite pass to canonical character IDs
2. **`entity_relationships` / `omega_relationships`** parallel graph — not yet unified with `character_relationships`
3. **Batch backfill** — run `characterDeduplicationService.mergeDuplicateGroups(userId)` per user after migration
4. **UI disambiguation** — registry defer path unchanged; authority reduces but doesn't eliminate gray-zone questions

---

## Operational commands

After deploying migrations:

```bash
# Per-user health report (via service in REPL/script)
# characterDomainHealthService.generateReport(userId)

# Merge probable duplicates + rebuild graph
# socialGraphRebuildService.rebuildForUser(userId, { mergeDuplicates: true })

# Recompute influence scores
# characterInfluenceService.computeForUser(userId)
```
