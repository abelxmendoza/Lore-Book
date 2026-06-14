# Automatic Group & Network Detection — Plan

Goal: make Lorebook automatically do what we did by hand for `abelxmendoza@gmail.com`
— read all conversations and journals, figure out who belongs to which group
(family households, scenes, employers/agencies, bands, bootcamps), name and
categorize each group, wire up the person-to-person network, and surface it in
the UI — **continuously, cost-effectively, and more reliably than a one-off
manual pass.**

This documents what exists today, the gaps that forced manual fixes (Kforce,
Los Goths, Tía Grace's household), and a staged plan to close them.

---

## 1. What already exists

| Piece | File | Role |
|---|---|---|
| Signal extraction | `groupDetectionService.ts` | Regex/keyword pass over text → candidate groups, types, member names, employer names. |
| Background scanner | `workers/groupDetectionWorker.ts` | On boot: backfills ~1yr. Every 15 min: re-scans last 3 days. Groups user messages **by session**, then calls candidate service. |
| Candidate lifecycle | `groupCandidateService.ts` | Dedupes by source id, builds confidence (logistic curve), auto-creates named groups at `confidence ≥ 0.90`, else stores candidates surfaced at `≥ 0.75` / `occurrence ≥ 2`. |
| Person network | `characterConnectionService.ts` | Records bidirectional `associated_with_character_ids` co-mentions per detected group. |
| Classification | `entityFactsService.ts`, `characterImportanceService.ts` | Archetype/relationship + importance (incl. family floor & estrangement nuance). |
| UI | `OrganizationsBook.tsx`, `GroupSuggestions.tsx`, `CharacterDetailModal` Connections tab | Renders confirmed orgs + pending suggestions + the network. |

**The pipeline is real and running.** The gaps are about *scope of reasoning*
and *categorization quality*, not plumbing.

---

## 2. Why the manual pass beat the automated one (the gaps)

1. **Per-session blindness (the Kforce bug).** The worker clusters co-mentions
   *within a single conversation*. "Kforce hired me" lived in one session;
   "Sam is my recruiter / Kelly does onboarding" lived in others. No single
   session contained all three, so the agency link was never formed. A human
   reading *all* threads connects them trivially.

2. **No entity-centric aggregation.** We aggregate by *group candidate*, never
   by *person across their whole history*. "Where does Sam appear, and what
   org words co-occur with Sam everywhere?" is never asked.

3. **Thin categorization.** Regex distinguishes family/company/band but misses
   *scenes/subcultures* (Los Goths), *sub-households* within a family (Tía
   Grace's house vs. Abuela's), and *employer-vs-public-company* nuance
   (Kforce mentioned next to Amazon). We patched employer detection by hand.

4. **Naming is mechanical.** "Sam & Kelly Circle" instead of "Kforce". Good
   names need the surrounding narrative ("the agency that hired me"), which a
   keyword pass can't synthesize.

5. **No relationship inference between groups.** Kforce → Amazon (placement)
   was set manually. Nothing infers org↔org edges.

---

## 3. Target architecture

Add one **entity-centric aggregation layer** between raw scanning and candidate
creation, and a **cheap-first, LLM-last** decision flow.

```
threads + journals
      │
      ▼
[1] Cheap deterministic pass  ← already exists (regex, co-mention, employer rules)
      │  emits: mentions(person, sourceId, sessionId, ts) + raw signals
      ▼
[2] Entity Profile Aggregator (NEW)
      │  per person: all sessions, co-mentions (global), org words nearby,
      │  kinship/role words, first/last seen, frequency
      │  per candidate-org: all member mentions across ALL sessions
      ▼
[3] Cluster builder (NEW, cheap)
      │  global co-occurrence graph → connected components / communities
      │  (union-find or label propagation). Cross-session by construction.
      ▼
[4] Classifier + Namer
      │  4a. Deterministic: confident type/name from rules → auto-create
      │  4b. Ambiguous only: ONE batched LLM call per user per run
      │      (cluster summaries in, {name, type, members, role, group↔group} out)
      ▼
[5] groupCandidateService  ← unchanged write path (auto-create / surface)
[6] characterConnectionService + org relationships
```

Only **step 4b** spends tokens, and only on the residue the rules can't settle.

---

## 4. Cost-effectiveness strategy

The expensive thing is LLM tokens × users × frequency. Controls:

- **Deterministic first, LLM last.** Rules already resolve the majority
  (named family, obvious employers, bands). Most clusters never reach the LLM.
- **One batched call per user per scan**, not per message/per group. Send a
  compact digest of *unresolved* clusters (names + 1–2 evidence snippets each),
  get structured JSON back. Caps cost at ~1 call/user/run.
- **Incremental + dirty-flagging.** Only re-aggregate people/sessions touched
  since last run (the worker already tracks recency; extend with a
  `last_scanned_at` watermark and a per-user "society dirty" flag set on new
  messages). Steady-state cost ≈ near-zero for inactive users.
- **Idempotent + cached.** Cluster hashes (sorted member-id set + type) skip
  re-classification when unchanged. Reuse the existing source-id dedupe.
- **Cheap embeddings for fuzzy linking** instead of LLM where possible: cosine
  on name/context embeddings to merge "Kforce"/"K-force"/"the agency".
- **Budget guardrails.** Per-user daily token cap; degrade to rules-only when
  exceeded. Backfill throttled (already capped at 400 items, concurrency 2).

Rough target: a full re-map of an active user ≈ 1 LLM call; incremental cycles
usually 0 calls.

---

## 5. Categorization improvements (match the manual quality)

Extend the type taxonomy and rules so the auto-pass reproduces our manual calls:

- **`scene` / subculture** (Los Goths): cluster of people sharing venue/activity
  words (club, goth night, DJ, perform, makeup) + recurring co-mentions, not
  kin and not a registered company → `group_type: scene`, `membership: fuzzy`.
- **Family sub-households** (Tía Grace's household): kinship terms anchored to a
  head ("Tía Grace's place", cousins visited together) → a `family` group
  distinct from the core "My Family", linked by shared people.
- **Employer vs. public company** (Kforce next to Amazon): hiring verbs
  (recruiter, onboarding, hired me, I-9, background check, staffing) force
  `group_type: company`, `is_public_entity: false`, `user_relationship: member`.
  *(Shipped — keep as the canonical rule and add tests.)*
- **Institution / program** (Clever Programmer Bootcamp): teach/learn/course/
  bootcamp/tuition words + a mentor figure → `institution`, user = `alumnus`.
- **Org↔org inference**: when an employer cluster and a workplace cluster share
  the hiring narrative ("hired me through X for the Y job"), emit an
  `affiliated_with` org relationship automatically.

Each rule should carry a confidence and an evidence snippet for the UI ("why
we think this").

## 6. Network / bonds quality

- Weight edges by **co-mention frequency × recency × shared-context type**, so
  the network reflects real closeness, not one accidental mention.
- Record the *reason* for an edge (same group, same scene, family) to drive the
  UI grouping and the relationship labels.
- Keep the additive guarantee: never delete user-curated relationships.

---

## 7. Rollout (staged, low-risk)

1. **Phase 0 — lock in fixes (done):** employer detection, family floor +
   estrangement, per-group co-mention connections, the manual data corrections.
2. **Phase 1 — cross-session aggregation (DONE):** `society/` module —
   `coOccurrenceGraph` (global, cross-session, weighted), `societyMapper` (pure
   clustering + taxonomy), `societyMappingService` (orchestration), wired into
   `groupDetectionWorker` on a 6h cadence. Fixes the Kforce class of bug:
   employer↔people↔workplace are linked even when they appear in different
   conversations.
3. **Phase 2 — taxonomy + rules (DONE):** shared `signals.ts` (one source of
   truth for family/work/scene/band/institution + employer/agency/school name
   extraction), staffing-specific people-bridge, scene/family/institution
   typing, and org↔org affiliation inference (agency → workplace). Verified on
   the abelxmendoza history: it auto-reproduces Kforce(+Sam/Kelly), the goth
   scene, the family, and the Kforce→Amazon link.
4. **Phase 3 — batched LLM resolver (DONE):** `society/societyResolver.ts`.
   One batched completion per user per run, and ONLY for the fuzzy
   co-occurrence clusters the rules couldn't name/type (employer/institution
   clusters skip it). Guarded by: a process-wide daily call budget
   (`SOCIETY_LLM_DAILY_BUDGET`), an in-memory cache keyed by cluster +
   member-set (unchanged clusters never re-call), a global on/off flag
   (`SOCIETY_LLM_RESOLVER`), and a hard fallback to the deterministic result on
   any error. The model can also `drop` a coincidental cluster.
5. **Phase 4 — review UI (DONE):** `GroupSuggestions` now shows a "Why this was
   detected" evidence line (from the society-mapper metadata: anchor + signals,
   "refined by AI" when applicable) and adds a **Merge into…** action
   (`POST /api/group-candidates/:id/merge` → `groupCandidateService.mergeCandidate`)
   so a detected group can be folded into an existing org instead of creating a
   duplicate. Confirm (Create) and reject (Not now) already existed.
6. **Phase 5 — feedback loop (DONE, first slice):** rejections are now sticky.
   When a user dismisses a detected group, a re-detection of the same cluster
   (≥ 2 shared members or same name) is suppressed at the ingest chokepoint —
   it won't re-surface or auto-create, and the society mapper pre-filters it
   before spending an LLM call. Backed by a 60s per-user rejection cache,
   invalidated immediately on reject.
   *Remaining:* weight tuning / few-shot seeding from accept-vs-reject history,
   and persisting the resolver cache to a table for cross-restart reuse.

### Code map (Phase 3/4/5)

- `apps/server/src/services/society/societyResolver.ts` — batched LLM naming/typing (+ tests).
- `apps/server/src/services/groupCandidateService.ts` — `mergeCandidate`, sticky rejection memory (`wasRejected`).
- `apps/server/src/utils/clusterMatch.ts` — pure cluster-equality helpers (+ tests).
- `apps/server/src/routes/groupCandidates.ts` — `POST /:id/merge`.
- `apps/server/src/services/society/societyMappingService.ts` — pre-filters rejected clusters before resolve/ingest.
- `apps/web/src/components/groups/GroupSuggestions.tsx` — evidence line + Merge action.

### How the over-merge problem was solved (Phase 1/2 notes)

Real histories are large mixed "life update" conversations, so naive
whole-session co-occurrence links everyone, and connected-components collapses
all groups into one blob. The shipped mapper avoids this with:

- **Fine windows** (~240 chars) instead of whole sessions, so people are only
  linked when mentioned *together*, not merely in the same session.
- **Strong edges only** — a pair must recur (weight ≥ 2) or sit in a triangle.
- **Label propagation** over the strong-edge subgraph, which lets two dense
  cliques sharing a single bridge settle into separate communities.
- **Density gate** (≥ 0.5, size ≤ 12) — loose blobs are dropped rather than
  mislabeled (precision-first).
- **Staffing-specific bridge** — only recruiting language (recruiter/onboarding/
  hired) attaches people to an agency, and only when there is a single
  unambiguous employer.

### Code map (Phase 1/2)

- `apps/server/src/services/society/signals.ts` — shared lexical signals + name extraction.
- `apps/server/src/services/society/coOccurrenceGraph.ts` — weighted graph + `communities()`.
- `apps/server/src/services/society/societyMapper.ts` — pure clustering + taxonomy + affiliations.
- `apps/server/src/services/society/societyMappingService.ts` — load history → window → map → persist.
- `apps/server/src/workers/groupDetectionWorker.ts` — 6h society cadence.
- `scripts/map-society.ts` — on-demand dry-run / execute tool.
- Tests: `apps/server/src/services/society/societyMapper.test.ts` (golden + guardrails).

---

## 8. Validation

- **Golden fixtures:** snapshot the abelxmendoza threads → assert the pipeline
  reproduces Kforce(+Amazon), Los Goths, Tía Grace's household, Clever
  Programmer Bootcamp, and the family floor. These become regression tests so
  the auto-pass provably matches the manual result.
- **Precision guardrails:** unit tests that "Goth Tio" never lands in family and
  Kforce never becomes a public entity.
- **Cost telemetry:** log LLM calls/tokens per scan; alert if calls/user/run > 1.
