# Experimental Runtime Inventory

**Audit date:** 2026-06-16  
**Scope:** All mounts gated unless `ENABLE_EXPERIMENTAL_RUNTIME=true`  
**Baseline:** 101 EXPERIMENTAL mounts (477 routes) + 3 ADMIN + 3 RESEARCH  
**Method:** Static analysis of `routeRegistry.ts`, cross-referenced with `apps/web` callers and `apps/server/tests`

---

## Executive Summary

| Tier | Mounts | Routes | Prod UI deps |
| --- | ---: | ---: | ---: |
| EXPERIMENTAL | 101 | 477 | 46 mounts |
| ADMIN | 3 | 27 | 1 (analytics config) |
| RESEARCH | 3 | 17 | 1 (`AgentPanel`) |
| **CORE (reference)** | 45 | ~365 | All primary UI |

**Key finding:** Nearly half of EXPERIMENTAL mounts (46/101) are called from production-facing UI today. Without the experimental flag, those pages return **503** in production.

**Already promoted (P0 hotfix):** `/api/chronology`, `/api/identity`

---

## Classification Legend

| Field | Meaning |
| --- | --- |
| **Prod UI** | Files under `apps/web/src` (excluding `_future-surfaces`) calling this mount |
| **Future UI** | Callers only in `_future-surfaces/` |
| **Route Test** | `apps/server/tests/routes/{module}.test.ts` exists |
| **Promote candidate** | Prod UI + route tests + authenticated |
| **Delete candidate** | No UI, no tests, no pipeline dependency |

---

## Phase 2 — Named System Dependency Verification

| System | Mount | Prod UI? | Required? | Route Tests | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Biography** | `/api/biography` | Yes (12 files) | **Required** — LoreBook core | Yes | **PROMOTE** |
| **Goals** | `/api/goals` | Yes (`useGoalsAndValues`) | **Required** — goals panel | Yes | **PROMOTE** |
| **Life Arcs** | `/api/life-arcs` | Yes (3 files) | **Required** — profile, saga | Yes | **PROMOTE** |
| **Voids** | `/api/voids` | Yes (2 files) | **Required** — gap dashboard | Yes | **PROMOTE** |
| **Insights** | `/api/insights` | Yes (3 files) | **Required** — discovery | Yes | **PROMOTE** |
| **Predictions** | `/api/predictions` | Yes (1 file) | **Required** — discovery | Yes | **PROMOTE** |
| **Knowledge** | `/api/knowledge` | Yes (7 files) | **Required** — chat context, perceptions | **No** | **PROMOTE after tests** |
| **Timeline Hierarchy** | `/api/timeline-hierarchy` | Yes (3 files) | **Required** — hierarchy explorer | Yes | **PROMOTE** |
| **Documents** | `/api/documents` | Yes (4 files) | **Required** — chat import, memoir | Yes | **PROMOTE** |
| **Photos** | `/api/photos` | Yes (4 files) | **Required** — gallery, chat upload | Yes | **PROMOTE** (fix public mount) |
| **HQI** | `/api/hqi` | Yes (6 files) | **Optional** — search enhancement | Yes | **PROMOTE** or merge into search |
| **MRQ** | `/api/mrq` | Yes (4 files) | **Required** — memory review queue | **No** | **PROMOTE after tests** |
| **Entity Resolution** | `/api/entity-resolution` | Yes (8 files) | **Required** — chat + entity UI | Yes | **PROMOTE** |
| **Entity Ambiguity** | `/api/entity-ambiguity` | Yes (1 file) | **Required** — chat chips | Yes | **MERGE → entity-resolution, PROMOTE** |
| **Memoir** | `/api/memoir` | Yes (4 files) | **Optional** — memoir editor | Yes | **PROMOTE** with biography |
| **Verification** | `/api/verification` | Yes (4 files) | **Optional** — trust badges | Yes | **PROMOTE** when feature ships |
| **Achievements** | `/api/achievements` | Yes (5 files) | **Optional** — discovery gamification | Yes | **PROMOTE** |
| **Memory Engine** | `/api/memory-engine` | Yes (1 file) | **Optional** — memory explorer detail | Yes | **MERGE** into omega-memory |
| **Memory Graph** | `/api/memory-graph` | Yes (1 file) | **Optional** — fabric viewer | Yes | **MERGE** into `/api/graph` or memory |
| **External Hub** | `/api/external-hub` | Yes (1 file) | **Optional** — integrations | No | **PROMOTE** or gate UI |
| **Thread Intelligence** | `/api/conversation/*` | CORE | **Required** | Yes | Already CORE |
| **Knowledge Graph** | `/api/graph` | Yes (1 file) | **Optional** | Yes | Keep experimental until merge |

