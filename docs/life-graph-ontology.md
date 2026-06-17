# The Life Graph — Complete Ontology

*Cognitive-architecture design. Extends `autobiographical-memory-graph.md` (nodes/edges/episodes).*

**The core realization:** LoreBook today models the **external life** — people, places, events. That is the half of a life you could reconstruct from someone's calendar and contacts. The half that makes a person *a person* — what they believe, fear, want, avoid, repeat — is entirely missing. **A biography of the external life is a résumé. A biography of the internal life is a soul.** This document designs the missing half and the connective tissue between them.

A life graph has **five strata**. External and Episodic exist today. Internal, Pattern, and Narrative/Reflective are the work.

```
┌─ NARRATIVE / REFLECTIVE ─ the meaning   (chapters, arcs, themes, epiphanies)
├─ PATTERN ───────────────  the rhythms   (habits, routines, recurring motifs)
├─ INTERNAL ──────────────  the self      (beliefs, values, fears, desires, identity)
├─ EXTERNAL ──────────────  the world     (people, places, orgs)   ← exists today
└─ EPISODIC ──────────────  the substrate (episodes/events)         ← exists today
```

The strata are connected by edges that cross them — and **those cross-stratum edges are where understanding lives.** "This decision (episode) *revealed* this value (internal)." "This habit (pattern) is *driven by* this fear (internal) rooted in this event (episodic)." A graph that only connects within a stratum is a database; a graph that connects across strata is a psyche.

---

## Stratum 1 — Episodic (substrate, exists)

`episode`, `event`, `scene`. Immutable, time-stamped, verbatim. The ground truth from which everything above is inferred. (Designed in the graph doc.)

## Stratum 2 — External (the world, exists)

`person`, `place`, `organization`, `object`, `group`, `community`, `cultural_identity`.

*Additions worth making:* `object` (a meaningful possession — the guitar, the ring, the car), `community` (a scene/subculture one belongs to), `cultural_identity` (heritage, language, tradition — load-bearing for many lives), `role` (a hat the person wears: parent, founder, caregiver, eldest-sibling — a person occupies multiple roles, and roles carry expectations and conflicts).

## Stratum 3 — Internal (the self — THE missing half)

This is the most important addition in the entire document.

