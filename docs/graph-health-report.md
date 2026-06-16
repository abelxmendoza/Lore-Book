# Graph Health Report

Date: 2026-06-15
Status: structural audit from code paths + the existing measurement harnesses. Counts marked **[RUN]** must be populated by executing the named query/script against the live DB — they are not fabricated here.

Existing harnesses that already measure this (use them, don't rebuild):
- `apps/server/src/services/diagnostics/memoryCoverageAudit.ts` → `buildMemoryCoverageAudit(userId)`
- `relationshipFoundationService.buildCoverageReport(userId)`
- `eventRecoveryService.benchmarkCoverage(userId)`
- Exposed live at `apps/server/src/routes/diagnostics.ts`.

---

## Structural findings (assertable from code today)

These are not counts — they are *systemic* defects that guarantee graph-quality loss regardless of data volume.

| Defect | Root cause (code) | Consequence |
|---|---|---|
| **No episode anchors** | `episodeSegmentationCore` dead; no `episodes` table | Events and memories have no scene to hang on → orphaned moments, no timeline spine |
| **Dual entity resolution** | live `omegaMemoryService.resolveEntities` vs dead `entityResolutionCore` | Two code paths classify entities differently → **duplicate people/places** |
| **Graph built off-path** | `eventRecoveryService` / `relationshipFoundationService` not in chat ingest | Events/relationships exist only after batch runs → **orphan facts** (extracted but never promoted to graph) accumulate between runs |
| **Soft provenance** | knowledge → message link is `metadata.chat_message_id`, not an FK | On forced thread delete, provenance dangles → **missing provenance** / uncitable knowledge |
| **Starved thread intel** | `projects` / `episodes` / `open_loops` unfed | Continuity card renders blank sections → degraded continuity signal |

---

## Graph Health Score (framework)

Compute as the mean of six sub-scores, each a ratio the harnesses already produce. Populate **[RUN]** before publishing a number.

| Dimension | Metric | Source | Value |
|---|---|---|---|
| Entity uniqueness | `1 − (duplicate_nodes / total_nodes)` | dedup query below | **[RUN]** |
| Relationship completeness | `buildCoverageReport` benchmark hit rate | relationshipFoundationService | **[RUN]** |
| Event/timeline coverage | `benchmarkCoverage` hit rate | eventRecoveryService | **[RUN]** |
| Memory coverage | `audit.summary.averageCoverageScore` | memoryCoverageAudit | **[RUN]** |
| Evidence linkage | `linked_facts / total_facts` | provenance query below | **[RUN]** |
| Orphan rate (inverse) | `1 − (orphan_events+orphan_facts)/total` | orphan query below | **[RUN]** |

`GraphHealth = mean(...) × 100`

---

## Queries to populate the [RUN] cells

> Read-only diagnostics. Scope every query by `user_id`.

**Duplicate people (same normalized name, multiple ids):**
```sql
SELECT lower(trim(name)) AS norm, count(*) AS n, array_agg(id) AS ids
FROM characters WHERE user_id = :uid
GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC;
```

**Duplicate places / orgs:** same query against `people_places` / the org store, grouped by normalized name + type.

**Orphan events (events with no linked unit/episode):**
```sql
SELECT e.id FROM resolved_events e
LEFT JOIN event_unit_links l ON l.event_id = e.id
WHERE e.user_id = :uid AND l.id IS NULL;
```

**Orphan facts (facts whose entity no longer exists):**
```sql
SELECT f.id FROM entity_facts f
LEFT JOIN characters c ON c.id = f.entity_id
WHERE f.user_id = :uid AND f.entity_type = 'character' AND c.id IS NULL;
```

**Missing provenance (knowledge with no source message/episode):**
```sql
SELECT count(*) FROM resolved_events
WHERE user_id = :uid AND (metadata->>'chat_message_id') IS NULL;
```

**Unlinked evidence (extracted_units never promoted to a graph artifact):**
```sql
SELECT count(*) FROM extracted_units u
WHERE u.user_id = :uid
  AND (u.metadata->>'knowledge_unit_id') IS NULL;
```

---

## Expected health movement after roadmap steps

| After step | Dimension most improved | Why |
|---|---|---|
| 1 (live recovery) | Orphan rate, relationship completeness | Facts get promoted to graph continuously instead of waiting for batch |
| 2 (episodes) | Event coverage, timeline | Events gain scene anchors; orphan events drop |
| 3 (evidence linkage) | Evidence linkage, missing provenance | FK-grade links replace soft metadata refs |
| 4 (dedup) | Entity uniqueness | Duplicate people/places merged |

---

## How to run

```bash
RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/lifeReconstructionScore.ts
# and hit the diagnostics route for buildMemoryCoverageAudit / coverage reports
```

Publish the scorecard JSON + the six [RUN] ratios alongside this report so the Graph Health Score is measured, never estimated.
