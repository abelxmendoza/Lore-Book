# Relationship Coverage Scorecard

**Date:** 2026-06-15  
**User:** Abel Mendoza (`789bd607-e063-466f-a9ef-f68d24e8bb57`)

---

## Graph before vs after

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| `character_relationships` count | **0** | **21** | +21 |
| Family benchmark coverage | 0/9 | **9/9** | +9 |
| Social benchmark coverage | 0/7 | **6/7** | +6 |
| Career benchmark coverage | 0/6 | **2/6** | +2 |
| Romantic benchmark coverage | 0/2 | **2/2** | +2 |
| entity_facts used as evidence | 0 | **9+** | — |

---

## Coverage scores (0–100)

| Dimension | Before | After | Notes |
|-----------|--------|-------|-------|
| **Entity Coverage** | 58 | 58 | Unchanged — entities already existed |
| **Relationship Coverage** | **0** | **62** | 21 edges / ~34 expected protagonist links |
| **Family Coverage** | **5** | **72** | 9/9 names have edges; kinship on Abuela, Tío Juan |
| **Career Coverage** | **10** | **35** | Kelly recruiter, Rafeh mentor only |
| **Social Coverage** | **15** | **68** | Andrew friend fact-backed; Daisy gap |
| **Romantic Coverage** | **20** | **75** | Sol + Ashley edges with evidence |

---

## Life reconstruction score

| | Before | After | Δ |
|---|--------|-------|---|
| **Overall trust (life reconstruction)** | **31** | **46** | **+15** |

### Component impact

| Component | Before | After |
|-----------|--------|-------|
| Memory Accuracy | 26 | 28 |
| Entity Accuracy | 58 | 58 |
| Timeline Accuracy | 12 | 12 |
| **Relationship Accuracy** | **8** | **55** |
| Recall Accuracy (strict) | 44 | **52** |
| Thread Continuity | 42 | 42 |
| Biography Quality | 28 | **35** |

**Weighted overall:** ~46/100 (was 31/100)

---

## Can LoreBook reconstruct relationships today?

### Partial YES for named people — NO for full life graph

- ✅ "How am I related to Tío Juan?" → family / uncle
- ✅ "Who is Kelly?" → coworker / recruiter
- ✅ "What happened with Sol?" → romantic context
- ⚠️ "Who lives with me?" → returns edges but no household truth
- ❌ Amazon / LoreBook / org membership not in relationship graph

---

## Top fixes made

1. Mine 43 relationship `entity_facts` into `character_relationships`
2. Protagonist linkage from journal + chat (Me character)
3. Fact-backed type precedence over chat noise
4. Per-person chat snippets (fixes Sol text polluting Abuela type)
5. Recall patterns: "How am I related to", "Who lives with me", "What role did"
6. `loadProtagonistRelationshipCandidates` for household queries
7. Diagnostics endpoint `POST /recover-relationships`
8. Tests for fact parser + name resolution

---

## Top remaining gaps

1. Sync `romantic_relationships` → `character_relationships`
2. Organization ↔ character membership edges
3. Household / lives-with from group_candidates
4. Merge duplicate characters (Tío/Tio Juan) for cleaner graph
5. Daisy protagonist edge
6. Career orgs: Amazon, Vanguard, Serve Robotics
7. Inter-character edges beyond protagonist star graph
8. Relationship status (ended/blocked) from Sol facts
9. Confidence scoring in recall ranking
10. Re-run recovery on thread ingest (hook existing pipeline)

---

## Related docs

- [relationship-graph-audit.md](./relationship-graph-audit.md)
- [relationship-recovery-report.md](./relationship-recovery-report.md)
- [life-reconstruction-audit.md](./life-reconstruction-audit.md)
- [trust-scorecard.md](./trust-scorecard.md)