---

## Phase 3 — Product Value Ranking

| Rank | Systems | Rationale |
| --- | --- | --- |
| **Critical** | Biography, Entity Resolution, Knowledge, Documents/Photos, MRQ, Timeline Hierarchy, Life Arcs, Goals, Voids, Insights/Predictions | Core product loops break without these in production |
| **High** | HQI, Memoir, Verification, Achievements, Reactions, Perception-Reaction Engine, Integrations | Strong differentiation; multiple UI surfaces |
| **Medium** | Quests, Essence, Naming, Moods, Tasks, Time, Meta, Engine Runtime, Graph, Journal, Resume, Values, Habits | Useful but not blocking primary journeys |
| **Low** | Memory Engine, Memory Ladder, Harmonization, standalone GitHub, Life OS psychology cluster (40+ mounts) | Duplicative, research-grade, or no UI |

---

## Phase 4 — Promotion Readiness Matrix

| Verdict | Count | Criteria |
| --- | ---: | --- |
| **Promote now** | 19 | Prod UI + route tests + auth |
| **Promote after tests** | 2 | Knowledge, MRQ — add route tests first |
| **Keep experimental** | 55 | No prod UI; research/back-end only |
| **Gate UI** | 2 | RPG, Agents — future/research surfaces |
| **Delete** | 25+ | No UI, no tests, duplicate domains |

## EXPERIMENTAL Mount Inventory (101 mounts, 477 routes)

