# Dynamic Classification Model

Status: Classification Intelligence Sprint — design (Phases 2–6).
Companion: [classification-audit.md](classification-audit.md) (why), [classification-roadmap.md](classification-roadmap.md) (when).

## The shape of the solution

Three layers, with strictly different change rates:

```
ROOT TYPE        stable, ~18 values, changes ~never          → schema enum / const
  └ CLASSIFICATION   dynamic, learned, e.g. "nightclub"      → rows in a table, grow freely
       └ TAGS         free multi-label, e.g. "techno", "18+" → array column
```

- **Root type** answers *what kind of thing is this, fundamentally* — and is the only thing other systems join on.
- **Classification** answers *what specifically* — it is data, not code, so adding "nightclub" never requires a migration or a deploy.
- **Tags** are unconstrained descriptors for retrieval and faceting.

The root never explodes (Phase 2). The classification layer absorbs all the variety (Phase 3). Confidence decides what is allowed to become a classification and what is allowed to change a root (Phase 4). Users correct it and the system learns (Phase 5). Everything else reads the root and, optionally, the classification (Phase 6).

---

## Phase 2 — Canonical root ontology (18 types)

These are the **stable roots**. They collapse the four competing vocabularies from the audit into one. Changing this list is a governance event, not a feature.

| # | Root | Subsumes (from today's vocabularies) | Promotable to Character? |
| --- | --- | --- | --- |
| 1 | `Person` | person, PERSON, character(stage) | **Yes** (earned) |
| 2 | `Family` | FAMILY, some HOUSEHOLD | No |
| 3 | `Group` | GROUP, crews/bands-as-social | No |
| 4 | `Organization` | ORGANIZATION, COMPANY, ORG | No |
| 5 | `Place` | PLACE, LOCATION, HOUSEHOLD(dwelling) | No |
| 6 | `Event` | EVENT (life events) | No |
| 7 | `Project` | PROJECT, platform | No |
| 8 | `Product` | PRODUCT | No |
| 9 | `App` | APP | No |
| 10 | `Brand` | BRAND | No |
| 11 | `Media` | MEDIA | No |
| 12 | `Skill` | SKILL | No |
| 13 | `Pet` | PET | No |
| 14 | `Vehicle` | VEHICLE | No |
| 15 | `FoodDrink` | FOOD_DRINK | No |
| 16 | `Possession` | generic `thing`/object | No |
| 17 | `Concept` | values, beliefs, topics, themes (bridge to the internal-life graph) | No |
| 18 | `Unknown` | UNKNOWN + UNCLASSIFIED (merged) | No (sentinel) |

Decisions baked in:
- **Merge the duplicate pairs**: LOCATION→Place, COMPANY→Organization, UNCLASSIFIED→Unknown.
- **`character` is not a root.** Person is the root; Character is a *card produced by promotion*. The certified index should key on Person, not "character."
- **HOUSEHOLD becomes a classification under Place** (`Place → dwelling → household`), not its own root — it was never a clean fourth thing.
- **Concept** is added so internal-life nodes (from `life-graph-ontology.md`) have a home in the same ontology instead of a parallel one.

Non-entity classification axes keep their own small stable enums (they are already clean): `GoalType` (6), `skill_category` (10). These stay — the sprawl was never here.

---

## Phase 3 — Dynamic classifications

### Data model

```sql
-- The dynamic vocabulary. Rows, not code.
create table classifications (
  id              uuid primary key default gen_random_uuid(),
  root_type       text not null,                 -- one of the 18 roots
  label           text not null,                 -- "nightclub", "punk band"
  parent_id       uuid references classifications(id),  -- hierarchy within a root
  status          text not null default 'proposed',     -- proposed | active | deprecated
  confidence      real not null default 0,       -- 0..1, aggregate evidence
  usage_count     int  not null default 0,       -- how many entities use it
  created_by      text not null default 'system',-- system | user | llm
  canonical_id    uuid references classifications(id),  -- merge target for dupes
  created_at      timestamptz default now(),
  unique (root_type, label)
);

-- Entities carry the stable root + an optional dynamic classification + free tags.
alter table <entity_table>
  add column root_type        text not null default 'Unknown',  -- joinable, stable
  add column classification_id uuid references classifications(id),
  add column tags             text[] not null default '{}';
```

### How the three layers compose

```
PLACE                                  GROUP
 └ nightclub      (classification)      └ band            (classification)
    └ techno club (child class.)          └ punk band     (child class.)
       tags: [18+, downtown]                 tags: [local, 4-piece]
```

- **Root** is on the entity and is enum-stable. Joins, resolution keys, access rules, and Character-eligibility read this and only this.
- **Classification** is a row. "nightclub" is created once (status `proposed`), promoted to `active` when enough evidence accrues, and reused by every later nightclub. New specificity = new row, never a migration.
- **Hierarchy** is `parent_id` *within the same root*. A classification may never re-parent across roots (a `nightclub` is always a `Place`).
- **Tags** are the escape valve — anything that isn't worth a classification row.

### Retrofitting the audit's sprawl
- **Swimlanes** (`life/robotics/mma/work/creative`) become classifications under a `Concept`/lane namespace, seeded but user-extensible — no more hardcoded hobby list.
- **Free `relationship_type`** becomes a classification table for *edges* (same mechanics: `root_kind = relationship`, label = "mentor", dedup via `canonical_id`), killing the spelling-variant row fork.

---

## Phase 4 — Confidence model

Every classification decision produces `{ type, confidence, reason }` (the `Classification` interface already does — `entityClassifier.ts:20`). Confidence drives four bands.

### Signal → confidence

