# Entity integrity: resolution, auditing, and repair

## Trust-floor rule

Candidate retrieval is recall-oriented; identity merge authorization is safety-oriented. Retrieval may return lexical, alias, phonetic, embedding, or high-salience candidates from broad indexes. `areEntityTypesCompatible` filters those candidates before scoring, and `authorizeEntityMerge` is the only authorization policy for persisted merges. Unknown types abstain. A suggestion never authorizes a merge.

The canonical policy is `apps/server/src/services/entities/entityTypeCompatibility.ts`. It maps the existing ontology into normalized types and families rather than adding another storage ontology:

- person → person
- country/city/place/location → location
- organization/school → organization
- app/software tool/project/product → artifact
- event → event
- unknown → unknown (never merge-authorized)

Compatible family membership is necessary but not sufficient. A persisted merge also requires a rationale, evidence references, actor, and resolver version. Current resolver version: `type-safe-v1`.

## End-to-end path

```text
message
→ omegaMemoryService.extractEntities / deterministic classifyEntity(name, full text)
→ normalized ontology type
→ batched, user-and-type-scoped candidate load
→ broad candidate annotation
→ hard type rejection in resolveMention
→ lexical/alias/context scoring of compatible candidates only
→ resolve, create provisional record, or abstain/disambiguate
→ relationship persistence remains a separate edge operation
→ merge services call assertEntityMergeAuthorized before moving evidence
→ entity_merge_records / identity_mutations / cognition_mutations audit output
```

Known geography and grammatical context are deterministic. Countries are classified before person inference; tool/chatbot/app noun phrases map to APP/software-tool; degree/school phrases map to an institution; employment phrases map to organizations; event nouns such as Expo map to events. These rules add no LLM calls.

## Entry-point audit

| Entry point | File/function | Input | Type gate | Create | Merge | Relationship | Safe abstention | Coverage | Residual risk |
|---|---|---|---|---:|---:|---:|---:|---|---|
| Omega ingestion | `omegaMemoryService.resolveEntities` | extracted message mentions | yes, `resolveWithCore` plus type-scoped DB lookup | yes | no | downstream | yes | omega regression + hostile corpus | extractor can still emit UNKNOWN; it is dropped rather than guessed |
| Core resolver | `entityResolutionCore.resolveMention` | mention, expected type, candidate batch | authoritative candidate gate | recommendation | no | no | yes | 54 hostile fixtures, ordering and ambiguity invariants | context span is currently null in this low-level API; callers may enrich it |
| Legacy resolver | `entityResolutionBridge.findLegacyPoolMatch` | mention and omega pool | yes, before exact/JW | no | no | no | yes | core/bridge suites | legacy mode remains available for rollback, but cannot cross type |
| Generic entity resolver | `EntityResolver.process` / `DuplicateDetector.findDuplicates` | journal extraction | yes, before fuzzy/alias match | yes | links mention only | mention edge | creates separate | focused resolver suites | legacy `entities` storage has coarse types |
| Character creation | `characterRegistry.classifyForCreation` via bridge | capitalized/person mentions | yes; candidates are PERSON | yes | delegates only | no | defers ambiguity | existing registry suites | exact same-name people require context/user choice |
| Generic manual merge API | `EntityResolutionService.mergeEntities` | authenticated UI request | yes, before reference reassignment | no | yes | no | blocks 409 | authorization unit tests | generic ENTITY/CONCEPT types are unknown and therefore intentionally blocked |
| Omega merge API | `OmegaMemoryService.mergeEntities` | authenticated request or internal caller | yes, before claims move/delete | no | yes | no | blocks 409 | omega regression | Supabase JS cannot make the multi-table operation fully transactional |
| Character merge | `CharacterMergeService.merge` | UI, audit, dedupe jobs | yes before any move | no | yes | moves existing edges | blocks | existing merge suites + policy tests | operation is idempotent but not one DB transaction |
| Location merge | `LocationMergeService.merge` | UI/manual authority | yes against canonical LOCATION root | may promote legacy row | yes | moves existing edges | blocks | existing location suites + policy tests | subtype compatibility is handled by the location authority itself |
| Project merge | `ProjectMergeService.merge` | UI/manual authority | yes against PROJECT | may promote legacy row | yes | moves existing edges | blocks | policy tests | same transaction limitation |
| Organization merge | `OrganizationMergeService.merge` | UI/manual authority | yes per absorbed org | no | yes | moves existing edges | blocks | policy tests | batch can partially complete on infrastructure failure; audit is per source |
| EntityAuthorityApply | `applyEntityAuthorityDecision` | user authority decision | delegates to gated domain services | maybe | yes | no | domain gate | existing authority tests | none outside delegated service risks |
| MTG fragment correction | `MisclassifiedEntityRouter.mergeMtgFragments` | deterministic correction | delegates to gated omega merge | maybe | yes | no | blocks cross-type | omega tests | wrongly typed fragments now require review rather than deletion |
| Slang toponym fold | `SlangPlaceAliasBinder.foldExistingCard` | high-confidence correction | not an identity merge; CorrectionAuthority event required | no | no | alias/referent correction | low-confidence cases abstain | binder suites | legacy obsolete card removal is audited but not transactional |
| Legacy people_places cleanup | `cleanupLegacyEntities.fixQuality` | explicit CLI user scope | yes per source; explicit user required | no | yes | no | aborts on mismatch | static audit | one-time historical SQL migrations predate the runtime gate and must be scanned |
| Historical SQL duplicate migration | `20260214000000_merge_duplicate_characters.sql` | deployment migration | no (historical) | no | yes | no | no | none | not a runtime path; scanner must inspect resulting history where available |