| Mount | Routes | Auth | Prod UI | Future UI | Route Test | Purpose | Status |
| --- | ---: | --- | ---: | ---: | --- | --- | --- |
| `/api/biography` | 22 | protected | 12 | 0 | Yes | Automated biography generation | **Promote candidate** |
| `/api/entity-resolution` | 10 | protected | 8 | 0 | Yes | Entity deduplication and resolution | **Promote candidate** |
| `/api/knowledge` | 5 | protected | 7 | 0 | No | Knowledge crystallization — durable claims with evidenc | UI deps — harden first |
| `/api/hqi` | 3 | protected | 6 | 0 | Yes | Human Quality Index | **Promote candidate** |
| `/api/achievements` | 6 | protected | 5 | 0 | Yes | Achievement system | **Promote candidate** |
| `/api/reactions` | 6 | protected | 5 | 0 | Yes | Reaction pattern analysis | **Promote candidate** |
| `/api/documents` | 4 | protected | 4 | 0 | Yes | Document upload and processing | **Promote candidate** |
| `/api/memoir` | 6 | protected | 4 | 0 | Yes | Memoir generation | **Promote candidate** |
| `/api/mrq` | 6 | protected | 4 | 0 | No | Memory review queue | UI deps — harden first |
| `/api/photos` | 6 | public | 4 | 0 | Yes | Photo ingestion | **Promote candidate** |
| `/api/verification` | 6 | protected | 4 | 0 | Yes | Identity verification | **Promote candidate** |
| `/api/insights` | 4 | protected | 3 | 0 | Yes | Insight storage and retrieval | **Promote candidate** |
| `/api/moods` | 1 | protected | 3 | 0 | No | Mood tracking | UI deps — harden first |
| `/api/tasks` | 11 | public | 3 | 0 | Yes | Task management | **Promote candidate** |
| `/api/time` | 7 | protected | 3 | 0 | Yes | Temporal reasoning | **Promote candidate** |
| `/api/timeline-hierarchy` | 13 | protected | 3 | 0 | Yes | Hierarchical timeline view | **Promote candidate** |
| `/api/essence` | 5 | protected | 2 | 0 | Yes | Essence refinement | **Promote candidate** |
| `/api/integrations` | 8 | protected | 2 | 0 | Yes | Third-party integrations hub | **Promote candidate** |
| `/api/life-arcs` | 7 | protected | 2 | 0 | Yes | Life arc CRUD — list, create, update, delete arcs and r | **Promote candidate** |
| `/api/meta` | 4 | protected | 2 | 0 | Yes | Meta-control plane | **Promote candidate** |
| `/api/naming` | 3 | protected | 2 | 0 | Yes | Entity naming suggestions | **Promote candidate** |
| `/api/perception-reaction-engine` | 5 | protected | 2 | 0 | Yes | Perception-reaction correlation engine | **Promote candidate** |
| `/api/quests` | 22 | protected | 2 | 0 | Yes | Quest system | **Promote candidate** |
| `/api/voids` | 4 | protected | 2 | 0 | Yes | Void / absence pattern detection | **Promote candidate** |
| `/api/decisions` | 6 | protected | 1 | 0 | Yes | Decision tracking and analysis | **Promote candidate** |
| `/api/engine-runtime` | 4 | protected | 1 | 0 | Yes | Engine runtime execution | **Promote candidate** |
| `/api/entity-ambiguity` | 1 | protected | 1 | 0 | Yes | Entity ambiguity detection and resolution | **Promote candidate** |
| `/api/external-hub` | 0 | protected | 1 | 0 | No | External data ingestion hub | UI deps — harden first |
| `/api/github` | 3 | protected | 1 | 0 | Yes | GitHub integration | **Promote candidate** |
| `/api/goals` | 14 | protected | 1 | 0 | Yes | Goal tracking | **Promote candidate** |
| `/api/graph` | 4 | protected | 1 | 0 | Yes | Knowledge graph construction | **Promote candidate** |
| `/api/habits` | 4 | protected | 1 | 0 | Yes | Habit detection and tracking | **Promote candidate** |
| `/api/harmonization` | 0 | protected | 1 | 0 | No | Data harmonization layer | UI deps — harden first |
| `/api/influence` | 5 | protected | 1 | 0 | Yes | Influence network analysis | **Promote candidate** |
| `/api/internal/engine` | 3 | protected | 1 | 0 | Yes | Engine health monitoring | **Promote candidate** |
| `/api/journal` | 2 | protected | 1 | 0 | Yes | Structured journal entries | **Promote candidate** |
| `/api/memory-engine` | 11 | protected | 1 | 0 | Yes | Extended memory engine operations | **Promote candidate** |
| `/api/memory-graph` | 2 | public | 1 | 0 | Yes | Memory graph traversal | **Promote candidate** |
| `/api/memory-ladder` | 1 | public | 1 | 0 | Yes | Memory ladder / hierarchy retrieval | **Promote candidate** |
| `/api/narrative-diff` | 4 | protected | 1 | 0 | Yes | Narrative change detection | **Promote candidate** |
| `/api/people-places` | 4 | public | 1 | 0 | Yes | People and places extraction | **Promote candidate** |
| `/api/persona` | 4 | protected | 1 | 0 | Yes | Persona construction | **Promote candidate** |
| `/api/predictions` | 4 | protected | 1 | 0 | Yes | Prediction storage and retrieval | **Promote candidate** |
| `/api/relationship-dynamics` | 5 | protected | 1 | 0 | Yes | Relationship dynamics analysis | **Promote candidate** |
| `/api/resume` | 3 | protected | 1 | 0 | Yes | Resume / profile claim parsing | **Promote candidate** |
| `/api/values` | 5 | protected | 1 | 0 | Yes | Values extraction and tracking | **Promote candidate** |
| `/api/activities` | 3 | protected | 0 | 0 | Yes | Activity tracking | Research/backend only |
| `/api/alternate-self` | 1 | protected | 0 | 0 | Yes | Alternate self modeling | Research/backend only |
| `/api/archetype` | 2 | protected | 0 | 0 | Yes | Archetypal pattern recognition | Research/backend only |
| `/api/backward-storytelling` | 1 | protected | 0 | 0 | No | Backward storytelling reconstruction | Delete candidate |
| `/api/behavior` | 3 | protected | 0 | 0 | Yes | Behavior pattern detection | Research/backend only |
| `/api/belief-reconciliation` | 5 | protected | 0 | 0 | Yes | Belief-reality gap detection and reconciliation | Research/backend only |
| `/api/bias-ethics` | 25 | protected | 0 | 0 | Yes | Bias detection and ethics review | Research/backend only |
| `/api/calendar` | 1 | public | 0 | 0 | Yes | Calendar integration | Research/backend only |
| `/api/cognitive-bias` | 1 | protected | 0 | 0 | Yes | Cognitive bias detection | Research/backend only |
| `/api/conflicts` | 3 | protected | 0 | 0 | Yes | Conflict tracking | Research/backend only |
| `/api/consolidation` | 3 | protected | 0 | 0 | Yes | Memory consolidation pipeline | Research/backend only |
| `/api/continuity-profile` | 3 | protected | 0 | 0 | Yes | User continuity profile | Research/backend only |
| `/api/creative` | 6 | protected | 0 | 0 | Yes | Creative expression tracking | Research/backend only |
| `/api/distortions` | 1 | protected | 0 | 0 | Yes | Cognitive distortion analysis | Research/backend only |
| `/api/dreams` | 5 | protected | 0 | 0 | Yes | Dream journaling and analysis | Research/backend only |
| `/api/emotion` | 7 | protected | 0 | 0 | Yes | Emotion extraction | Research/backend only |
| `/api/emotion-resolution` | 3 | protected | 0 | 0 | Yes | Emotion resolution pathways | Research/backend only |
| `/api/emotions` | 3 | protected | 0 | 0 | Yes | Emotional intelligence analysis | Research/backend only |
| `/api/engine-registry` | 5 | protected | 0 | 0 | Yes | Engine registry | Research/backend only |
| `/api/engines` | 4 | protected | 0 | 0 | Yes | Engine management | Research/backend only |
| `/api/entity-meaning-drift` | 3 | protected | 0 | 0 | Yes | Semantic drift detection for entities | Research/backend only |
| `/api/events` | 3 | protected | 0 | 0 | Yes | Event extraction and storage | Research/backend only |
| `/api/financial` | 4 | protected | 0 | 0 | Yes | Financial pattern analysis | Research/backend only |
| `/api/growth` | 4 | protected | 0 | 0 | Yes | Growth pattern extraction | Research/backend only |
| `/api/identity-core` | 3 | protected | 0 | 0 | Yes | Core identity engine | Research/backend only |
| `/api/inner-dialogue` | 1 | protected | 0 | 0 | Yes | Internal dialogue extraction | Research/backend only |
| `/api/inner-mythology` | 3 | protected | 0 | 0 | Yes | Personal mythology engine | Research/backend only |
| `/api/intervention` | 4 | protected | 0 | 0 | Yes | Intervention recommendation system | Research/backend only |
| `/api/knowledge-type` | 3 | protected | 0 | 0 | Yes | Knowledge type classification engine | Research/backend only |
| `/api/learning` | 3 | protected | 0 | 0 | Yes | Learning pattern detection | Research/backend only |
| `/api/legacy` | 5 | protected | 0 | 0 | Yes | Legacy narrative construction | Research/backend only |
| `/api/life` | 2 | protected | 0 | 0 | No | Holistic life view | Delete candidate |
| `/api/location-resolution` | 3 | protected | 0 | 0 | Yes | Location entity resolution | Research/backend only |
| `/api/notebook` | 3 | protected | 0 | 0 | Yes | Personal notebook | Research/backend only |
| `/api/paracosm` | 1 | protected | 0 | 0 | Yes | Imaginal world modeling | Research/backend only |
| `/api/personality` | 2 | protected | 0 | 0 | Yes | Personality model construction | Research/backend only |
| `/api/perspectives` | 9 | protected | 0 | 0 | Yes | Epistemic perspective management | Research/backend only |
| `/api/prediction` | 5 | protected | 0 | 0 | Yes | Behavioral prediction | Research/backend only |
| `/api/recommendations` | 7 | protected | 0 | 0 | Yes | Recommendation engine | Research/backend only |
| `/api/reflection` | 2 | protected | 0 | 0 | Yes | Guided reflection system | Research/backend only |
| `/api/resilience` | 6 | protected | 0 | 0 | Yes | Resilience scoring | Research/backend only |
| `/api/rpg` | 8 | protected | 0 | 8 | Yes | RPG gamification layer | Future UI only |
| `/api/scenes` | 3 | protected | 0 | 0 | Yes | Scene-level memory extraction | Research/backend only |
| `/api/shadow` | 2 | protected | 0 | 0 | Yes | Shadow self engine | Research/backend only |
| `/api/social` | 2 | protected | 0 | 0 | Yes | Social network analysis | Research/backend only |
| `/api/social-projection` | 2 | protected | 0 | 0 | Yes | Social self-projection modeling | Research/backend only |
| `/api/story-of-self` | 1 | protected | 0 | 0 | Yes | Self-narrative construction | Research/backend only |
| `/api/strategy` | 12 | protected | 0 | 0 | Yes | Personal strategy training | Research/backend only |
| `/api/temporal-events` | 3 | protected | 0 | 0 | Yes | Temporal event extraction | Research/backend only |
| `/api/temporal-relationships` | 5 | protected | 0 | 0 | Yes | Temporal relationship tracking | Research/backend only |
| `/api/thoughts` | 4 | protected | 0 | 0 | Yes | Thought classification and response | Research/backend only |
| `/api/toxicity` | 4 | protected | 0 | 0 | Yes | Relationship toxicity detection | Research/backend only |
| `/api/will` | 3 | protected | 0 | 0 | Yes | Intentionality and will tracking | Research/backend only |
| `/api/wisdom` | 3 | protected | 0 | 0 | Yes | Wisdom extraction | Research/backend only |
| `/api/x` | 1 | public | 0 | 0 | Yes | X (Twitter) integration | Research/backend only |