| Node type | What it is | How it's known (anti-hallucination) |
|---|---|---|
| `value` | what one prioritizes (freedom, loyalty, security) | **revealed preference** — inferred from *decisions under conflict*, not from statements |
| `belief` | what one holds true about the world/self | stated + repeatedly enacted |
| `worldview` | the meta-frame (optimist/fatalist, individualist/communal) | abstraction over many beliefs |
| `goal` | a stated future state pursued | stated + episodes of pursuit |
| `desire` / `want` | what is craved (often unstated) | inferred from approach behavior |
| `need` | what is required for wellbeing (often unconscious) | inferred from what restores/depletes |
| `fear` | what is avoided | inferred from **avoidance** episodes |
| `wound` | the formative hurt that drives behavior | the origin event of a fear/pattern (screenwriting's "ghost") |
| `motivation` | the why behind action | links want/need/fear to behavior |
| `internal_conflict` | a tension within (want vs need, two values) | two internal nodes connected by `contradicts` |
| `self_image` | how one sees oneself | stated self-descriptions |
| `identity_theme` | a stable strand of who-one-is | consolidated from recurring self-image + behavior |
| `secret` | something withheld | flagged sensitivity, never surfaced casually |
| `regret` | a wished-different past | stated + counterfactual language |
| `aspiration` / `dream` | a longed-for life (vs concrete goal) | emotional/imaginative language |
| `trauma` | a wound with ongoing dysregulation | high-sensitivity; handled with extreme care |
| `obsession` | a disproportionate recurring focus | frequency + intensity outlier |
| `taste` / `aesthetic` | what one finds beautiful/repellent | preferences across domains |

**The central design principle — revealed vs stated:** humans are unreliable narrators of their own interior. People *say* they value family and *spend* their time on work. The graph must hold **both** the *stated* value and the *revealed* value (inferred from decisions), connect them, and notice the **gap**. That gap is the richest material in any life — and it is the thing the subject themselves cannot see. (See `epiphany-engine.md`.)

> A `value` node is therefore not "what the user told us they value." It is a **hypothesis with two evidence streams** (stated and revealed) and a confidence. When they diverge, that's not a bug — it's an epiphany waiting to surface.

## Stratum 4 — Pattern (the rhythms)

| Node type | What it is |
|---|---|
| `habit` | a repeated behavior (good or ill) |
| `routine` | a structured sequence (morning routine, Sunday calls) |
| `ritual` | a habit with meaning (the anniversary visit) |
| `skill` | a developed capability (with a trajectory) |
| `coping_mechanism` | how one self-regulates under stress (healthy or not) |
| `motif` | a recurring symbol/object/phrase across the life |
| `pattern` | a recurring *behavioral sequence* (trigger→response), e.g. "withdraws when intimacy deepens" |

`pattern` is special: it is a **recurring subgraph**, not a single behavior — the detectable shape that becomes an epiphany.

## Stratum 5 — Narrative / Reflective (the meaning)

| Node type | What it is |
|---|---|
| `life_period` / `era` | a coarse age of life |
| `chapter` | a bounded, named span ("Career Rebuild, 2024") |
| `season` | a felt-tone span ("the lonely winter") — emotional, not just temporal |
| `arc` | a narrative thread across chapters, organized by a goal/conflict |
| `turning_point` | a high-significance, high-causality pivot |
| `theme` | a recurring throughline ("family responsibility") |
| `character_role` | a person's *narrative function* (mentor/ally/antagonist/foil/love) |
| `meaning` | what an episode signified |
| `reflection` | a felt interpretation |
| `insight` | a generalized realization |
| `epiphany` | an identity-level realization (often surprising) |
| `life_lesson` | a confirmed, durable insight one lives by |
| `contradiction` | a surfaced inconsistency (between facts, or stated vs revealed) |

---

## Part 6 — The complete graph (cross-stratum edges)

Node types alone are inert. The **edges across strata** are the architecture of understanding. The essential new edge types:

**Episodic → Internal (the inference edges — the heart of it):**
- `revealed` — *episode* `revealed` *value/fear/need* (a decision exposed a priority). **The single most important new edge.**
- `evidences` — *episode* `evidences` *belief/identity_theme*.
- `triggered` — *episode* `triggered` *emotion/coping_mechanism*.
- `originated` — *event* `originated` *wound/fear* (the formative origin).

**Internal → Behavior (the drive edges):**
- `driven_by` — *habit/decision* `driven_by` *fear/wound/value*.
- `pursues` — *behavior* `pursues` *goal/desire*.
- `avoids` — *behavior* `avoids` *fear*.
- `coping_for` — *coping_mechanism* `coping_for* *wound/stress*.

**Internal ↔ Internal (the psyche edges):**
- `contradicts` — *stated value* `contradicts` *revealed value* (the gap).
- `conflicts_with` — *want* `conflicts_with` *need*; *value* vs *value*.
- `supports` / `reinforces` — beliefs that buttress each other.
- `evolved_into` — *identity_theme(t1)* `evolved_into` *identity_theme(t2)* (growth/shift).

**Pattern edges (the recurrence engine):**
- `instance_of` — *episode* `instance_of` *pattern* (this is the 4th time this happened).
- `echoes` — *episode* `echoes` *episode* (rhyme across time).
- `breaks` — *episode* `breaks` *pattern* (growth — the time they *didn't* quit).

**Narrative edges:**
- `part_of` — episode→chapter→era; arc membership.
- `caused` / `led_to` / `enabled` / `prevented` — causal chains (the spine of story).
- `foreshadows` — earlier event prefigures later (assigned in hindsight).
- `plays_role` — *person* `plays_role` *character_role* in *arc* (Alex is the love interest of the "Summer" arc; a mentor in the "Career" arc — roles are *per-arc*, not global).
- `symbolizes` — *object/place* `symbolizes` *theme* (the childhood home = security).
- `about` / `derived_from` — reflections/insights cite their evidence (provenance, always).

**The litmus test for the ontology:** can the graph represent the sentence *"He kept leaving good relationships (pattern) because he feared being trapped (fear) the way his father was (wound, originated by a childhood event), even though he said he wanted commitment (stated value contradicts revealed) — until the relationship with Maya (turning_point) when he didn't leave (breaks pattern), which became the chapter where he grew up (chapter / identity evolved_into)"*?

With the strata and cross-stratum edges above, **yes — every clause is a node or edge.** That sentence is a biography in miniature, and it is now a queryable subgraph. That is the target.

---

## What this unlocks (and why it's the foundation for everything else)

- **The epiphany engine** runs on the cross-stratum edges (`revealed`, `contradicts`, `echoes`, `instance_of`).
- **The biographer** structures its narrative on `arc`/`chapter`/`theme`/`caused`/`plays_role`.
- **Trust** holds because every internal/narrative node `derived_from` episodes with confidence.
- **The product moat** is that no other software models the *internal* life at all — they model calendars, photos, and notes. LoreBook models the **psyche**, evidenced.

Build strata 3–5 and the cross-stratum edges, and LoreBook stops being a memory database and becomes a model of a person.
