# LoreKeeper Docs

> 117 root-level Markdown files consolidated into this structure on 2026-05-07.  
> All original files preserved in `docs/archive/`.

---

## Architecture

How the system is designed and why.

| Doc | What it covers |
| --- | -------------- |
| [CORE_LOOP.md](architecture/CORE_LOOP.md) | **Start here.** The complete request-to-response data flow |
| [CORE_ARCHITECTURE.md](architecture/CORE_ARCHITECTURE.md) | Axioms, epistemic type system, mode router, constitutional invariants |
| [SYSTEM_REALITY_CHECK.md](architecture/SYSTEM_REALITY_CHECK.md) | Falsifiable claims, failure modes, SQL audit queries, known hard problems |
| [NARRATIVE_INTEGRITY.md](architecture/NARRATIVE_INTEGRITY.md) | **Active bugs** in contradiction handling and accusatory language |
| [MEMORY_ENGINE.md](architecture/MEMORY_ENGINE.md) | Memory engine: sessions, components, timeline linking, cache |
| [BIOGRAPHY_SYSTEM.md](architecture/BIOGRAPHY_SYSTEM.md) | NarrativeAtom model, biography generation, memoir vs biography |
| [MODE_ROUTER_IMPLEMENTATION.md](architecture/MODE_ROUTER_IMPLEMENTATION.md) | Mode router design and routing logic detail |
| [CANON_REALITY_BOUNDARY.md](architecture/CANON_REALITY_BOUNDARY.md) | Canon vs roleplay vs hypothetical boundary enforcement |
| [THERAPIST_LAYER_CONTRACT.md](architecture/THERAPIST_LAYER_CONTRACT.md) | Therapist persona behavioral contract |
| [PERCEPTION_SYSTEM_RULES.md](architecture/PERCEPTION_SYSTEM_RULES.md) | Hard contracts for the perception system |
| [THOUGHT_CLASSIFICATION_IMPLEMENTATION.md](architecture/THOUGHT_CLASSIFICATION_IMPLEMENTATION.md) | Thought classification and response system |
| [BIAS_ETHICS_IMPLEMENTATION.md](architecture/BIAS_ETHICS_IMPLEMENTATION.md) | Bias detection and ethics review |
| [ANALYTICS_ENGINE_BLUEPRINT.md](architecture/ANALYTICS_ENGINE_BLUEPRINT.md) | Analytics engine correctness model |
| [ANALYTICS_SYSTEM.md](architecture/ANALYTICS_SYSTEM.md) | Analytics system overview |
| [EPISTEMIC_LATTICE.md](architecture/EPISTEMIC_LATTICE.md) | Formal belief propagation system (advanced, future) |
| [LIFE_STORY_CHALLENGES_SOLUTION.md](architecture/LIFE_STORY_CHALLENGES_SOLUTION.md) | How LoreBook addresses biography/autobiography problems |

### Engine Docs

| Doc | What it covers |
| --- | -------------- |
| [engines/archetype.md](engines/archetype.md) | Archetype engine |
| [engines/personality.md](engines/personality.md) | Personality engine |
| [engines/reflection.md](engines/reflection.md) | Reflection engine |

---

## Guides

Practical how-to documentation.

| Doc | What it covers |
| --- | -------------- |
| [guides/LOCAL_DEVELOPMENT.md](guides/LOCAL_DEVELOPMENT.md) | Setup, migrations, env vars, dummy data, common issues |
| [guides/VALIDATION.md](guides/VALIDATION.md) | How to verify the app is working — all commands and expected outputs |
| [guides/TESTING.md](guides/TESTING.md) | Test status, coverage, how to run |
| [guides/SECURITY_TESTING.md](guides/SECURITY_TESTING.md) | Security testing approach |
| [guides/LOCAL_DEV_MIGRATIONS.md](guides/LOCAL_DEV_MIGRATIONS.md) | Which migrations to run for which features |
| [guides/LNC_DEVELOPER_GUIDE.md](guides/LNC_DEVELOPER_GUIDE.md) | LNC compiler developer guide |
| [guides/LNC_V0.1_SPECIFICATION.md](guides/LNC_V0.1_SPECIFICATION.md) | LNC v0.1 specification |
| [guides/LNC_V0.1_API.md](guides/LNC_V0.1_API.md) | LNC API reference |

---

## Roadmap

Active priorities and future ideas.

| Doc | What it covers |
| --- | -------------- |
| [roadmap/ROADMAP.md](roadmap/ROADMAP.md) | Active priority tiers — what to build right now |
| [roadmap/IDEAS_HIGH_VALUE.md](roadmap/IDEAS_HIGH_VALUE.md) | High-impact unimplemented features (memory, trust, UX, debugging) |
| [roadmap/IDEAS_BACKLOG.md](roadmap/IDEAS_BACKLOG.md) | Good ideas for later (voice, calendar, enterprise, etc.) |
| [roadmap/FUTURE_FEATURES.md](roadmap/FUTURE_FEATURES.md) | Longer-horizon planned features (model fine-tuning, etc.) |

---

## Archive

All original root-level Markdown files are preserved at `docs/archive/`. They are session notes, implementation summaries, and historical design snapshots — no longer canonical, but kept for reference.

`docs/archive/` contains ~128 files.

---

## Validation Quick Reference

```bash
npm run dev              # Start everything
npm run smoke            # HTTP smoke tests (server must be running)
npm run validate         # TypeScript + unit tests + HTTP checks
npm run check:supabase   # Supabase connectivity
```

See [guides/VALIDATION.md](guides/VALIDATION.md) for expected outputs and the full manual test flow.