## ADMIN Tier (3 mounts, 27 routes)

| Mount | Routes | Purpose |
| --- | ---: | --- |
| `/api/correction-dashboard` | ? | Correction review dashboard |
| `/api/dev` | ? | Development-only tooling |
| `/api/analytics` | ? | Platform analytics |

## RESEARCH Tier (3 mounts, 17 routes)

| Mount | Routes | Purpose |
| --- | ---: | --- |
| `/api/orchestrator` | ? | Multi-agent orchestration research |
| `/api/autopilot` | ? | Autonomous operation research |
| `/api/agents` | ? | Agent system research |

---

## Promote-Ready Mounts (19)

| Mount | Routes | Prod UI Files | Tests |
| --- | ---: | --- | --- |
| `/api/biography` | 22 | 12 | Yes |
| `/api/entity-resolution` | 10 | 8 | Yes |
| `/api/hqi` | 3 | 6 | Yes |
| `/api/achievements` | 6 | 5 | Yes |
| `/api/reactions` | 6 | 5 | Yes |
| `/api/documents` | 4 | 4 | Yes |
| `/api/memoir` | 6 | 4 | Yes |
| `/api/photos` | 6 | 4 | Yes |
| `/api/verification` | 6 | 4 | Yes |
| `/api/insights` | 4 | 3 | Yes |
| `/api/timeline-hierarchy` | 13 | 3 | Yes |
| `/api/integrations` | 8 | 2 | Yes |
| `/api/life-arcs` | 7 | 2 | Yes |
| `/api/perception-reaction-engine` | 5 | 2 | Yes |
| `/api/voids` | 4 | 2 | Yes |
| `/api/entity-ambiguity` | 1 | 1 | Yes |
| `/api/goals` | 14 | 1 | Yes |
| `/api/memory-graph` | 2 | 1 | Yes |
| `/api/predictions` | 4 | 1 | Yes |