```
confidence = clamp01(
    w_lex   * lexiconMatchStrength        // exact lexicon / pattern hit (deterministic, ~1.0)
  + w_evid  * f(distinctEvidenceCount)    // saturating: 1→0.3, 3→0.6, 6→0.85
  + w_agree * sourceAgreement             // do independent extractions agree
  + w_user  * userConfirmation            // explicit confirm = hard boost
  - w_conflict * contradictionPenalty     // contradicting evidence
)
```

Deterministic lexicon/pattern hits dominate — the classifier stays mostly rules-first, LLM only as a tie-breaker.

### Thresholds (start here, tune with data)

| Band | Range | Action |
| --- | --- | --- |
| **Promote** | `≥ 0.80` **and** `distinctEvidence ≥ 3` | Apply root type; a `proposed` classification becomes `active`; Person may enter Character promotion review |
| **Review** | `0.50 – 0.80` | Keep tentative; surface for user/admin confirmation; do **not** create a Character |
| **Hold** | `0.30 – 0.50` | Stay `Unknown`; keep collecting evidence |
| **Reject** | `< 0.30` or contradicted | Block; never promote; log reason |

Two promotion ladders, distinct:
1. **Root promotion** — Unknown → a concrete root. Gated as above.
2. **Classification promotion** — a `proposed` label → `active` (seen on ≥K distinct entities). This is what prevents one-off LLM coinages from becoming permanent vocabulary.

### Anti-pollution hard gates (override everything)

These reproduce the existing deterministic protections as **non-negotiable gates**, evaluated before confidence:

- **PERSON requires positive evidence** (kinship/honorific prefix, or person-action context). No evidence ⇒ never Person, regardless of LLM confidence. *(blocks `Moreno Valley → Person`)*
- **Company-prefixed product pattern** (`Amazon Ring`, `Apple Watch`) ⇒ Product, not Person. *(blocks `Amazon Ring → Person`)*
- **App/FoodDrink/Brand lexicon precedence** runs before person inference. *(blocks `Find My → Person`)*
- **Geographic / venue / locative suffix** ⇒ Place before person.

A gate failure forces `Unknown` (or the gated root) and records the reason — it cannot be overridden by confidence score.

---

## Phase 5 — User feedback loop

### Corrections

```sql
create table classification_corrections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  entity_id     uuid not null,
  from_root     text,  from_classification_id uuid,
  to_root       text,  to_classification_id   uuid,
  reason        text,
  created_at    timestamptz default now()
);
```

A correction is the **highest-weight signal** (`w_user`): it immediately re-roots the entity and:
- if the user types a new classification label that doesn't exist, create it (`created_by = user`, status jumps toward `active`);
- if they correct *to* an existing label, increment its `usage_count`/`confidence`.

### Learning (without retraining a model)

Corrections adjust **priors**, not weights:
- A correction `X → Place` adds/raises the lexicon/pattern prior for tokens in X's name (e.g. a new geographic suffix), so the *next* similar mention classifies correctly deterministically.
- N corrections of the same `from→to` within a root auto-propose a rule for review (e.g. "names ending in `Valley` ⇒ Place").
- Repeated rejections of a `proposed` classification deprecate it (`status = deprecated`), pruning sprawl.

This keeps the system **rules-first and explainable** — learning hardens deterministic rules rather than producing an opaque classifier.

### History + explainability

```sql
create table classification_history (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null,
  root_type     text not null,
  classification_id uuid,
  confidence    real,
  source        text,   -- lexicon | pattern | llm | user_correction | promotion
  reason        text,   -- human-readable: "geographic suffix 'Valley' + locative context"
  created_at    timestamptz default now()
);
```

- Append-only — never overwrite a classification, write a new history row. Full provenance.
- Every entity surfaces **"why is this a Place?"** from the latest `reason` + linked evidence — the `reason` field already exists on `Classification`; this persists it.
- Ties into the existing `provenance_edges` / `pipeline_runs` observability rather than a parallel log.

---

## Phase 6 — How resolution & recovery consume classifications

Principle: **one boundary, root-type is the join key, classification is advisory.** Introduce a single `classify(mention, context) → Classification` entry point (the existing `entityClassifier` extended) that *all* consumers call; nobody re-derives types.

| Consumer | Status (from audit) | How it should consume classifications |
| --- | --- | --- |
| Entity resolution (live: `entityClassifier` + people/omega; `entityResolutionCore` is **dead**) | LIVE / dead core | Resolution keys on **root_type** only (Person dedups against Person, never against Place). Classification + tags feed match *features*, not match *keys*. Retire the dead core; do not build for it. |
| Episode segmentation (`episodeSegmentationCore` **dead**) | dead | No live consumer today. When revived, segment boundaries can use Event-root classifications; until then, **do not design coupling to it.** |
| Relationship recovery (`relationshipFoundationService`, **batch-only**) | batch | Edge *kind* becomes a `relationship`-namespace classification (kills free-string sprawl). Only connect entities whose **roots** permit the edge (Person–Person, Person–Organization). |
| Event recovery (`eventRecoveryService`, **batch-only**) | batch | Consumes `Event` root; assigns life-event classifications (party/wedding/move) instead of free `event_type`. |
| Thread intelligence (`threadSummaryService`, **LIVE**) | LIVE | Reads root + classification to label and group threads; replaces hardcoded swimlanes with lane-classifications. |

Net rule: **everything joins on the 18 stable roots; classifications and tags are enrichment that can grow and be corrected without breaking any consumer.**

---

## Why this stops the explosion

- The thing other code depends on (root) **cannot grow** — it's an enum behind governance.
- The thing that *needs* to grow (classification) **is data** — promotion-gated, dedup-merged (`canonical_id`), and prunable (`deprecated`).
- New variety costs **a row**, not a migration or a type-system change.
- Corrections harden deterministic rules, so accuracy rises over time **without** an opaque model and **without** new root types.
