# Entity Authority Audit

Status: Entity Authority & Review Intelligence Sprint. The decision layer that turns "these entities are related" into a concrete authority verdict. Engine: `apps/server/src/services/entityAuthorityService.ts` (deterministic, pure, verified on the founder account).

## The decision the system was missing

Detection already finds duplicates, similars, parent/child, household-room, event-venue, possessive owners. `decideAuthority(a, b)` resolves each related pair to one verdict:

| Verdict | Meaning |
| --- | --- |
| **MERGE** | same entity → fold into one canonical |
| **ALIAS** | same entity, one name is a surface alias |
| **PARENT_CHILD** | distinct but hierarchical (room ⊂ household, event ⊂ venue) |
| **LINK** | distinct, related by a non-identity relationship (owner/uses/home_of) |
| **IGNORE** | unrelated, or invalid |

Output carries `{ decision, confidence, reason, evidence[], canonical?, relationship? }` for the review center.

## Decision rules (Phases 2, 6, 7)

1. **EVENT ↔ VENUE** (same canonical venue) → `PARENT_CHILD`, `HOSTED_AT`, venue is canonical.
2. **ROOM ↔ HOUSEHOLD/PROPERTY** → `PARENT_CHILD`, `INSIDE`, household is canonical. *(Phase 7)*
3. **FAMILY ↔ HOUSEHOLD** → `LINK`, `HOME_OF` — **never merge a family into a household**. *(Phase 6)*
4. **COMMUNITY/ORG ↔ VENUE** → `LINK`, `USES`.
5. **Possessive BUSINESS ↔ base BUSINESS** → `LINK`, `VISITS`/`ASSOCIATED_WITH` — owner relationship, **not** merge.
6. **HOUSEHOLD ↔ HOUSEHOLD** → `MERGE` when shared residents/city (semantic), else `LINK`.
7. **Same kind + identical name** → `MERGE`; near-name/declared alias → `ALIAS`.
8. Otherwise → `IGNORE`.

Place kinds are inferred from the name via `placeIntelligence.classifyPlace` when not supplied, so callers can pass raw strings.

## Phase 1 — cluster classification

`classifyCluster(entities[])` runs `decideAuthority` over every pair and returns the non-IGNORE verdicts, mapping to the audit taxonomy: `MERGE`→EXACT_DUPLICATE, `ALIAS`→ALIAS, `PARENT_CHILD`→PARENT_CHILD, `LINK`→RELATED, `IGNORE`→UNRELATED. Applies across Characters, Places, Organizations, Communities, Projects, Skills, Goals (any `{name, kind}` pairs).

## Phase 5 — Project authority

`isValidProjectName(name, evidenceCount)` rejects bare generic words so they never become project titles:

| Name | Valid? |
| --- | --- |
| building / app / software / project / website | ❌ |
| LoreBook · Omega Robot · Abeliciousness | ✅ |
| MMA Training (multi-word) | ✅ |

Rule: reject if the name (or every token) is in the generic set; require a distinctive named initiative (proper-cased / multi-word / ≥6 chars) or ≥3 repeated evidence mentions.

## Phase 8 — Validation (founder account, all passing)

| Pair | Verdict | Rel | Conf |
| --- | --- | --- | --- |
| "Club Metro anniversary…" ↔ Club Metro | **PARENT_CHILD** | HOSTED_AT | 0.90 |
| Goth Show by Metro ↔ Club Metro | **PARENT_CHILD** | HOSTED_AT | 0.85 |
| Moms House ↔ Anaheim Family Home (shared resident Mom) | **MERGE** | — | 0.95 |
| Abuela's Costco ↔ Costco | **LINK** | VISITS | 0.82 |
| Los Goths ↔ Club Metro | **LINK** | USES | 0.78 |
| Tía Grace Household ↔ My Family | **LINK** | HOME_OF | 0.80 |
| Family Kitchen ↔ Anaheim Family Home | **PARENT_CHILD** | INSIDE | 0.85 |

Plus: no generic project name passes `isValidProjectName`.

## Phases 3 & 4 — Review center + authority graph (SHIPPED)

- **Phase 4 — Authority graph:** migration `20260617210000_entity_authority.sql` (applied) creates `entity_authority_decisions` (kind, decision, relationship, source/target ids+names, `canonical_entity_id`, confidence, reason, evidence, status, applied). This is the durable authority graph + audit trail — one row per ratified decision, no per-table compatibility columns.
- **Apply service** `entityAuthorityApply.ts` (`applyDecision` / `dismiss`):
  - **MERGE/ALIAS** → routes to the existing per-domain merge service by kind (`characterMergeService` / `locationMergeService` / `organizationMergeService` / `projectMergeService`) so the source table collapses to **one canonical** (canonical = target). No new compatibility layer.
  - **PARENT_CHILD** → sets `locations.parent_location_id` on the child (room→household, event→venue).
  - **LINK** → recorded as a relationship edge in the authority graph (no entity collapse).
- **Phase 3 — Review endpoints** (`routes/entityAuthority.ts`, registered `/api/entity-authority`, CORE_RUNTIME):
  - `POST /decide` — preview a verdict (no side effects).
  - `POST /confirm` — apply a verdict (optional `decision` override); returns `{applied, decisionId, canonicalEntityId, mergeReport, verdict}`.
  - `POST /dismiss` — record a dismissal so the pair is never re-suggested.
  - `GET /decisions` — the authority graph / audit trail.
  Verified end-to-end (LINK recorded + cleaned up); `tsc` clean. Review-center **UI** reuses the place-review-workflow pattern and is the remaining surface to build on top of these endpoints.

## Outcome

LoreBook moves from **entity detection** to **entity authority**: every related pair has a deterministic verdict + confidence + reason + evidence, the review center is where the user ratifies them, and there is exactly one canonical entity per identity with explicit relationships for everything else.
