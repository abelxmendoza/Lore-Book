# LoreBook — The Endgame

*Synthesis of `life-graph-ontology.md`, `epiphany-engine.md`, `biography-engine.md`, `life-os-vision.md`. Contains the 10-year vision, the leverage/distraction rankings, and — most importantly — the smallest set of systems required.*

---

## Part 8 — The 10-year vision (10M users · 20+ years · multimodal)

Run the model forward. A user who joined at 28 is 48. Their graph holds two decades: tens of thousands of episodes, hundreds of people across their lifespans, the full arc of careers and marriages and losses, photos and voice and video woven in, and — crucially — an evidenced model of their **interior**: how their values shifted, which fears drove which decisions, the patterns they grew out of and the ones they didn't.

At that point LoreBook is not an app anyone "uses." It is **the memory layer of a human identity** — the canonical place a life is recorded, understood, and preserved. Three things become true that are not true of any software today:

1. **Everyone has a biography.** Not a summary — a true, structured, evidenced life-story, continuously updated, renderable on demand. Biography stops being a privilege of the famous and the dead. This is a *new literary and personal form*.

2. **Personal AI finally knows you.** Every assistant, agent, and copilot of the next decade is crippled by amnesia. LoreBook is the durable, trustworthy, provenanced memory they read from. Whoever owns the life graph owns the substrate of personal AI. **That is the platform endgame.**

3. **Lives outlive people.** A grandparent's graph persists; their descendants can ask it, and it answers from the grandparent's *own* recorded life — not a chatbot impersonation, a provenanced model. Grief, inheritance, and continuity change shape. This is the *civilizational* endgame.

**The moat** is time itself: 20 years of someone's provenanced episodic memory cannot be copied, scraped, or fast-followed. The data compounds and the switching cost approaches infinity — you cannot take your memory elsewhere because elsewhere has none of it. The first product to earn this trust at scale wins a position no competitor can attack with capital or models.

**The endgame question is not technical, it's civilizational:** when every life can be remembered completely, understood deeply, and preserved indefinitely — self-knowledge becomes ambient, grief gains a new form, and identity becomes persistent across death. LoreBook's responsibility is to make that future *trustworthy* (the user owns it, it works for them, it never manipulates or sells) rather than dystopian (a psyche-profile owned by someone else). **The architecture choices in these docs — immutability, provenance, user-held truth, observe-never-diagnose — are the technical expression of that responsibility.**

---

## The smallest set — what LoreBook *minimally* needs to understand a life better than any existing product

This is the most important answer in all of these documents. Most software captures the **exterior** of a life (calendars, photos, notes, contacts). **Zero products model the interior or surface the unseen.** So the minimal set is precisely the systems that do those two things — plus the substrate and trust they require.

**Six systems. In dependency order:**

1. **Immutable episodic memory** — complete, verbatim, provenanced capture (the event-sourced `episodes` log). *Without trustworthy raw memory, nothing above it can be trusted.* The substrate.

2. **The entity + relationship graph** — `nodes`/`edges` for the external life (who, what, where, how connected). The skeleton.

3. **Revealed-preference interior model** — values, fears, goals, wounds **inferred from behavior** (decisions under conflict), held alongside stated self, with the *gap* made explicit. **This is the half no product has.** It is what turns a log into a model of a *person*.

4. **The evidence-bound pattern/epiphany engine** — detect recurring behaviors, contradictions, and identity shifts with math; articulate with constrained language; confirm with the user. **This is what lets LoreBook know things the person cannot know about themselves** — the source of "better than they could do."

5. **Narrative structure** — chapters, arcs, turning points, themes, and *causal chains* over the episodes. What turns understanding into *story*.

6. **The trust spine** — provenance on every claim, immutability of episodes, confidence on every inference, and the human confirm-loop. **This is the license for 3–5 to exist** — without it, the interior model and the epiphanies are just confident hallucinations, and the product is unusable (and unethical).

**The two that are the actual differentiator** are #3 (revealed-preference interior) and #4 (pattern engine). Items 1, 2, 6 are table stakes done right; 5 is the output. But #3 + #4 are the *only* reason a piece of software could understand a life better than the person living it — because the person can see neither their own revealed preferences nor their own patterns. **If you build only two new things, build those two — on top of a trustworthy episode log.**

