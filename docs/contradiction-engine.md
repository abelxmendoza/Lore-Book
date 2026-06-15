# Contradiction Engine (P2-B)

Detects where a user's **stated identity** and **lived behavior** diverge — deterministically, from evidence. Builds directly on the Revealed Preference Engine (P2-A): a contradiction is a proven gap between a category's `stated` and `revealed` signals.

> The engine **proves** contradictions from counts/shares/recency. No LLM produces them. A future Epiphany Engine will only *explain* what is already proven.

---

## Architecture

```
preference_signals + preference_evidence   (from the Revealed Preference Engine)
        │
        ▼   contradictionDetectors  ← pure: classifyDivergence / computeSeverity / detectValueConflicts
   per-category divergence { aligned | tension | blind_spot | insufficient }  + value conflicts
        │
        ▼   contradictionEngine.detect()
   build rows: type, section, severity, confidence, evidence sample, non-accusatory detail
        │
        ▼   lifecycle upsert (open ⇄ resolved; dismissed sticks)
   contradiction_signals
        │
        ▼   getReport()                         getEpiphanyCandidates()  ← Phase 6
   Discovery ▸ Contradictions panel             queryable candidate epiphanies
```

Two layers: **pure detectors** (`contradictionDetectors.ts`, no DB/LLM, fully unit-tested) and the **engine** (`contradictionEngine.ts`, reads RPE signals, persists with lifecycle).

### Divergence model
For each category, comparing `stated` vs `revealed`:

| Condition | Result | Type | Section |
|---|---|---|---|
| says **and** does (proportionally) | aligned | — | Strong Alignment |
| says, but actions don't support it | **tension** | GOAL_VS_ACTION / IDENTITY_VS_BEHAVIOR / STATED_VS_REVEALED | Tensions / Identity Conflicts |
| stated goal acted on before, not recently | **tension** | INTENTION_OUTCOME | Tensions |
| does it a lot, never names it (`stated=0, revealed≥3`) | **blind spot** | IDENTITY_VS_BEHAVIOR | Blind Spots |
| stated value, competing category dominates time | **value conflict** | VALUE_CONFLICT | Tensions |
| not enough on either side | insufficient | — | (not shown as a contradiction) |

**Blind spots are the inverse contradiction** — behavior reveals a value/identity the user never claims. They are the divergence that surfaces on real data even when a user rarely states intentions.

### Severity (Phase 3)
`severity = f(evidence_count, |alignment_delta|, recency, duration)`:
`0.4·evidence + 0.3·gap + 0.15·recency + 0.15·persistence` → high ≥ 0.6, medium ≥ 0.38, else low. So a divergence backed by lots of recent, persistent, lopsided evidence ranks high; a thin, stale one ranks low.

### Lifecycle
`detect()` upserts current divergences as `open` (preserving `first_detected_at`); any previously-`open` contradiction no longer detected becomes `resolved` (kept, not deleted) → the **Resolved** section is real. User-`dismissed` rows stay dismissed.

---

## Data model — `contradiction_signals`
`type` (5 enum) · `section` · `category_key`/`label` · `stated_signal_id`/`revealed_signal_id` · `conflict_with_key` · `stated_count`/`revealed_count` · `alignment_delta` (stated_share − revealed_share) · `confidence` · `evidence_count` · `severity` · `status` (open/resolved/dismissed) · `detail` (non-accusatory) · `evidence` (jsonb sample of supporting episodes) · timestamps. Unique `(user_id, type, category_key)`; RLS read-own; a partial index on `(confidence DESC, evidence_count DESC) WHERE status='open'` powers epiphany queries.

---

## Trust (Phase 5) — enforced
- **Never accuse / diagnose / speculate.** `buildDetail` only emits "you've expressed…", "current actions don't strongly support…", "evidence suggests…". A test asserts the absence of accusatory phrasing.
- **No contradiction without evidence.** Every row carries `confidence`, `evidence_count`, and an `evidence` sample of real episodes (verified: `jsonb_array_length(evidence) = min(evidence_count, 4)` for all rows).
- **Value conflicts require a stated value** on one side → never speculative ("nightlife conflicts with fitness" only fires if fitness was stated *and* nightlife dominates time).
- **Insufficient evidence stays silent** — thin signals never become claims.

