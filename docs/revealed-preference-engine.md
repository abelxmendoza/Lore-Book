# Revealed Preference Engine (P2-A)

First production differentiator of LoreBook V2. Discovers a user's **actual** priorities, values, motivations and interests from what they **repeatedly do**, not what they say — fully deterministic, fully evidence-backed, no LLM.

> "Not what a user says matters. What a user repeatedly DOES matters."

---

## Architecture

```
journal_entries + chat_messages (the user's own episodes)
        │
        ▼   preferenceTaxonomy.extractSignals()   ← pure, deterministic, per-sentence
   raw matches { categoryKey, type, signalType: stated|revealed, matchedTerm }
        │
        ▼   revealedPreferenceService.rescan()
   aggregate per category → counts, shares, alignment, trend, confidence
        │
        ▼   wipe + rebuild (idempotent)
   preference_signals  ──1:N──▶  preference_evidence   (provenance; one row per supporting episode)
        │
        ▼   getRevealedSelf()
   GET /api/revealed-self  →  Discovery ▸ Revealed Self panel
```

Two layers, cleanly separated:
- **Pure core** (`preferenceTaxonomy.ts`) — extraction + scoring math. No DB, no LLM, no I/O → 100% unit-testable.
- **Service** (`revealedPreferenceService.ts`) — orchestrates the core over a user's episodes and persists signals + evidence.

### Stated vs revealed (the central distinction)
Per **sentence**:
- A **stated cue** (`I want / I value / I care about / matters to me / my goal …`) co-occurring with a category topic ⇒ **STATED** evidence ("you *say* this matters").
- Otherwise, a **behavioral** match (`went to the gym`, `took Abuela to Costco`, `building LoreBook`, `skipped the party to code`) ⇒ **REVEALED** evidence ("you *did* this").

A stated sentence is **not** double-counted as revealed for the same category. One episode supports a signal **at most once per type**, so `evidence_count == distinct supporting episodes`.

---

## Data model

### `preference_signals` (one row per user × category)
| column | meaning |
|---|---|
| `type` | value / goal / fear / motivation / identity / habit / preference / interest / skill |
| `category_key`, `label` | normalized key + display (`family` → "Family") |
| `stated_count`, `revealed_count`, `evidence_count` | episode counts (revealed = the signal that matters) |
| `confidence` | `1 - e^(-evidence/4)` — 0 with no evidence, saturates toward 1 |
| `stated_share`, `revealed_share` | share of all stated / all revealed signal |
| `alignment_score` | `revealed_share - stated_share` (−1..1) |
| `alignment_label` | strongly_aligned / aligned / weakly_aligned / revealed_only / stated_only |
| `recent_revealed`, `prior_revealed`, `trend` | 30-day vs 30–90-day windows → emerging/declining |
| `first_seen_at`, `last_seen_at` | episode time span |

### `preference_evidence` (provenance — the trust spine)
One row per supporting episode: `signal_id`, `signal_type`, `source` (journal/chat), `source_id`, `matched_term`, `snippet`, `occurred_at`.
**Unique** `(user_id, signal_id, source, source_id, signal_type)` → idempotent rescans, honest counts.
RLS: users read only their own rows; the backend writes via service role.

---

## Algorithms & complexity

Let `E` = episodes, `L` = avg episode length, `C` = categories (constant, ~12).

| Step | Work | Complexity |
|---|---|---|
| `extractSignals` per episode | C categories × regex over sentences | `O(L · C)` |
| `rescan` extraction | all episodes | `O(E · L · C)` = **O(E·L)** (C constant) |
| aggregation | one pass over matches | `O(E · C)` |
| persistence | 1 delete + 1 batch insert (signals) + 1 batch insert (evidence) | `O(E)` rows, **3 queries** (no N+1) |
| `getRevealedSelf` | 1 signals query + 1 evidence query, grouped in memory | **2 queries**, `O(E)` |

Linear in episodes, constant query count. For the test account (130 episodes) a rescan is single-digit milliseconds of CPU + 3 round-trips.

### Alignment classification (pure)
```
stated only, never done   → stated_only      (talk, no walk)
done, never stated        → revealed_only    (the hidden priority)
|stated_share−revealed| ≤ ε → strongly_aligned
stated_share ≫ revealed   → weakly_aligned
else                      → aligned (do ≥ say)
```

### Trend (pure)
`trend = recent_rate − prior_rate` over 30-day vs 60-day windows → emerging (> ε) / declining (< −ε).

