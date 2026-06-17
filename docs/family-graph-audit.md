# Family Graph Audit (Phase 1)

Generated as part of the Family Graph, Household Intelligence & Family UI sprint.

## Scope

Audit all kinship entities and relationship edges stored in LoreBook after chat ingestion.

## Data sources

| Store | Fields |
|-------|--------|
| `character_relationships` | `relationship_type`, `relationship_category`, `relationship_role`, `metadata.kinship`, `metadata.confidence`, `metadata.sources`, `metadata.source_memory_ids`, `metadata.fact_ids` |
| `characters` | `metadata.kinship_role`, `metadata.kinship_label`, `mention_count` |
| `organizations` (type=`family`) | Family groups (`inference_source: kinship_graph`), Households (`inference_source: household_residence`) |
| `character_organizations` | `role`: `member`, `resident`, `visitor`, `head_of_household` |

## Kinship roles verified

| Role | Detection | Storage |
|------|-----------|---------|
| Grandparents | Abuela, Abuelo, Grandma, Grandpa | `metadata.kinship: grandmother/grandfather`, edge `grandparent` |
| Parents | Mom, Dad, Mother, Father | `metadata.kinship: mother/father`, edge `parent` |
| Uncles | Tío Juan, Uncle Ray | `metadata.kinship: uncle`, edge `uncle` |
| Aunts | Tía, Aunt | `metadata.kinship: aunt`, edge `aunt` |
| Cousins | Primo, Prima, Cousin | `metadata.kinship: cousin`, edge `cousin` |
| Siblings | Brother, Sister | `metadata.kinship: sibling`, edge `sibling` |
| Children | Son, Daughter, Child | `metadata.kinship: child`, edge `child` |

## Required provenance per edge

Every family edge should store:

- `relationship_type` — canonical type (`family` + kinship role)
- `confidence` — 0.0–1.0 (kinship inference default 0.85–0.92)
- `source_evidence` — `metadata.sources[]`, `fact_ids[]`
- `source_messages` — `metadata.source_memory_ids[]` (chat message IDs)

## Inference pipeline

```
Chat message
  → kinshipGlossary.extractKinshipMentions()
  → multiEntitySplitter.expandEntityCandidates()
  → character promotion (kinship first-mention exception)
  → familyGraphInferenceService.processMessage()
      → relationshipFoundationService.assertProtagonistKinship()
      → family group auto-create (2+ kin)
  → householdInferenceService.processMessage()
      → head_of_household from possessive ("Abuela's house")
      → household_role: resident | visitor | head_of_household
```

## Example audit: mission sentence

> "I went to Abuela's house with Tío Juan and Tío Ray."

| Expected | Status |
|----------|--------|
| 3 characters (Abuela, Tío Juan, Tío Ray) | ✅ kinship regex + compound split |
| Location: Abuela's House | ✅ namedPlaceExtractor |
| Household: Abuela's House Household | ✅ householdInferenceService |
| Family group (e.g. Abuela's Family) | ✅ familyGraphInferenceService (2+ kin) |
| Edges: protagonist→Abuela (grandmother), →Juan/Ray (uncle) | ✅ assertProtagonistKinship |
| Household roles: Abuela=head, Juan/Ray=resident, user=visitor | ✅ classifyHouseholdRole |
| UI: /family tree + households + analytics | ✅ FamilyBook |

## Runtime audit API

`GET /api/family/audit` returns:

- `edgeCount`, `nodeCount`
- `byKinship` — counts per relationship role
- `edges[]` — full edge list with confidence and evidence
- `gaps[]` — missing roles, low confidence, missing evidence

## Gaps / follow-ups

1. Populate `relationship_role` / `relationship_category` columns from kinship inference (today primarily `metadata.kinship`)
2. Cross-sibling inference (Juan↔Ray) is co-mention heuristic — strengthen with shared grandparent path
3. Former residents require temporal signals ("used to live with") — pattern stub in household engine
4. Mendoza Family surname inference when shared last names appear in roster

## Services

- `familyGraphService` — graph read model, analytics, story context, audit
- `householdService` — household directory read model
- `familyTreeService` — visual tree DTO (generations)
- `GET /api/family/summary` — aggregated page payload