---

## Complexity
Let `C` = categories (~12, constant), `E` = preference-evidence rows.

| Step | Cost |
|---|---|
| load RPE signals + evidence | 2 queries, `O(E)` |
| detect (classify each category + value pairs) | `O(C)` pure |
| persist | 1 batch upsert + ≤C resolve updates |
| getReport | 2 queries, `O(C + E)` in memory |

Constant query count, linear in evidence. Detection for the test account is sub-millisecond CPU.

---

## Phase 7 — run against a real account
Founder account (8 RPE categories). Because this user reveals priorities through action but rarely *states* them, the engine honestly finds **7 blind spots, 0 false tensions, 1 insufficient**:

| Category | Status | Severity | Confidence | Evidence |
|---|---|---|---|---|
| Family | blind_spot | high | 0.99 | 18 |
| LoreBook | blind_spot | high | 0.96 | 13 |
| Nightlife | blind_spot | high | 0.94 | 11 |
| Career | blind_spot | high | 0.92 | 10 |
| Coding & Building | blind_spot | medium | 0.78 | 6 |
| Fitness | blind_spot | low | 0.63 | 4 |
| Friends | blind_spot | low | 0.53 | 3 |
| Financial Freedom | insufficient | — | 0.39 | 2 |

The finding, in the engine's own non-accusatory words: *"Your actions strongly reflect Family (18 supporting episodes), though you rarely name it as something you value — evidence suggests this is a lived priority you haven't consciously claimed."* Trust invariant verified in SQL (every row has supporting evidence).

---

## API (CORE_RUNTIME)
- `GET  /api/contradictions` — report (lazily detects on first use)
- `POST /api/contradictions/detect` — re-detect (lifecycle)
- `GET  /api/contradictions/epiphany-candidates` — Phase 6 candidates
- `GET  /api/contradictions/:id/evidence` — supporting episodes

## Discovery surface
`Discovery ▸ Contradictions`: Strong Alignment, Tensions (say ≫ do), Blind Spots (do ≫ say), Identity Conflicts, Resolved — each item expandable to its evidence, severity- and confidence-tagged, phrased without judgment.

---

## Future: Epiphany Engine integration (Phase 6)
`getEpiphanyCandidates()` already exposes the queryable seeds the next sprint consumes:
- **Blind spots** with `confidence ≥ 0.7` and `evidence ≥ 5` → `unstated_lived_priority` epiphanies ("you organize your life around X but never name it").
- **High-severity** persistent divergences → `persistent_divergence` epiphanies ("you keep saying X but doing Y").

Each candidate carries the proven `detail` as its **seed** — the Epiphany Engine's LLM step will *articulate* it (within evidence), never originate it. These become `value`/`identity` nodes in the life graph (`docs/life-graph-ontology.md`) with `contradiction_signals` + `preference_evidence` as provenance.

---

## Files
Migration `supabase/migrations/20260616120000_contradiction_engine.sql` · `apps/server/src/services/contradiction/{contradictionDetectors,contradictionEngine}.ts` · `apps/server/src/routes/contradictions.ts` (+registry) · `apps/server/scripts/run-contradiction-engine.ts` · `apps/server/tests/services/contradictionEngine.test.ts` (13 cases) · `apps/web/src/components/discovery/ContradictionsPanel.tsx` (+nav/hub).

## Known limitations / next sprint
- **Tensions need stated signals.** The founder produced 0 stated, so only blind spots surfaced. As RPE's stated detection broadens, GOAL_VS_ACTION / IDENTITY_VS_BEHAVIOR tensions and VALUE_CONFLICTs light up.
- **Value-conflict lexicon is curated** (7 pairs); could learn competing pairs from co-occurrence.
- **Detection is on-read/on-demand**; move to the ingest hook so it stays fresh incrementally.
- **Next sprint: the Epiphany Engine**, built on episodes + preferences + contradictions + evidence + trust.