All application candidate queries touched by this change include an explicit `user_id` filter. The scanner treats an edge whose endpoints are absent from the user-scoped entity batch as `ORPHAN_OR_CROSS_TENANT_REFERENCE`; it does not query or expose another user's row to disambiguate that finding.

## Mutation semantics

- Record creation: “Started a record for Prima AI.”
- Mention resolution: “Resolved Prima AI as an existing record.”
- Identity merge: `ENTITY_MERGE` / `ENTITY_MERGED`, with source, survivor, authorization, evidence, and resolver version.
- Alias creation: alias metadata/ledger event with provenance.
- Relationship creation: `RELATIONSHIP_CREATED`; it never changes canonical identity.
- Correction: append-only `CORRECTION` or `IDENTITY_INTEGRITY_CORRECTION`, preserving the original event.

The older creation protocol internally calls an existing-record resolution `merge`; presentation now says “Resolved … as …” so it cannot be confused with a destructive identity merge.

## Scanner

Authenticated endpoint:

```text
GET /api/entity-resolution/integrity/scan?limit=200
```

Properties:

- read-only and dry-run by definition;
- explicit authenticated user scope;
- 1–500 rows per table;
- five parallel queries on deployments with `entity_merge_records`;
- seven queries on graph-ledger deployments (`entity_merge_log` + `graph_nodes` fallback);
- no per-candidate or per-finding queries;
- stable structured findings with severity, evidence IDs, mutation IDs, recommendation, and automatic-repair eligibility.

It checks incompatible historical merges, absent merge authorization/evidence/version, conflicting type evidence, relationship events mislabeled as merges, unprovenanced aliases, duplicate canonical aliases, fuzzy-only canonical identities, resolver selections outside compatible candidates, orphan/cross-tenant-shaped references, and correction events lacking derived-state invalidation.

## Repair workflow

```text
POST /api/entity-resolution/integrity/repair
{ "finding_id": "…", "execute": false }
```

Preview is the default. The route re-runs the user-scoped scan and will not accept a caller-supplied finding. Execution is allowed only for deterministic `RELATIONSHIP_AS_IDENTITY_MERGE` findings and writes an append-only superseding event through CorrectionAuthority. Cross-type identity repairs remain review-only because restoring a deleted source, moving provenance, and rebuilding edges cannot be proven safe from merge metadata alone.

The UI’s Integrity tab displays the reason, expected/source type, existing/target type, evidence-oriented recommendation, and a CorrectionAuthority dry-run preview. It never writes canonical identity tables directly.

## Current-user dry run (2026-07-10)

The scanner ran against the configured owner user with `limit=200` and performed no repairs:

```json
{
  "dryRun": true,
  "queryCount": 7,
  "critical": 0,
  "high": 0,
  "medium": 34,
  "low": 0,
  "crossTypePersistedMerges": 0,
  "automaticRepairsExecuted": 0,
  "nextCursor": null
}
```

Thirty-three findings are legacy aliases without provenance, including several visibly suspicious aliases attached to EVENT/PERSON records; one finding is the same alias attached to two compatible person identities. These require review, not automatic repair. The production schema uses `entity_merge_log`, so the scanner used its two-query graph-ledger fallback. The older `entity_merge_records` table is absent in that deployment; apply pending migrations before relying on domain merge-history UI.

## Performance and cost

| Measure | Before | After |
|---|---:|---:|
| Resolver DB queries | existing bounded per-type load | unchanged |
| Candidate rows | max 500 per requested omega type | unchanged; filtered in memory |
| LLM calls for obvious type | 0 deterministic calls | 0 |
| Type filter complexity | none | O(candidate count), allocation bounded by retrieved batch |
| Scanner queries | unavailable | 5 normal / 7 schema-fallback, off interactive chat path |
| Scanner row bound | unavailable | 500 per table maximum |
| Repair writes during preview | unavailable | 0 |

Focused tests execute 95 resolver/binder/scanner cases in under one second on the development machine. Production ingestion latency and memory should still be observed through existing telemetry after rollout; this change does not claim network/database latency from unit timings.

## Operational rollout

1. Apply `20260729120000_entity_integrity_type_constraints.sql` so APP/PROJECT/PRODUCT and newer merge-ledger types can persist.
2. Deploy server and web together.
3. Run the scanner for one user with `limit=200`; export findings, but do not execute repairs.
4. Review critical/high findings first, then aliases on records whose current type is PERSON or EVENT.
5. Preview deterministic repairs. Execute only after the preview matches the intended semantic correction.
6. Re-scan the same user and verify no new critical findings.
7. Expand to additional users in bounded batches; never run an unscoped repair.

## Remaining risks

- Supabase JS does not provide a cross-table transaction for current merge services. They are ordered and idempotent, but infrastructure failure can leave partial work requiring the scanner and audit history.
- Historical migrations and rows may lack resolver metadata because they predate this policy.
- Legacy aliases often lack per-alias provenance; the scanner intentionally produces review noise rather than trusting them.
- Context snippets are represented in the trace contract but remain null in the pure resolver. Higher-level diagnostics may add a privacy-redacted snippet.
- The full repository TypeScript check has substantial pre-existing failures unrelated to this change; focused Vitest and ESLint checks are the reliable gate until that baseline is repaired.
