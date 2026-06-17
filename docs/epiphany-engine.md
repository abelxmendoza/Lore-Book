# The Epiphany Engine

*Memory-systems research. Depends on `life-graph-ontology.md`.*

**The thesis:** the deepest value LoreBook can deliver is not recall — it is **telling you something true about yourself that you didn't consciously know.** "You always quit when things get serious." "Your father shaped your career more than you admit." "You've been chasing the same relationship for ten years." "You care more about freedom than money."

These are *epiphanies*: realizations that reorganize how a person sees their own life. Humans get them rarely, by accident, in therapy, or never. A system that has the whole life graph can find them systematically.

**The danger:** this is also the single most hallucination-prone feature imaginable. A confidently-wrong claim about someone's psyche ("you have abandonment issues") is not just inaccurate — it's a violation. **The entire engineering problem is: discover non-obvious truths while making fabrication structurally impossible.**

The solution is a hard architectural rule, stated once and never broken:

> **The pattern is found by deterministic computation over evidence. The LLM may only *articulate* a pattern that the graph already proved. The LLM never originates a claim about the person.**

Generation describes; it does not discover. Discovery is math.

---

## The five-stage pipeline

```
1. DETECT       (deterministic)  — find structural patterns in the graph
2. EVIDENCE     (deterministic)  — gather + threshold the supporting episodes
3. ARTICULATE   (LLM, constrained)— phrase the pattern in human language
4. CALIBRATE    (deterministic)  — assign confidence from evidence strength + surprise
5. CONFIRM      (human-in-loop)  — surface as a question; feedback updates the graph
```

Only stage 3 touches a model, and it is fed the pattern + evidence and instructed to *name what is shown, add nothing*. Every other stage is auditable arithmetic.

---

## Stage 1 — DETECT: pattern types and their algorithms

Each epiphany *type* maps to a specific, classical algorithm over the graph. None require an LLM to discover.

### A. Repeating behavior — *"I always quit when things get serious"*
- **Structure:** a recurring `(trigger → response)` sequence. Here: relationship episodes crossing a closeness threshold, followed within a window by withdrawal/exit episodes.
- **Algorithm:** **sequential pattern mining** (PrefixSpan-style) over time-ordered episodes grouped by relationship arc. Find subsequences that recur across ≥ N distinct arcs.
- **Output:** a `pattern` node with `instance_of` edges to each occurrence. Confidence ∝ number of independent instances.