Everything else in these documents (the full ontology, the biographer's seven layers, the Life OS apps, multimodal, scale) is **downstream of these six** and should not be started until they exist. The graph migration's Stage 0 (the P0 trust fixes) is the on-ramp; these six are the destination of the first leg.

---

## Top 25 highest-leverage systems to build

Ranked by (understanding-gained × trust × durability). Items 1–6 are the smallest set; 7+ compound on it.

1. Immutable, provenanced episodic log (event sourcing)
2. Canonical `nodes`/`edges`/`episodes` graph (collapse the 14 stores)
3. Per-user entity index → working-memory assembler (one recall pass)
4. Provenance on every derived claim
5. Self-invalidating derived data (versioned; no stale scores)
6. **Revealed-preference value/fear/goal inference** (the interior)
7. Internal-self ontology (Stratum 3 nodes)
8. Cross-stratum edges (`revealed`, `driven_by`, `contradicts`)
9. **Evidence-bound pattern detection** (sequential mining)
10. **Epiphany engine** (detect→evidence→articulate→calibrate→confirm)
11. The **surprise** metric (high-implicit, low-explicit)
12. The user confirm-loop (calibration + collaboration)
13. Causal-chain inference between events
14. Change-point chapter/era detection
15. Turning-point detection (significance × causal centrality)
16. Bi-temporal semantic memory (contradiction handling, no overwrite)
17. Reified relationships + closeness trajectories
18. Per-arc character-role assignment
19. Consolidation worker (async episodic→semantic; the "sleep")
20. Thesis layer (the controlling idea of a life)
21. Selection/editorial layer (biography = omission)
22. Contradiction mirror (stated vs revealed, surfaced gently)
23. Unified "Memory Health" / trust surface (provenance-visible)
24. Voice modeling (render in the subject's own voice)
25. Relationship-drift early warning

## Top 25 distractions (don't build / stop building)

Ranked by (complexity added ÷ understanding gained) — worst offenders first.

1. A graph database (Neo4j) — Postgres sharded per-user wins; premature
2. Any **new** recall router/pass — the next recall change must *delete* one
3. Stored-uninvalidated scores (revert Sprint AL's persistence model)
4. The 4-way story-reconstruction split (collapse Sprint AM to one renderer)
5. Real-time per-turn epiphany generation (must be async consolidation)
6. Clinical/diagnostic labeling of users ("you're avoidant") — observe, never diagnose
7. Multimodal ingestion before the **text** memory is trustworthy
8. Predictive recall before the confidence/contradiction layer exists
9. Cross-user/social-graph features — privacy boundary; off-mission
10. Public sharing / social feed of life stories — trust-fatal, off-mission
11. Hand-tuning more regex intent patterns
12. A separate vector DB before pgvector is a proven bottleneck
13. Biography **rendering** before the thesis + selection layers (text blobs)
14. More entity *types* before the internal strata (3–5) exist
15. Discovery-Hub panel proliferation (collapse to 3 concepts)
16. Importance scoring as a standalone feature (it's graph centrality)
17. Premature horizontal sharding before product-market fit
18. Fine-tuning a model before retrieval/working-memory is solid
19. "AI personality"/persona tuning over substrate work
20. Calendar/email integrations before the memory model is trustworthy
21. Recommendations / ads / anything that makes the user the product — mission-fatal
22. Gamification of memory (streaks/points) — cheapens the trust
23. A mobile-native rewrite before the kernel is right
24. Generic "chat with your data" RAG without the interior/pattern layers
25. Diagnostic surface #6 (there are already five — unify, don't add)

---

## The throughline of every document

LoreBook is becoming an autobiographical memory graph. The audit found it implemented implicitly across fourteen drifting systems. The v2 architecture makes the graph explicit and trustworthy. The cognitive layer (interior model + epiphanies + narrative) makes it *understand* rather than merely *retain*. And the endgame makes it the durable memory of a human identity.

The discipline that ties it together is a single principle, stated five different ways across these docs and never violated:

> **Episodes are truth. Everything else is a function of episodes, carries its provenance, states its confidence, and is confirmed by the person whose life it is.**

Build the smallest set on that principle, resist the 25 distractions, and LoreBook becomes the first software that understands a human life better than the human can — not by being smarter than them, but by remembering completely, inferring honestly, and showing them what they were never able to see.
