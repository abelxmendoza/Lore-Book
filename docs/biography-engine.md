# The Biography Engine

*Biographer + memory-systems design. Depends on `life-graph-ontology.md`, `epiphany-engine.md`.*

**The question:** what would it take for LoreBook to write a person's biography *better than they could write it themselves*?

The answer begins with an uncomfortable truth: **a person is the worst-positioned author of their own life.** Their memory is selective, mood-congruent, and self-serving; they forget most of it; they cannot see their own patterns (that's what the epiphany engine is for); they have no bird's-eye view across decades; they cannot hold 50,000 episodes in working memory at once. What they *do* have — and what software lacks — is **emotional truth**: knowing what *mattered*.

So a great LoreBook biography is **co-authored**: LoreBook brings completeness, structure, pattern, and consistency; the human brings meaning and confirmation. That division is the whole design.

---

## Part 1 — What humans actually do when they write biographies

Studying biographies, memoirs, autobiographies, and documentaries, the craft uses structures **far beyond events**. LoreBook today has events. It is missing almost everything that makes those events a *story*:

| Structure | What it is | In LoreBook today? |
|---|---|---|
| **Events** | what happened | ✅ |
| **Causality** | what *led to* what | ❌ (no causal chains) |
| **Character arcs** | how people *change* over the story | ❌ (people are static records) |
| **Turning points** | the pivots everything hinges on | ⚠️ (significance ≠ pivot) |
| **The controlling idea / thesis** | what the life is *about* (one sentence) | ❌ |
| **Themes & throughlines** | recurring meanings | ❌ |
| **Internal vs external narrative** | events vs the inner life beneath them | ❌ (no interior) |
| **Contradiction as engine** | the tension that drives the story (want vs need) | ❌ |
| **Selectivity / omission** | what to *leave out* — biography is editing | ❌ (LoreBook hoards) |
| **Symbol & motif** | the object/place that recurs with meaning | ❌ |
| **Dramatic structure** | setup → conflict → climax → resolution | ❌ |
| **Foreshadowing in hindsight** | early moments that prefigure later ones | ❌ |
| **Voice & perspective** | whose telling, in what register | ❌ |
| **Emotional truth** | what it *felt like* / what it *meant* | ⚠️ (moods, not meaning) |
| **Unreliable narration / multiple POV** | the same event seen differently over time | ❌ |

**The deepest missing things:** (1) **causality** — a life told as a list of dated events is a chronicle, not a biography; (2) **interiority** — the inner life beneath the events (the ontology's Stratum 3); (3) **a thesis** — biographies are arguments about what a life *meant*; (4) **selection** — the art of biography is leaving things out. LoreBook is architecturally built to *include everything*, which is the opposite of biography. **The Biographer's hardest job is editorial restraint.**

---

## Part 4 — The Story Engine (raw life data → narrative structure)

Before you can write, you must *structure*. The Story Engine turns the graph into the scaffolding of a story — deterministically, with the LLM only naming what the math finds.

### Chapters & eras — *change-point detection across signals*
A chapter boundary is not a date; it is a **coordinated shift** across multiple signals: location change, relationship change, occupation/role change, theme-density shift, emotional-valence shift, and pace-of-episodes. Run multivariate change-point detection over these series; a chapter boundary is where several signals shift together. Eras are the coarse segmentation; **seasons** are emotional-tone spans that may cut across chapters ("the lonely year").

### Turning points — *significance × causal centrality × emotional inflection*
A turning point is an event that is (a) significant, (b) **causally upstream of much of what follows** (high out-degree in the `caused`/`led_to` chains — many later things trace back to it), and (c) an emotional inflection. The layoff that started the rebuild scores on all three. This is why significance-in-isolation (Sprint AL) is insufficient: significance must be *positional* in the causal graph.

### Causal chains — *the spine*
Infer `caused`/`led_to`/`enabled` edges between events from temporal adjacency + entity/theme overlap + (cautiously) LLM-proposed causality that is then **evidence-gated**. The chain "layoff → self-doubt → started building → found purpose → LoreBook" is the actual story; chronology is just its shadow.

### Character roles — *narrative function, not moral judgment*
Assign each significant person a **role within each arc** (roles are per-arc, not global):
- **Protagonist** = the user.
- **Mentor** = positive influence + asymmetric guidance + appears at growth points.
- **Ally** = recurring positive presence, lower centrality than mentor.
- **Antagonist / "villain"** = recurring conflict + negative shared-episode valence. (Note carefully: a *narrative* antagonist, defined by *function in the story*, not a verdict that the person is bad. The same person can be antagonist in one arc, ally in another.)
- **Love interest**, **foil**, **catalyst** — by their graph signature.
Computed from centrality, valence, influence edges, and temporal span — not assigned by an LLM's vibe.

### Settings — places as more than coordinates
Places with high episode-density + emotional weight become **settings** ("the apartment where it all happened"); recurring meaningful places become `symbol`s (the childhood home = security).

**Output of the Story Engine:** a populated narrative layer — `chapter`/`arc`/`theme`/`turning_point`/`character_role` nodes with edges to their evidence. This is the *outline* a biographer works from, and it was built from data, not invented.

---

## Part 5 — The Biographer: 50,000 memories → a publishable biography

A biography is **not** "all memories rendered as prose." It is *a thesis about a life, supported by a selected subset of episodes, structured into arcs, told in a voice.* The engine therefore needs **seven intermediate layers** — you cannot go from episodes to prose in one jump.

```
50,000 episodes
   ↓ L1  ENTITY/SEMANTIC     who, what, where, stable truths
   ↓ L2  PATTERN             themes, values, habits, epiphanies   (epiphany-engine)
   ↓ L3  NARRATIVE STRUCTURE chapters, arcs, turning points, roles (story engine)
   ↓ L4  THESIS              the controlling idea(s) of the life
   ↓ L5  SELECTION           which arcs + which scenes carry the thesis
   ↓ L6  SCAFFOLD            causal ordering, foreshadowing, motif placement
   ↓ L7  VOICE/RENDER        prose, in a chosen voice
A publishable biography
```

### L4 — Thesis (the hardest, most valuable layer)
A biography is an *argument*: "This was a life about the search for belonging." The Biographer generates **candidate theses** from the dominant themes, the value contradictions (the want-vs-need engine), and the arc that contains the most turning points. Each thesis is evidenced and ranked. **The user chooses (or refines) the thesis** — this is the single most important human-in-the-loop moment, because the thesis determines everything downstream. (A life can be told as a tragedy or a comedy from the same events; the subject should choose the lens.)

### L5 — Selection (the editorial soul)
Given the thesis, **select**: the 5–9 arcs that carry it, and for each arc the handful of episodes (scenes) that best *dramatize* it — chosen by vividness, significance, turning-point-ness, and emotional peak. **90% of episodes are deliberately omitted.** This is where LoreBook must do the *un*-LoreBook thing: throw most of the data away. Completeness is for the graph; selection is for the biography.

### L6 — Scaffold
Order the selected scenes by **causality**, not just chronology; place foreshadowing (early scenes that prefigure turning points); thread motifs/symbols; mark where the inner narrative (Stratum 3) underlies the outer events. This is the difference between "and then, and then" and "because, therefore."

### L7 — Voice / Render
Generate prose, scene by scene, **each scene constrained to its evidence episodes** (no invented detail — gaps are acknowledged, not fabricated). Voice options: the subject's *own* voice (learned from their episodes' language — vocabulary, cadence, the way they actually talk) for autobiography; or a chosen biographer's register. The model writes *only what the selected, evidenced structure dictates*.

### The truth guarantee (why it's trustworthy)
- Every sentence traces to episodes (provenance). No invented scenes; no composite people; no fabricated quotes.
- Sparse periods are **named as sparse** ("little is recorded of these years"), never confabulated — honesty about gaps is part of the craft and part of the trust.
- The thesis and selection are **user-confirmed**; LoreBook proposes, the subject disposes.

### Why this can beat the person's own attempt
| The person | The Biographer |
|---|---|
| forgets 95% | retains 100%, selects deliberately |
| can't see their patterns | epiphany engine surfaces them |
| no decade-scale overview | holds the whole graph |
| mood-biased recall | evidence-weighted, consistent |
| but: *knows what mattered* | **asks them** (thesis + confirmation) |

LoreBook supplies the **structure, completeness, and pattern-sight** a person lacks; the person supplies the **meaning** software can't have. The biography is better than either could produce alone — and that is the honest, achievable version of "better than they could write themselves."

---

## What's missing today, in one list
No causal chains · no character arcs (people are static) · no interiority (Stratum 3) · no thesis layer · no selection/editorial layer · no voice modeling · no foreshadowing/motif placement · significance without causal position. The Story Engine + the L4–L7 layers are the build. The ontology + epiphany engine are the prerequisites.