### B. Hidden influence — *"my dad influenced my career more than I thought"*
- **Structure:** an entity with high **co-occurrence/centrality** in episodes about a theme (career), where the user has **never explicitly stated the link.**
- **Algorithm:** compute, per theme, the entities most central in its episode subgraph (weighted degree / PageRank). Subtract entities the user has *explicitly* linked. The residual high-centrality, never-stated entities are candidate hidden influences.
- **Key signal — SURPRISE:** influence the user never articulated but the graph strongly shows. (Surprise is formalized below — it's what makes an epiphany an *epiphany* and not a summary.)

### C. Recurring pursuit — *"chasing the same relationship for 10 years"*
- **Structure:** multiple `relationship_state` nodes that are *similar* (same dynamics, same type of person, same arc shape) across a long time span.
- **Algorithm:** **clustering** over relationship nodes using features (partner attributes, trajectory shape, conflict themes, what ended them). A tight cluster spanning years = a recurring pursuit.

### D. Revealed values & value contradictions — *"I care more about freedom than money"*
- **Structure:** **revealed preference** from decisions under conflict. Find episodes where two values were in tension and a choice was made; tally which value won.
- **Algorithm:** identify `decision` episodes tagged with competing values (freedom vs security, money vs meaning); aggregate the **revealed ranking**. Compare to the user's **stated** values. A divergence is a `contradicts` edge between stated and revealed — and one of the most powerful epiphanies ("you say money, you choose freedom").
- This is the crown jewel: **values inferred from behavior, not from self-report**, which is exactly what the subject cannot do for themselves.

### E. Identity shift / growth — *"I'm not who I was"*
- **Structure:** **change-points** in the time series of themes/values/behavior frequency.
- **Algorithm:** change-point detection (e.g. CUSUM/Bayesian) over per-theme episode density and revealed-value rankings across time. A sustained shift = an `identity_theme.evolved_into` edge. Growth specifically = a harmful `pattern` whose instance-frequency declines, or a `breaks`-pattern episode ("the time you didn't quit").

### F. Recurring mistakes & blind spots
- **Structure:** patterns with negative downstream valence (the behavior `caused` regretted outcomes repeatedly).
- **Algorithm:** patterns (from A) filtered by negative outcome valence in the causal chain. "Every time you do X, Y follows, and you regret Y."

### G. Themes & symbols
- **Algorithm:** community detection / embedding clustering over episodes → recurring `theme`s; objects/places with high cross-chapter recurrence + emotional weight → `motif`/`symbol`.

---

## Stage 2 — EVIDENCE & thresholds (no epiphany without proof)

A candidate is **discarded** unless it clears evidence gates:
- **Instance count:** ≥ N independent occurrences (N tuned per type; a "pattern" of 2 is a coincidence).
- **Temporal spread:** spans ≥ M distinct time points (so it's a *pattern*, not a *phase*).
- **Independence:** instances aren't all from one cluster/relationship (else it's one event, not a pattern).
- **Provenance:** every candidate carries the exact episode ids that support it.

If the gates fail, the candidate dies silently. **Better to miss an epiphany than to fabricate one.** This asymmetry is non-negotiable — the cost of a false epiphany (broken trust, feeling misread) vastly exceeds the cost of a missed one.

---

## Stage 3 — ARTICULATE (the only LLM step, tightly constrained)

Input to the model: the pattern type, its structure, and its evidence episodes. Instruction: *"Name this pattern in the user's own framing. Use only the evidence provided. Do not add causes, diagnoses, or details not present. Phrase as a tentative observation, not a verdict."*

Hard rules enforced around the model:
- It receives a **proven** pattern; it cannot invent one.
- Output is **template-bounded**: an observation + the evidence ("I noticed X — in [these moments]").
- **Banned register:** no clinical/diagnostic language ("you have anxiety/avoidant attachment"). LoreBook observes patterns; it does not diagnose people.
- A post-check verifies the articulation references only provided evidence (reuse the memory-claim guard).

---

## Stage 4 — CALIBRATE: confidence + the surprise score

Two numbers govern whether an epiphany is shown and how:

**Confidence** = f(instance count, temporal spread, evidence consistency, independence). High-confidence patterns can be stated as observations; low-confidence as gentle questions.

**Surprise** = how much this contradicts or exceeds what the user has *explicitly* said. Formally: high when there is **strong implicit evidence** (graph) and **weak/absent explicit statement** (the user never said it). 

> Surprise is the magic metric. *Summary* = high explicit + high implicit ("you love your family" — they've said it). *Epiphany* = low explicit + high implicit ("you organize your whole life around your family's approval" — true, evidenced, never said). The engine should prioritize **high-surprise, high-confidence** items. That quadrant is where "the software told me something I didn't know about myself" lives — and that is the product.

The rare, precious output: **high confidence + high surprise.** Rank epiphanies by `confidence × surprise` and meter them (one resonant epiphany a week beats ten shallow ones).

---

## Stage 5 — CONFIRM: the human-in-the-loop that makes it safe *and* smarter

Epiphanies are **never asserted as fact.** They are surfaced as **observations the user can confirm, deny, or refine**:

> *"I might be wrong, but looking across the last few years — when a relationship gets serious, there's often a pulling-away soon after. Does that ring true?"*

- **Confirm** → the `pattern`/`insight` node's confidence rises; it can be referenced later; it may consolidate into an `identity_theme` or `life_lesson`.
- **Deny** → confidence drops sharply; the engine learns this framing was wrong and suppresses it.
- **Refine** → the user's correction *is new evidence* and reshapes the node.

This loop does three things at once: it keeps the system **honest** (the user is the authority on their own meaning), it makes the model **calibrated** over time, and it turns epiphany-generation into a **collaboration** — LoreBook brings the pattern the user can't see; the user brings the meaning LoreBook can't know. Neither alone is sufficient; together they exceed what either could do.

---

## Storage

- Confirmed patterns → `pattern`/`insight`/`epiphany`/`life_lesson` nodes (per the ontology), each `derived_from` its evidence episodes, with confidence + surprise + the user's confirmation state.
- They become first-class graph objects: queryable ("what patterns define me?"), surfaceable in chat and biography, revisable as life continues (a `breaks`-pattern episode can *update* a confirmed pattern into a growth story).
- Denied candidates → a suppression list (so they don't resurface), which is itself signal.

---

## Cadence (this is asynchronous, never per-turn)

The Epiphany Engine runs as **consolidation** — a "sleep" process over the user's graph, nightly/weekly, incrementally on new episodes. It is not in the chat hot path (cost, and because epiphanies need accumulated evidence, not single turns). The chat layer *surfaces* matured, high-`confidence×surprise` epiphanies at apt moments; it does not generate them live.

**The one-sentence spec:** *Find patterns with math, name them with language, prove them with episodes, rank them by surprise, and let the person confirm them — so LoreBook can say the true, unsaid thing, and never the confident, false one.*