---

## Trust requirements (Phase 6 — enforced)

The system **never** claims "you value X" without evidence:
1. A `preference_signals` row exists **only** if `rescan` found ≥1 match → and every match writes a `preference_evidence` row. Verified invariant: `evidence_count == COUNT(preference_evidence WHERE signal_id = …)`.
2. Every conclusion carries `confidence`, `evidence_count`, and **sample supporting episodes** (snippet + source). The panel exposes them inline.
3. `confidence(0) == 0`. No evidence ⇒ no confidence ⇒ nothing shown.
4. Deterministic: identical episodes → identical output (no model variance).

---

## Phase 5 — run against a real account

Ran the engine end-to-end on the founder account (39 journals + 91 chat messages):

| Category | Type | Revealed | Stated | Confidence | Alignment |
|---|---|---|---|---|---|
| Family | value | 18 | 0 | 0.99 | revealed_only |
| LoreBook | goal | 13 | 0 | 0.96 | revealed_only |
| Nightlife | interest | 11 | 0 | 0.94 | revealed_only |
| Career | goal | 10 | 0 | 0.92 | revealed_only |
| Coding & Building | skill | 6 | 0 | 0.78 | revealed_only |
| Fitness | identity | 4 | 0 | 0.63 | revealed_only |
| Friends | value | 3 | 0 | 0.53 | revealed_only |
| Financial Freedom | goal | 2 | 0 | 0.39 | revealed_only |

`evidence_count == actual_evidence_rows` for all 8 signals (verified in SQL). The standout finding: **every signal is `revealed_only`** — this user shows their priorities almost entirely through action, rarely declaring them. That gap *is* the revealed-preference insight.

---

## API
- `GET  /api/revealed-self` — the report (lazily scans on first use). CORE_RUNTIME (prod-enabled).
- `POST /api/revealed-self/rescan` — force a fresh rebuild.
- `GET  /api/revealed-self/signal/:id/evidence` — full provenance for one signal.

## Discovery surface
`Discovery ▸ Revealed Self` ([RevealedSelfPanel.tsx](apps/web/src/components/discovery/RevealedSelfPanel.tsx)): "What Actually Receives Your Time" (revealed vs stated bars, confidence, expandable evidence), plus "What You Say Matters", "Emerging", "Weakly Aligned (say ≫ do)", "Declining". Trust banner states the evidence count; every category drills into its supporting episodes.

---

## Future: Epiphany Engine integration

This engine produces the **revealed/stated split** that `docs/epiphany-engine.md` consumes:
- **Value-contradiction epiphanies** — `weakly_aligned` / `stated_only` categories *are* "you say X but do Y" candidates. The `alignment_score` is the surprise signal.
- **Hidden-priority epiphanies** — `revealed_only` with high `revealed_count` is "you organize your life around X but never name it."
- **Emerging/declining** trends feed identity-shift detection (change-points over the windows, extended to a real time series).
- These become `value`/`goal`/`identity` **nodes** in the life graph (`docs/life-graph-ontology.md`), with `preference_evidence` as their `derived_from` provenance — no schema rework, just promotion.

The engine is deliberately deterministic so the epiphany layer can trust it as ground truth and only an LLM *articulates* (never originates) the resulting observation.

---

## Files
- Migration: `supabase/migrations/20260616090000_revealed_preference_engine.sql`
- Core: `apps/server/src/services/revealedPreference/preferenceTaxonomy.ts`
- Service: `apps/server/src/services/revealedPreference/revealedPreferenceService.ts`
- API: `apps/server/src/routes/revealedPreference.ts` (+ registry entry)
- Runner: `apps/server/scripts/run-revealed-preference.ts`
- Tests: `apps/server/tests/services/revealedPreference.test.ts` (18 cases)
- UI: `apps/web/src/components/discovery/RevealedSelfPanel.tsx` (+ nav/hub wiring)

## Known limitations / next sprint
- **Stated detection is conservative** — the founder data produced 0 stated signals; broaden stated cues and detect implicit value statements.
- **Trend needs a longer baseline** — with mostly-recent data, most categories read "emerging"; weight by episode-time coverage.
- **Taxonomy is a fixed lexicon** — next step is letting categories *emerge* (clustering) rather than be enumerated, and adding `relationships`/`robotics` coverage depth.
- **Incremental rescan** — currently a full wipe+rebuild per user (fine at hundreds of episodes); move to incremental on the ingest hook for scale.
