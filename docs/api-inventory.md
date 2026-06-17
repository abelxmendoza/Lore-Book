# LoreBook API Inventory

**Audit date:** 2026-06-16  
**Scope:** `apps/server` — all HTTP routes registered via `routeRegistry.ts` + inline routes in `index.ts`  
**Method:** Static analysis of 152 registry mounts, 891 route handlers; cross-referenced with `apps/web` API callers

---

## Executive Summary

| Metric | Count |
| --- | ---: |
| Registry mounts | 152 |
| HTTP endpoints | 891 |
| CORE_RUNTIME (production default) | 353 endpoints / 43 mounts |
| EXPERIMENTAL (503 unless flag) | 490 endpoints / 103 mounts |
| ADMIN (503 unless flag) | 27 endpoints / 3 mounts |
| RESEARCH (503 unless flag) | 17 endpoints / 3 mounts |
| Public mounts (bypass auth stack) | 21 |
| Frontend API client modules | ~25 in `apps/web/src/api/` |

**Registration model:** Every router is declared in `apps/server/src/routes/routeRegistry.ts` with a `RouteClassification`. Production loads `CORE_RUNTIME` only unless `ENABLE_EXPERIMENTAL_RUNTIME=true`.

**Live catalog:** `GET /api/runtime/routes` (public, always mounted)

---

## Phase 1 — Inventory Schema

Each mount is classified with:

| Column | Meaning |
| --- | --- |
| **Route** | Mount prefix + handler paths (see detail sections) |
| **Purpose** | From registry description |
| **Caller** | Known frontend consumers (`apps/web`) or internal-only |
| **Response Shape** | Dominant envelope pattern (see Phase 4 in `api-domain-map.md`) |
| **Active?** | Mounted in production default |
| **Duplicate?** | Overlaps another domain (see `api-consolidation-roadmap.md`) |
| **Experimental?** | EXPERIMENTAL / RESEARCH tier |
| **Dead?** | Zero routes, no known callers, or superseded |

---

## CORE_RUNTIME Mount Summary (Production Surface)

| Mount | Routes | Caller | Duplicate? | Response | Notes |
| --- | ---: | --- | --- | --- | --- |
| `/api/conversation` | 64 | Chat UI, thread sync, events | **threads** | mixed `{success}` + raw | Canonical thread API |
| `/api/threads` | 16 | Timeline hierarchy, legacy lore | **conversation** | raw | Legacy thread/node model |
| `/api/chat` | 8 | Primary chat | memory-engine | raw / stream | PUBLIC mount |
| `/api/chat/message` | 2 | COL orchestration | chat | `{messages}` | Path bug: `/message/message` |
| `/api/chat-memory` | 2 | Session memory | chat | raw | |
| `/api/entries` | 13 | Journal, lorebook, discovery | — | `{entry}` raw | PUBLIC mount |
| `/api/characters` | 25 | Character book, entity detail | omega-memory (partial) | `{success}` + raw | |
| `/api/omega-memory` | 9 | Claims engine, chat pipeline | entities/knowledge | raw | |
| `/api/entities` | 3 | Entity detail modal | characters | `{success}` | |
| `/api/timeline` | 16 | Legacy timeline UI | timeline-v2, chronology | mixed | PUBLIC mount |
| `/api/timeline-v2` | 5 | TimelineV2 components | timeline | `{timeline}` | Canonical CRUD target |
| `/api/chapters` | 6 | useLoreKeeper | — | raw | PUBLIC mount |
| `/api/chronology` | 13 | timelineV2.ts client | timeline | raw | EXPERIMENTAL tier but called from CORE UI paths |
| `/api/continuity` | 4 | ContinuityDashboard | conversation traces | raw | |
| `/api/search` | 1 | Universal search | memory-recall | `{results}` | |
| `/api/memory-recall` | 2 | RAG / chat pipeline | search, context | raw | |
| `/api/context` | 3 | Prompt assembly | memory-recall | raw | |
| `/api/diagnostics` | 16 | Dev console, intelligence dash | scattered health | mixed | PUBLIC mount; mixed auth per route |
| `/api/subscription` | 6 | Billing UI | — | `{authority}` | Webhook in index.ts |
| `/api/admin` | 13 | Admin panel | dev/analytics | raw | CORE mount, admin-gated |
| `/api/user` | 12 | Settings, profile | account | raw | |
| `/api/security` | 1 | CSRF client | — | `{token}` | |
| `/api/organizations` | 23 | Org management | group-candidates | `{success}` | |
| `/api/skills` | 16 | Skills UI | — | `{skill}` | |
| `/api/contradictions` | 4 | Contradictions panel | contradiction-alerts | raw | |
| `/api/contradiction-alerts` | 4 | Alert cards | contradictions | raw | |
| `/api/onboarding` | 6 | Onboarding flow | — | raw | |
| `/api/privacy` | 6 | Privacy settings | user | raw | |
| `/api/corrections` | 2 | Chat corrections | — | raw | PUBLIC mount |
| `/api/canon` | 1 | Canon status | — | raw | PUBLIC mount |
| `/api/narrative` | 5 | Narrative views | biography | raw | |
| `/api/summary` | 2 | Entry summaries | — | raw | PUBLIC mount |
| `/api/relationships` | 3 | Role inference | conversation rels | `{success}` | |
| `/api/group-candidates` | 6 | Group review | organizations | `{success}` | |
| `/api/family-trees` | 6 | Family tree panel | — | raw | |
| `/api/locations` | 7 | Locations UI | — | raw | PUBLIC mount |
| `/api/perceptions` | 10 | Perception engine UI | — | raw | |
| `/api/skills` | 16 | Skills | — | raw | |
| `/api/revealed-self` | 3 | Revealed self panel | identity | raw | |
| `/api/evolution` | 1 | Evolution insights | — | raw | PUBLIC mount |
| `/api/counts` | 1 | Sidebar badges | — | raw | |
| `/api/account` | 2 | Account export/delete | user | raw | PUBLIC mount |
| `/api/legal` | 2 | Terms/privacy pages | — | markdown | PUBLIC mount |
| `/api/health` + `/` | 8 | Liveness + **wellness** | MockDataContext | `{status}` | **Naming collision** |
| `/api/admin` | 13 | Admin | — | raw | |

> Full mount list (all 152) and per-route detail below.

---

## Known Issues (Inventory Flags)

| Issue | Routes | Severity |
| --- | --- | --- |
| Wellness routes mounted at `/` and `/api/health` | health.ts | P1 — collides with liveness |
| `POST /api/chat/message/message` double segment | chatOrchestration | P1 |
| `/api/chronology` EXPERIMENTAL but used by CORE timeline client | timelineV2.ts | P0 — prod 503 risk |
| `/api/identity`, `/api/biography`, `/api/goals` etc. called from web but EXPERIMENTAL | many | P0 — feature flags required |
| Empty registry mounts | harmonization, external-hub (scanner miss) | P2 — routes in nested routers |
| `GET /api/entries/:id` may shadow `/recent`, `/search/keyword` | entries.ts | P1 — route order |

---

## Mount-Level Inventory (152 mounts, 891 routes)

| Mount | Class | Routes | Mount Auth | Purpose | Prod Active |
| --- | --- | ---: | --- | --- | --- |
| `/` | CORE_RUNTIME | 8 | public | Liveness check — no auth, no DB | Yes |
| `/api/account` | CORE_RUNTIME | 2 | public | Account management | Yes |
| `/api/achievements` | EXPERIMENTAL | 6 | protected | Achievement system | 503 unless flag |
| `/api/activities` | EXPERIMENTAL | 3 | protected | Activity tracking | 503 unless flag |
| `/api/admin` | CORE_RUNTIME | 13 | protected | Admin panel — metrics, users, finance, system tools | Yes |
| `/api/agents` | RESEARCH | 3 | protected | Agent system research | Gated |
| `/api/alternate-self` | EXPERIMENTAL | 1 | protected | Alternate self modeling | 503 unless flag |
| `/api/analytics` | ADMIN | 13 | protected | Platform analytics | Gated |
| `/api/archetype` | EXPERIMENTAL | 2 | protected | Archetypal pattern recognition | 503 unless flag |
| `/api/autopilot` | RESEARCH | 6 | protected | Autonomous operation research | Gated |
| `/api/backward-storytelling` | EXPERIMENTAL | 1 | protected | Backward storytelling reconstruction | 503 unless flag |
| `/api/behavior` | EXPERIMENTAL | 3 | protected | Behavior pattern detection | 503 unless flag |
| `/api/belief-reconciliation` | EXPERIMENTAL | 5 | protected | Belief-reality gap detection and reconciliation | 503 unless flag |
| `/api/bias-ethics` | EXPERIMENTAL | 25 | protected | Bias detection and ethics review | 503 unless flag |
| `/api/biography` | EXPERIMENTAL | 22 | protected | Automated biography generation | 503 unless flag |
| `/api/calendar` | EXPERIMENTAL | 1 | public | Calendar integration | 503 unless flag |
| `/api/canon` | CORE_RUNTIME | 1 | public | Canon status management | Yes |
| `/api/chapters` | CORE_RUNTIME | 6 | public | Chapter-based narrative organization | Yes |
| `/api/characters` | CORE_RUNTIME | 25 | protected | Character / people management | Yes |
| `/api/chat` | CORE_RUNTIME | 8 | public | Chat interface — primary AI interaction | Yes |
| `/api/chat-memory` | CORE_RUNTIME | 2 | protected | Per-session chat memory store | Yes |
| `/api/chat/message` | CORE_RUNTIME | 2 | protected | Orchestrated chat message processing | Yes |
| `/api/chronology` | EXPERIMENTAL | 13 | protected | Chronological event ordering | 503 unless flag |
| `/api/cognitive-bias` | EXPERIMENTAL | 1 | protected | Cognitive bias detection | 503 unless flag |
| `/api/conflicts` | EXPERIMENTAL | 3 | protected | Conflict tracking | 503 unless flag |
| `/api/consolidation` | EXPERIMENTAL | 3 | protected | Memory consolidation pipeline | 503 unless flag |
| `/api/context` | CORE_RUNTIME | 3 | protected | Context assembly for RAG prompts | Yes |
| `/api/continuity` | CORE_RUNTIME | 4 | protected | Narrative continuity engine | Yes |
| `/api/continuity-profile` | EXPERIMENTAL | 3 | protected | User continuity profile | 503 unless flag |
| `/api/contradiction-alerts` | CORE_RUNTIME | 4 | protected | Contradiction detection and alert routing | Yes |
| `/api/contradictions` | CORE_RUNTIME | 4 | protected | Contradiction Engine: proven divergences between stated iden | Yes |
| `/api/conversation` | CORE_RUNTIME | 64 | protected | Chat thread CRUD — create, load, save, delete conversation t | Yes |
| `/api/correction-dashboard` | ADMIN | 9 | protected | Correction review dashboard | Gated |
| `/api/corrections` | CORE_RUNTIME | 2 | public | Factual corrections and truth reconciliation | Yes |
| `/api/counts` | CORE_RUNTIME | 1 | protected | Entity count summary for sidebar badges | Yes |
| `/api/creative` | EXPERIMENTAL | 6 | protected | Creative expression tracking | 503 unless flag |
| `/api/decisions` | EXPERIMENTAL | 6 | protected | Decision tracking and analysis | 503 unless flag |
| `/api/dev` | ADMIN | 5 | protected | Development-only tooling | Gated |
| `/api/diagnostics` | CORE_RUNTIME | 16 | public | Runtime diagnostics | Yes |
| `/api/distortions` | EXPERIMENTAL | 1 | protected | Cognitive distortion analysis | 503 unless flag |
| `/api/documents` | EXPERIMENTAL | 4 | protected | Document upload and processing | 503 unless flag |
| `/api/dreams` | EXPERIMENTAL | 5 | protected | Dream journaling and analysis | 503 unless flag |
| `/api/emotion` | EXPERIMENTAL | 7 | protected | Emotion extraction | 503 unless flag |
| `/api/emotion-resolution` | EXPERIMENTAL | 3 | protected | Emotion resolution pathways | 503 unless flag |
| `/api/emotions` | EXPERIMENTAL | 3 | protected | Emotional intelligence analysis | 503 unless flag |
| `/api/engine-registry` | EXPERIMENTAL | 5 | protected | Engine registry | 503 unless flag |
| `/api/engine-runtime` | EXPERIMENTAL | 4 | protected | Engine runtime execution | 503 unless flag |
| `/api/engines` | EXPERIMENTAL | 4 | protected | Engine management | 503 unless flag |
| `/api/entities` | CORE_RUNTIME | 3 | protected | Entity extraction and management | Yes |
| `/api/entity-ambiguity` | EXPERIMENTAL | 1 | protected | Entity ambiguity detection and resolution | 503 unless flag |
| `/api/entity-meaning-drift` | EXPERIMENTAL | 3 | protected | Semantic drift detection for entities | 503 unless flag |
| `/api/entity-resolution` | EXPERIMENTAL | 10 | protected | Entity deduplication and resolution | 503 unless flag |
| `/api/entries` | CORE_RUNTIME | 13 | public | Journal entry creation and retrieval | Yes |
| `/api/essence` | EXPERIMENTAL | 5 | protected | Essence refinement | 503 unless flag |
| `/api/events` | EXPERIMENTAL | 3 | protected | Event extraction and storage | 503 unless flag |
| `/api/evolution` | CORE_RUNTIME | 1 | public | Personal evolution tracking | Yes |
| `/api/external-hub` | EXPERIMENTAL | 0 | protected | External data ingestion hub | 503 unless flag |
| `/api/family-trees` | CORE_RUNTIME | 6 | protected | Family trees and character group affiliations | Yes |
| `/api/financial` | EXPERIMENTAL | 4 | protected | Financial pattern analysis | 503 unless flag |
| `/api/github` | EXPERIMENTAL | 3 | protected | GitHub integration | 503 unless flag |
| `/api/goals` | EXPERIMENTAL | 14 | protected | Goal tracking | 503 unless flag |
| `/api/graph` | EXPERIMENTAL | 4 | protected | Knowledge graph construction | 503 unless flag |
| `/api/group-candidates` | CORE_RUNTIME | 6 | protected | Group candidate review queue — detected groups awaiting user | Yes |
| `/api/growth` | EXPERIMENTAL | 4 | protected | Growth pattern extraction | 503 unless flag |
| `/api/habits` | EXPERIMENTAL | 4 | protected | Habit detection and tracking | 503 unless flag |
| `/api/harmonization` | EXPERIMENTAL | 0 | protected | Data harmonization layer | 503 unless flag |
| `/api/health` | CORE_RUNTIME | 8 | public | Health check (Railway healthcheck target) | Yes |
| `/api/hqi` | EXPERIMENTAL | 3 | protected | Human Quality Index | 503 unless flag |
| `/api/identity` | EXPERIMENTAL | 8 | protected | Identity model management | 503 unless flag |
| `/api/identity-core` | EXPERIMENTAL | 3 | protected | Core identity engine | 503 unless flag |
| `/api/influence` | EXPERIMENTAL | 5 | protected | Influence network analysis | 503 unless flag |
| `/api/inner-dialogue` | EXPERIMENTAL | 1 | protected | Internal dialogue extraction | 503 unless flag |
| `/api/inner-mythology` | EXPERIMENTAL | 3 | protected | Personal mythology engine | 503 unless flag |
| `/api/insights` | EXPERIMENTAL | 4 | protected | Insight storage and retrieval | 503 unless flag |
| `/api/integrations` | EXPERIMENTAL | 4 | protected | Third-party integrations hub | 503 unless flag |
| `/api/internal/engine` | EXPERIMENTAL | 3 | protected | Engine health monitoring | 503 unless flag |
| `/api/intervention` | EXPERIMENTAL | 4 | protected | Intervention recommendation system | 503 unless flag |
| `/api/journal` | EXPERIMENTAL | 2 | protected | Structured journal entries | 503 unless flag |
| `/api/knowledge` | EXPERIMENTAL | 5 | protected | Knowledge crystallization — durable claims with evidence tra | 503 unless flag |
| `/api/knowledge-type` | EXPERIMENTAL | 3 | protected | Knowledge type classification engine | 503 unless flag |
| `/api/learning` | EXPERIMENTAL | 3 | protected | Learning pattern detection | 503 unless flag |
| `/api/legacy` | EXPERIMENTAL | 5 | protected | Legacy narrative construction | 503 unless flag |
| `/api/legal` | CORE_RUNTIME | 2 | public | Terms of service, privacy policy | Yes |
| `/api/life` | EXPERIMENTAL | 2 | protected | Holistic life view | 503 unless flag |
| `/api/life-arcs` | EXPERIMENTAL | 7 | protected | Life arc CRUD — list, create, update, delete arcs and relati | 503 unless flag |
| `/api/location-resolution` | EXPERIMENTAL | 3 | protected | Location entity resolution | 503 unless flag |
| `/api/locations` | CORE_RUNTIME | 7 | public | Location entity management — used in lorebook, character pro | Yes |
| `/api/memoir` | EXPERIMENTAL | 6 | protected | Memoir generation | 503 unless flag |
| `/api/memory-engine` | EXPERIMENTAL | 11 | protected | Extended memory engine operations | 503 unless flag |
| `/api/memory-graph` | EXPERIMENTAL | 2 | public | Memory graph traversal | 503 unless flag |
| `/api/memory-ladder` | EXPERIMENTAL | 1 | public | Memory ladder / hierarchy retrieval | 503 unless flag |
| `/api/memory-recall` | CORE_RUNTIME | 2 | protected | Memory retrieval and RAG | Yes |
| `/api/meta` | EXPERIMENTAL | 4 | protected | Meta-control plane | 503 unless flag |
| `/api/moods` | EXPERIMENTAL | 1 | protected | Mood tracking | 503 unless flag |
| `/api/mrq` | EXPERIMENTAL | 6 | protected | Memory review queue | 503 unless flag |
| `/api/naming` | EXPERIMENTAL | 3 | protected | Entity naming suggestions | 503 unless flag |
| `/api/narrative` | CORE_RUNTIME | 5 | protected | Core narrative structuring | Yes |
| `/api/narrative-diff` | EXPERIMENTAL | 4 | protected | Narrative change detection | 503 unless flag |
| `/api/notebook` | EXPERIMENTAL | 3 | protected | Personal notebook | 503 unless flag |
| `/api/omega-memory` | CORE_RUNTIME | 9 | protected | Long-term memory persistence layer | Yes |
| `/api/onboarding` | CORE_RUNTIME | 6 | protected | User onboarding flow | Yes |
| `/api/orchestrator` | RESEARCH | 8 | protected | Multi-agent orchestration research | Gated |
| `/api/organizations` | CORE_RUNTIME | 23 | protected | Organization and group entity management | Yes |
| `/api/paracosm` | EXPERIMENTAL | 1 | protected | Imaginal world modeling | 503 unless flag |
| `/api/people-places` | EXPERIMENTAL | 4 | public | People and places extraction | 503 unless flag |
| `/api/perception-reaction-engine` | EXPERIMENTAL | 5 | protected | Perception-reaction correlation engine | 503 unless flag |
| `/api/perceptions` | CORE_RUNTIME | 10 | protected | Perception tracking — character intelligence layer | Yes |
| `/api/persona` | EXPERIMENTAL | 4 | protected | Persona construction | 503 unless flag |
| `/api/personality` | EXPERIMENTAL | 2 | protected | Personality model construction | 503 unless flag |
| `/api/perspectives` | EXPERIMENTAL | 9 | protected | Epistemic perspective management | 503 unless flag |
| `/api/photos` | EXPERIMENTAL | 6 | public | Photo ingestion | 503 unless flag |
| `/api/prediction` | EXPERIMENTAL | 5 | protected | Behavioral prediction | 503 unless flag |
| `/api/predictions` | EXPERIMENTAL | 4 | protected | Prediction storage and retrieval | 503 unless flag |
| `/api/privacy` | CORE_RUNTIME | 6 | protected | Privacy settings and data controls | Yes |
| `/api/quests` | EXPERIMENTAL | 22 | protected | Quest system | 503 unless flag |
| `/api/reactions` | EXPERIMENTAL | 6 | protected | Reaction pattern analysis | 503 unless flag |
| `/api/recommendations` | EXPERIMENTAL | 7 | protected | Recommendation engine | 503 unless flag |
| `/api/reflection` | EXPERIMENTAL | 2 | protected | Guided reflection system | 503 unless flag |
| `/api/relationship-dynamics` | EXPERIMENTAL | 5 | protected | Relationship dynamics analysis | 503 unless flag |
| `/api/relationships` | CORE_RUNTIME | 3 | protected | Relationship role inference — infers social hierarchy from n | Yes |
| `/api/resilience` | EXPERIMENTAL | 6 | protected | Resilience scoring | 503 unless flag |
| `/api/resume` | EXPERIMENTAL | 3 | protected | Resume / profile claim parsing | 503 unless flag |
| `/api/revealed-self` | CORE_RUNTIME | 3 | protected | Revealed Preference Engine: stated-vs-revealed priorities fr | Yes |
| `/api/rpg` | EXPERIMENTAL | 8 | protected | RPG gamification layer | 503 unless flag |
| `/api/scenes` | EXPERIMENTAL | 3 | protected | Scene-level memory extraction | 503 unless flag |
| `/api/search` | CORE_RUNTIME | 1 | protected | Semantic and keyword search | Yes |
| `/api/security` | CORE_RUNTIME | 1 | protected | CSRF token endpoint — GET /api/security/csrf-token | Yes |
| `/api/shadow` | EXPERIMENTAL | 2 | protected | Shadow self engine | 503 unless flag |
| `/api/skills` | CORE_RUNTIME | 16 | protected | Skill tracking, suggestions, and skill profile intelligence | Yes |
| `/api/social` | EXPERIMENTAL | 2 | protected | Social network analysis | 503 unless flag |
| `/api/social-projection` | EXPERIMENTAL | 2 | protected | Social self-projection modeling | 503 unless flag |
| `/api/story-of-self` | EXPERIMENTAL | 1 | protected | Self-narrative construction | 503 unless flag |
| `/api/strategy` | EXPERIMENTAL | 12 | protected | Personal strategy training | 503 unless flag |
| `/api/subscription` | CORE_RUNTIME | 6 | protected | Subscription tier management | Yes |
| `/api/summary` | CORE_RUNTIME | 2 | public | Entry and period summaries | Yes |
| `/api/tasks` | EXPERIMENTAL | 11 | public | Task management | 503 unless flag |
| `/api/temporal-events` | EXPERIMENTAL | 3 | protected | Temporal event extraction | 503 unless flag |
| `/api/temporal-relationships` | EXPERIMENTAL | 5 | protected | Temporal relationship tracking | 503 unless flag |
| `/api/thoughts` | EXPERIMENTAL | 4 | protected | Thought classification and response | 503 unless flag |
| `/api/threads` | CORE_RUNTIME | 16 | protected | Conversation thread persistence and retrieval | Yes |
| `/api/time` | EXPERIMENTAL | 7 | protected | Temporal reasoning | 503 unless flag |
| `/api/timeline` | CORE_RUNTIME | 16 | public | Primary timeline view | Yes |
| `/api/timeline-hierarchy` | EXPERIMENTAL | 13 | protected | Hierarchical timeline view | 503 unless flag |
| `/api/timeline-v2` | CORE_RUNTIME | 5 | protected | Timeline v2 — full CRUD, used by TimelineV2 components | Yes |
| `/api/toxicity` | EXPERIMENTAL | 4 | protected | Relationship toxicity detection | 503 unless flag |
| `/api/user` | CORE_RUNTIME | 12 | protected | User profile, ToS acceptance, settings | Yes |
| `/api/values` | EXPERIMENTAL | 5 | protected | Values extraction and tracking | 503 unless flag |
| `/api/verification` | EXPERIMENTAL | 6 | protected | Identity verification | 503 unless flag |
| `/api/voids` | EXPERIMENTAL | 4 | protected | Void / absence pattern detection | 503 unless flag |
| `/api/will` | EXPERIMENTAL | 3 | protected | Intentionality and will tracking | 503 unless flag |
| `/api/wisdom` | EXPERIMENTAL | 3 | protected | Wisdom extraction | 503 unless flag |
| `/api/x` | EXPERIMENTAL | 1 | public | X (Twitter) integration | 503 unless flag |

## CORE_RUNTIME Route Detail (353 endpoints)

### `/` (8 routes)

**Purpose:** Liveness check — no auth, no DB

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `` |
| POST | `/analyze` | `/analyze` |
| GET | `/symptoms` | `/symptoms` |
| GET | `/sleep` | `/sleep` |
| GET | `/energy` | `/energy` |
| GET | `/wellness` | `/wellness` |
| GET | `/insights` | `/insights` |
| GET | `/stats` | `/stats` |

### `/api/account` (2 routes)

**Purpose:** Account management

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/export` | `/api/account/export` |
| POST | `/delete` | `/api/account/delete` |

### `/api/admin` (13 routes)

**Purpose:** Admin panel — metrics, users, finance, system tools

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/metrics` | `/api/admin/metrics` |
| GET | `/users` | `/api/admin/users` |
| GET | `/logs` | `/api/admin/logs` |
| GET | `/ai-events` | `/api/admin/ai-events` |
| POST | `/reindex` | `/api/admin/reindex` |
| POST | `/flush-cache` | `/api/admin/flush-cache` |
| POST | `/rebuild-clusters` | `/api/admin/rebuild-clusters` |
| GET | `/finance/metrics` | `/api/admin/finance/metrics` |
| GET | `/finance/revenue` | `/api/admin/finance/revenue` |
| GET | `/finance/subscriptions` | `/api/admin/finance/subscriptions` |
| GET | `/finance/payment-events` | `/api/admin/finance/payment-events` |
| POST | `/finance/subscriptions/:id/cancel` | `/api/admin/finance/subscriptions/:id/cancel` |
| POST | `/finance/subscriptions/:id/reset-billing` | `/api/admin/finance/subscriptions/:id/reset-billing` |

### `/api/canon` (1 routes)

**Purpose:** Canon status management

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/canon` |

### `/api/chapters` (6 routes)

**Purpose:** Chapter-based narrative organization

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/` | `/api/chapters` |
| GET | `/` | `/api/chapters` |
| GET | `/:id` | `/api/chapters/:id` |
| PATCH | `/:id` | `/api/chapters/:id` |
| DELETE | `/:id` | `/api/chapters/:id` |
| POST | `/extract-info` | `/api/chapters/extract-info` |

### `/api/characters` (25 routes)

**Purpose:** Character / people management

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/` | `/api/characters` |
| GET | `/duplicates` | `/api/characters/duplicates` |
| POST | `/merge` | `/api/characters/merge` |
| POST | `/questions/:id/resolve` | `/api/characters/questions/:id/resolve` |
| GET | `/list` | `/api/characters/list` |
| GET | `/registry` | `/api/characters/registry` |
| POST | `/registry/rebuild` | `/api/characters/registry/rebuild` |
| POST | `/ensure-self` | `/api/characters/ensure-self` |
| POST | `/self/sync` | `/api/characters/self/sync` |
| GET | `/self/profile` | `/api/characters/self/profile` |
| GET | `/suggestions` | `/api/characters/suggestions` |
| GET | `/:id` | `/api/characters/:id` |
| PATCH | `/:id` | `/api/characters/:id` |
| DELETE | `/:id` | `/api/characters/:id` |
| POST | `/extract-from-chat` | `/api/characters/extract-from-chat` |
| GET | `/:id/attributes` | `/api/characters/:id/attributes` |
| GET | `/:id/provenance` | `/api/characters/:id/provenance` |
| POST | `/:id/contradictions/resolve` | `/api/characters/:id/contradictions/resolve` |
| GET | `/:id/lifecycle` | `/api/characters/:id/lifecycle` |
| POST | `/social-standing/recompute` | `/api/characters/social-standing/recompute` |
| POST | `/classify-backfill` | `/api/characters/classify-backfill` |
| GET | `/:id/conversations` | `/api/characters/:id/conversations` |
| GET | `/:id/knowledge-base` | `/api/characters/:id/knowledge-base` |
| GET | `/:id/facts` | `/api/characters/:id/facts` |
| GET | `/:id/scene-candidates` | `/api/characters/:id/scene-candidates` |

### `/api/chat` (8 routes)

**Purpose:** Chat interface — primary AI interaction

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/stream` | `/api/chat/stream` |
| POST | `/` | `/api/chat` |
| GET | `/test-openai` | `/api/chat/test-openai` |
| POST | `/feedback` | `/api/chat/feedback` |
| POST | `/action` | `/api/chat/action` |
| GET | `/memory-feedback/:messageId` | `/api/chat/memory-feedback/:messageId` |
| PATCH | `/messages/:id` | `/api/chat/messages/:id` |
| GET | `/messages/:id/revisions` | `/api/chat/messages/:id/revisions` |

### `/api/chat-memory` (2 routes)

**Purpose:** Per-session chat memory store

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/` | `/api/chat-memory` |
| POST | `/stream` | `/api/chat-memory/stream` |

### `/api/chat/message` (2 routes)

**Purpose:** Orchestrated chat message processing

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/message` | `/api/chat/message/message` |
| GET | `/history/:sessionId` | `/api/chat/message/history/:sessionId` |

### `/api/context` (3 routes)

**Purpose:** Context assembly for RAG prompts

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/context` |
| GET | `/temporal` | `/api/context/temporal` |
| GET | `/emotional` | `/api/context/emotional` |

### `/api/continuity` (4 routes)

**Purpose:** Narrative continuity engine

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/events` | `/api/continuity/events` |
| GET | `/events/:id` | `/api/continuity/events/:id` |
| POST | `/events/:id/revert` | `/api/continuity/events/:id/revert` |
| GET | `/events/:id/reversal` | `/api/continuity/events/:id/reversal` |

### `/api/contradiction-alerts` (4 routes)

**Purpose:** Contradiction detection and alert routing

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/contradiction-alerts` |
| GET | `/:alertId` | `/api/contradiction-alerts/:alertId` |
| POST | `/:alertId/action` | `/api/contradiction-alerts/:alertId/action` |
| POST | `/check/:beliefUnitId` | `/api/contradiction-alerts/check/:beliefUnitId` |

### `/api/contradictions` (4 routes)

**Purpose:** Contradiction Engine: proven divergences between stated identity and revealed behavior

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/contradictions` |
| POST | `/detect` | `/api/contradictions/detect` |
| GET | `/epiphany-candidates` | `/api/contradictions/epiphany-candidates` |
| GET | `/:id/evidence` | `/api/contradictions/:id/evidence` |

### `/api/conversation` (64 routes)

**Purpose:** Chat thread CRUD — create, load, save, delete conversation threads

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/ingest` | `/api/conversation/ingest` |
| POST | `/assemble-events` | `/api/conversation/assemble-events` |
| GET | `/threads` | `/api/conversation/threads` |
| POST | `/threads/backfill-entity-links` | `/api/conversation/threads/backfill-entity-links` |
| POST | `/threads/recover-orphans` | `/api/conversation/threads/recover-orphans` |
| DELETE | `/threads/empty` | `/api/conversation/threads/empty` |
| GET | `/threads/explore` | `/api/conversation/threads/explore` |
| GET | `/threads/facets` | `/api/conversation/threads/facets` |
| DELETE | `/threads/dedupe` | `/api/conversation/threads/dedupe` |
| POST | `/threads` | `/api/conversation/threads` |
| POST | `/threads/:id/end` | `/api/conversation/threads/:id/end` |
| GET | `/threads/:id/context` | `/api/conversation/threads/:id/context` |
| POST | `/threads/:id/ensure-visible` | `/api/conversation/threads/:id/ensure-visible` |
| GET | `/threads/:id/status` | `/api/conversation/threads/:id/status` |
| GET | `/threads/:id/messages` | `/api/conversation/threads/:id/messages` |
| GET | `/threads/:id/units` | `/api/conversation/threads/:id/units` |
| POST | `/resolve-contradiction` | `/api/conversation/resolve-contradiction` |
| POST | `/correct-unit` | `/api/conversation/correct-unit` |
| POST | `/prune-deprecated` | `/api/conversation/prune-deprecated` |
| GET | `/contradictions` | `/api/conversation/contradictions` |
| GET | `/events` | `/api/conversation/events` |
| GET | `/events/:id` | `/api/conversation/events/:id` |
| GET | `/events/:id/causal-links` | `/api/conversation/events/:id/causal-links` |
| GET | `/events/:id/chat-history` | `/api/conversation/events/:id/chat-history` |
| GET | `/events/:id/sources` | `/api/conversation/events/:id/sources` |
| POST | `/events/:id/chat` | `/api/conversation/events/:id/chat` |
| GET | `/trace/chat/:chatMessageId` | `/api/conversation/trace/chat/:chatMessageId` |
| GET | `/trace/memory/:artifactType/:artifactId` | `/api/conversation/trace/memory/:artifactType/:artifactId` |
| GET | `/trace/unit/:unitId` | `/api/conversation/trace/unit/:unitId` |
| GET | `/entities/:entityId/relationships` | `/api/conversation/entities/:entityId/relationships` |
| GET | `/entities/:entityId/scopes` | `/api/conversation/entities/:entityId/scopes` |
| GET | `/scopes/:scope/entities` | `/api/conversation/scopes/:scope/entities` |
| GET | `/entities/:entityId/relationship-chain` | `/api/conversation/entities/:entityId/relationship-chain` |
| GET | `/relationship-trees/:entityId` | `/api/conversation/relationship-trees/:entityId` |
| POST | `/relationship-trees/:entityId/rebuild` | `/api/conversation/relationship-trees/:entityId/rebuild` |
| GET | `/relationship-trees` | `/api/conversation/relationship-trees` |
| GET | `/entities/:entityId/attributes` | `/api/conversation/entities/:entityId/attributes` |
| GET | `/skill-network` | `/api/conversation/skill-network` |
| POST | `/skill-network/detect-clusters` | `/api/conversation/skill-network/detect-clusters` |
| GET | `/group-network` | `/api/conversation/group-network` |
| GET | `/romantic-relationships` | `/api/conversation/romantic-relationships` |
| GET | `/romantic-relationships/top-affections` | `/api/conversation/romantic-relationships/top-affections` |
| GET | `/romantic-relationships/:id/analytics` | `/api/conversation/romantic-relationships/:id/analytics` |
| GET | `/romantic-relationships/:id/ranking` | `/api/conversation/romantic-relationships/:id/ranking` |
| POST | `/romantic-relationships/calculate-rankings` | `/api/conversation/romantic-relationships/calculate-rankings` |
| GET | `/romantic-relationships/:id/dates` | `/api/conversation/romantic-relationships/:id/dates` |
| POST | `/romantic-relationships/calculate-affection` | `/api/conversation/romantic-relationships/calculate-affection` |
| GET | `/romantic-relationships/:id/drift` | `/api/conversation/romantic-relationships/:id/drift` |
| GET | `/romantic-relationships/:id/cycles` | `/api/conversation/romantic-relationships/:id/cycles` |
| GET | `/romantic-relationships/:id/breakup` | `/api/conversation/romantic-relationships/:id/breakup` |
| POST | `/romantic-relationships/detect-drift-all` | `/api/conversation/romantic-relationships/detect-drift-all` |
| GET | `/characters/:id/timelines` | `/api/conversation/characters/:id/timelines` |
| POST | `/characters/:id/rebuild-timelines` | `/api/conversation/characters/:id/rebuild-timelines` |
| POST | `/romantic-relationships/:id/chat` | `/api/conversation/romantic-relationships/:id/chat` |
| GET | `/romantic-relationships/:id/influence` | `/api/conversation/romantic-relationships/:id/influence` |
| POST | `/threads/:id/title` | `/api/conversation/threads/:id/title` |
| PATCH | `/threads/:id/title` | `/api/conversation/threads/:id/title` |
| PATCH | `/threads/:id` | `/api/conversation/threads/:id` |
| DELETE | `/threads/:id` | `/api/conversation/threads/:id` |
| POST | `/threads/:id/fork` | `/api/conversation/threads/:id/fork` |
| GET | `/event-candidates` | `/api/conversation/event-candidates` |
| GET | `/event-linkage-stats` | `/api/conversation/event-linkage-stats` |
| GET | `/greeting/:threadId` | `/api/conversation/greeting/:threadId` |
| GET | `/what-changed` | `/api/conversation/what-changed` |

### `/api/corrections` (2 routes)

**Purpose:** Factual corrections and truth reconciliation

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/:entryId` | `/api/corrections/:entryId` |
| POST | `/:entryId` | `/api/corrections/:entryId` |

### `/api/counts` (1 routes)

**Purpose:** Entity count summary for sidebar badges

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/counts` |

### `/api/diagnostics` (16 routes)

**Purpose:** Runtime diagnostics

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/diagnostics` |
| GET | `/cors` | `/api/diagnostics/cors` |
| GET | `/cognition-health` | `/api/diagnostics/cognition-health` |
| GET | `/graph-recovery` | `/api/diagnostics/graph-recovery` |
| POST | `/graph-recovery/run` | `/api/diagnostics/graph-recovery/run` |
| GET | `/thread-health` | `/api/diagnostics/thread-health` |
| POST | `/thread-health/repair` | `/api/diagnostics/thread-health/repair` |
| GET | `/continuity-trace/:userId` | `/api/diagnostics/continuity-trace/:userId` |
| GET | `/intelligence-health` | `/api/diagnostics/intelligence-health` |
| GET | `/story-coverage` | `/api/diagnostics/story-coverage` |
| POST | `/working-memory` | `/api/diagnostics/working-memory` |
| GET | `/memory-coverage` | `/api/diagnostics/memory-coverage` |
| POST | `/repair-entity-pollution` | `/api/diagnostics/repair-entity-pollution` |
| POST | `/recover-relationships` | `/api/diagnostics/recover-relationships` |
| POST | `/recover-events` | `/api/diagnostics/recover-events` |
| POST | `/life-reconstruction-score` | `/api/diagnostics/life-reconstruction-score` |

### `/api/entities` (3 routes)

**Purpose:** Entity extraction and management

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/certified-index` | `/api/entities/certified-index` |
| POST | `/match` | `/api/entities/match` |
| POST | `/auto-update` | `/api/entities/auto-update` |

### `/api/entries` (13 routes)

**Purpose:** Journal entry creation and retrieval

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/entries` |
| POST | `/` | `/api/entries` |
| GET | `/fading` | `/api/entries/fading` |
| GET | `/:id` | `/api/entries/:id` |
| PATCH | `/:id` | `/api/entries/:id` |
| POST | `/suggest-tags` | `/api/entries/suggest-tags` |
| POST | `/detect` | `/api/entries/detect` |
| POST | `/voice` | `/api/entries/voice` |
| GET | `/recent` | `/api/entries/recent` |
| GET | `/search/keyword` | `/api/entries/search/keyword` |
| POST | `/clusters` | `/api/entries/clusters` |
| POST | `/:id/link` | `/api/entries/:id/link` |
| GET | `/:id/linked` | `/api/entries/:id/linked` |

### `/api/evolution` (1 routes)

**Purpose:** Personal evolution tracking

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/evolution` |

### `/api/family-trees` (6 routes)

**Purpose:** Family trees and character group affiliations

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/mine` | `/api/family-trees/mine` |
| GET | `/character/:id` | `/api/family-trees/character/:id` |
| POST | `/character/:id/rebuild` | `/api/family-trees/character/:id/rebuild` |
| GET | `/organization/:id` | `/api/family-trees/organization/:id` |
| GET | `/character/:id/affiliations` | `/api/family-trees/character/:id/affiliations` |
| GET | `/organization/:id/member-affiliations` | `/api/family-trees/organization/:id/member-affiliations` |

### `/api/group-candidates` (6 routes)

**Purpose:** Group candidate review queue — detected groups awaiting user confirmation

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/group-candidates` |
| POST | `/scan` | `/api/group-candidates/scan` |
| GET | `/count` | `/api/group-candidates/count` |
| POST | `/:id/accept` | `/api/group-candidates/:id/accept` |
| POST | `/:id/merge` | `/api/group-candidates/:id/merge` |
| POST | `/:id/reject` | `/api/group-candidates/:id/reject` |

### `/api/health` (8 routes)

**Purpose:** Health check (Railway healthcheck target)

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/health` |
| POST | `/analyze` | `/api/health/analyze` |
| GET | `/symptoms` | `/api/health/symptoms` |
| GET | `/sleep` | `/api/health/sleep` |
| GET | `/energy` | `/api/health/energy` |
| GET | `/wellness` | `/api/health/wellness` |
| GET | `/insights` | `/api/health/insights` |
| GET | `/stats` | `/api/health/stats` |

### `/api/legal` (2 routes)

**Purpose:** Terms of service, privacy policy

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/terms` | `/api/legal/terms` |
| GET | `/privacy` | `/api/legal/privacy` |

### `/api/locations` (7 routes)

**Purpose:** Location entity management — used in lorebook, character profiles, entity detail

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/locations` |
| GET | `/suggestions` | `/api/locations/suggestions` |
| POST | `/suggestions/accept` | `/api/locations/suggestions/accept` |
| GET | `/duplicates` | `/api/locations/duplicates` |
| POST | `/merge` | `/api/locations/merge` |
| GET | `/:id/facts` | `/api/locations/:id/facts` |
| PATCH | `/:id` | `/api/locations/:id` |

### `/api/memory-recall` (2 routes)

**Purpose:** Memory retrieval and RAG

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/query` | `/api/memory-recall/query` |
| POST | `/chat` | `/api/memory-recall/chat` |

### `/api/narrative` (5 routes)

**Purpose:** Core narrative structuring

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/build` | `/api/narrative/build` |
| GET | `/:id` | `/api/narrative/:id` |
| GET | `/` | `/api/narrative` |
| POST | `/:id/status` | `/api/narrative/:id/status` |
| GET | `/stats` | `/api/narrative/stats` |

### `/api/omega-memory` (9 routes)

**Purpose:** Long-term memory persistence layer

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/ingest` | `/api/omega-memory/ingest` |
| GET | `/entities` | `/api/omega-memory/entities` |
| GET | `/entities/:id/claims` | `/api/omega-memory/entities/:id/claims` |
| GET | `/entities/:id/ranked-claims` | `/api/omega-memory/entities/:id/ranked-claims` |
| GET | `/entities/:id/summary` | `/api/omega-memory/entities/:id/summary` |
| POST | `/claims/:id/evidence` | `/api/omega-memory/claims/:id/evidence` |
| POST | `/suggestions/:id/approve` | `/api/omega-memory/suggestions/:id/approve` |
| POST | `/entities/merge` | `/api/omega-memory/entities/merge` |
| PATCH | `/claims/:id` | `/api/omega-memory/claims/:id` |

### `/api/onboarding` (6 routes)

**Purpose:** User onboarding flow

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/init` | `/api/onboarding/init` |
| POST | `/import` | `/api/onboarding/import` |
| GET | `/briefing` | `/api/onboarding/briefing` |
| POST | `/analyze-user` | `/api/onboarding/analyze-user` |
| POST | `/detect-personas` | `/api/onboarding/detect-personas` |
| POST | `/complete` | `/api/onboarding/complete` |

### `/api/organizations` (23 routes)

**Purpose:** Organization and group entity management

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/organizations` |
| GET | `/by-character` | `/api/organizations/by-character` |
| GET | `/duplicates` | `/api/organizations/duplicates` |
| POST | `/merge` | `/api/organizations/merge` |
| GET | `/network` | `/api/organizations/network` |
| POST | `/reconcile-relationships` | `/api/organizations/reconcile-relationships` |
| GET | `/:id` | `/api/organizations/:id` |
| POST | `/` | `/api/organizations` |
| PATCH | `/:id` | `/api/organizations/:id` |
| DELETE | `/:id` | `/api/organizations/:id` |
| POST | `/:id/members` | `/api/organizations/:id/members` |
| DELETE | `/:id/members/:memberId` | `/api/organizations/:id/members/:memberId` |
| GET | `/:id/derived-context` | `/api/organizations/:id/derived-context` |
| POST | `/:id/events` | `/api/organizations/:id/events` |
| DELETE | `/:id/events/:eventId` | `/api/organizations/:id/events/:eventId` |
| POST | `/:id/stories` | `/api/organizations/:id/stories` |
| DELETE | `/:id/stories/:storyId` | `/api/organizations/:id/stories/:storyId` |
| POST | `/:id/locations` | `/api/organizations/:id/locations` |
| DELETE | `/:id/locations/:locationId` | `/api/organizations/:id/locations/:locationId` |
| POST | `/:id/relationships` | `/api/organizations/:id/relationships` |
| GET | `/:id/relationships` | `/api/organizations/:id/relationships` |
| DELETE | `/:id/relationships/:relationshipId` | `/api/organizations/:id/relationships/:relationshipId` |
| GET | `/:id/facts` | `/api/organizations/:id/facts` |

### `/api/perceptions` (10 routes)

**Purpose:** Perception tracking — character intelligence layer

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/` | `/api/perceptions` |
| GET | `/` | `/api/perceptions` |
| GET | `/about/:personId` | `/api/perceptions/about/:personId` |
| GET | `/evolution/:personId` | `/api/perceptions/evolution/:personId` |
| GET | `/lens` | `/api/perceptions/lens` |
| GET | `/review-needed` | `/api/perceptions/review-needed` |
| PATCH | `/:id` | `/api/perceptions/:id` |
| DELETE | `/:id` | `/api/perceptions/:id` |
| POST | `/detect` | `/api/perceptions/detect` |
| POST | `/extract-from-chat` | `/api/perceptions/extract-from-chat` |

### `/api/privacy` (6 routes)

**Purpose:** Privacy settings and data controls

| Method | Path | Full Path |
| --- | --- | --- |
| PATCH | `/scope` | `/api/privacy/scope` |
| DELETE | `/resources/:resource_type/:resource_id` | `/api/privacy/resources/:resource_type/:resource_id` |
| POST | `/resources/:resource_type/:resource_id/archive` | `/api/privacy/resources/:resource_type/:resource_id/archive` |
| GET | `/chat-visible` | `/api/privacy/chat-visible` |
| GET | `/export` | `/api/privacy/export` |
| GET | `/access/:resource_type/:resource_id` | `/api/privacy/access/:resource_type/:resource_id` |

### `/api/relationships` (3 routes)

**Purpose:** Relationship role inference — infers social hierarchy from natural language

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/infer-role` | `/api/relationships/infer-role` |
| POST | `/infer-role-from-entries` | `/api/relationships/infer-role-from-entries` |
| GET | `/role-taxonomy` | `/api/relationships/role-taxonomy` |

### `/api/revealed-self` (3 routes)

**Purpose:** Revealed Preference Engine: stated-vs-revealed priorities from real episodes

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/revealed-self` |
| POST | `/rescan` | `/api/revealed-self/rescan` |
| GET | `/signal/:id/evidence` | `/api/revealed-self/signal/:id/evidence` |

### `/api/search` (1 routes)

**Purpose:** Semantic and keyword search

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/universal` | `/api/search/universal` |

### `/api/security` (1 routes)

**Purpose:** CSRF token endpoint — GET /api/security/csrf-token

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/csrf-token` | `/api/security/csrf-token` |

### `/api/skills` (16 routes)

**Purpose:** Skill tracking, suggestions, and skill profile intelligence

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/skills` |
| GET | `/suggestions` | `/api/skills/suggestions` |
| POST | `/suggestions/materialize` | `/api/skills/suggestions/materialize` |
| POST | `/suggestions/reject-by-name` | `/api/skills/suggestions/reject-by-name` |
| POST | `/suggestions/:id/confirm` | `/api/skills/suggestions/:id/confirm` |
| POST | `/suggestions/:id/reject` | `/api/skills/suggestions/:id/reject` |
| GET | `/:skillId` | `/api/skills/:skillId` |
| POST | `/` | `/api/skills` |
| PATCH | `/:skillId` | `/api/skills/:skillId` |
| POST | `/:skillId/xp` | `/api/skills/:skillId/xp` |
| GET | `/:skillId/progress` | `/api/skills/:skillId/progress` |
| POST | `/extract` | `/api/skills/extract` |
| DELETE | `/:skillId` | `/api/skills/:skillId` |
| GET | `/:skillId/details` | `/api/skills/:skillId/details` |
| POST | `/:skillId/details/extract` | `/api/skills/:skillId/details/extract` |
| PATCH | `/:skillId/details` | `/api/skills/:skillId/details` |

### `/api/subscription` (6 routes)

**Purpose:** Subscription tier management

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/status` | `/api/subscription/status` |
| GET | `/usage` | `/api/subscription/usage` |
| POST | `/create` | `/api/subscription/create` |
| POST | `/cancel` | `/api/subscription/cancel` |
| POST | `/reactivate` | `/api/subscription/reactivate` |
| GET | `/billing-portal` | `/api/subscription/billing-portal` |

### `/api/summary` (2 routes)

**Purpose:** Entry and period summaries

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/` | `/api/summary` |
| POST | `/reflect` | `/api/summary/reflect` |

### `/api/threads` (16 routes)

**Purpose:** Conversation thread persistence and retrieval

| Method | Path | Full Path |
| --- | --- | --- |
| POST | `/` | `/api/threads` |
| GET | `/` | `/api/threads` |
| GET | `/nodes/:nodeType/:nodeId/context` | `/api/threads/nodes/:nodeType/:nodeId/context` |
| GET | `/nodes/:nodeType/:nodeId` | `/api/threads/nodes/:nodeType/:nodeId` |
| POST | `/node-relations` | `/api/threads/node-relations` |
| GET | `/node-relations` | `/api/threads/node-relations` |
| DELETE | `/node-relations/:relationId` | `/api/threads/node-relations/:relationId` |
| GET | `/:id` | `/api/threads/:id` |
| PATCH | `/:id` | `/api/threads/:id` |
| DELETE | `/:id` | `/api/threads/:id` |
| GET | `/:id/timeline` | `/api/threads/:id/timeline` |
| GET | `/:id/interruptions` | `/api/threads/:id/interruptions` |
| POST | `/:id/members` | `/api/threads/:id/members` |
| DELETE | `/:id/members` | `/api/threads/:id/members` |
| DELETE | `/:id/members/:membershipId` | `/api/threads/:id/members/:membershipId` |
| POST | `/:id/entries` | `/api/threads/:id/entries` |

### `/api/timeline` (16 routes)

**Purpose:** Primary timeline view

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/timeline` |
| GET | `/tags` | `/api/timeline/tags` |
| POST | `/append` | `/api/timeline/append` |
| GET | `/entries` | `/api/timeline/entries` |
| GET | `/eras` | `/api/timeline/eras` |
| GET | `/sagas` | `/api/timeline/sagas` |
| GET | `/arcs` | `/api/timeline/arcs` |
| POST | `/score-highlights` | `/api/timeline/score-highlights` |
| GET | `/emotion-intensity` | `/api/timeline/emotion-intensity` |
| POST | `/entries/:id/auto-tag` | `/api/timeline/entries/:id/auto-tag` |
| GET | `/time-anchors` | `/api/timeline/time-anchors` |
| GET | `/character/:characterId` | `/api/timeline/character/:characterId` |
| GET | `/events` | `/api/timeline/events` |
| POST | `/refresh` | `/api/timeline/refresh` |
| DELETE | `/events/:id` | `/api/timeline/events/:id` |
| PATCH | `/events/:id` | `/api/timeline/events/:id` |

### `/api/timeline-v2` (5 routes)

**Purpose:** Timeline v2 — full CRUD, used by TimelineV2 components

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/` | `/api/timeline-v2` |
| POST | `/` | `/api/timeline-v2` |
| GET | `/:id` | `/api/timeline-v2/:id` |
| PATCH | `/:id` | `/api/timeline-v2/:id` |
| DELETE | `/:id` | `/api/timeline-v2/:id` |

### `/api/user` (12 routes)

**Purpose:** User profile, ToS acceptance, settings

| Method | Path | Full Path |
| --- | --- | --- |
| GET | `/authority` | `/api/user/authority` |
| GET | `/profile` | `/api/user/profile` |
| PUT | `/profile` | `/api/user/profile` |
| GET | `/privacy-settings` | `/api/user/privacy-settings` |
| PUT | `/privacy-settings` | `/api/user/privacy-settings` |
| POST | `/activity` | `/api/user/activity` |
| GET | `/activity` | `/api/user/activity` |
| GET | `/storage` | `/api/user/storage` |
| GET | `/export` | `/api/user/export` |
| DELETE | `/delete` | `/api/user/delete` |
| GET | `/terms-status` | `/api/user/terms-status` |
| POST | `/accept-terms` | `/api/user/accept-terms` |


## EXPERIMENTAL Mount Index (490 endpoints, 103 mounts)

Disabled in production unless `ENABLE_EXPERIMENTAL_RUNTIME=true`.

| Mount | Routes | Purpose |
| --- | ---: | --- |
| `/api/achievements` | 6 | Achievement system |
| `/api/activities` | 3 | Activity tracking |
| `/api/alternate-self` | 1 | Alternate self modeling |
| `/api/archetype` | 2 | Archetypal pattern recognition |
| `/api/backward-storytelling` | 1 | Backward storytelling reconstruction |
| `/api/behavior` | 3 | Behavior pattern detection |
| `/api/belief-reconciliation` | 5 | Belief-reality gap detection and reconciliation |
| `/api/bias-ethics` | 25 | Bias detection and ethics review |
| `/api/biography` | 22 | Automated biography generation |
| `/api/calendar` | 1 | Calendar integration |
| `/api/chronology` | 13 | Chronological event ordering |
| `/api/cognitive-bias` | 1 | Cognitive bias detection |
| `/api/conflicts` | 3 | Conflict tracking |
| `/api/consolidation` | 3 | Memory consolidation pipeline |
| `/api/continuity-profile` | 3 | User continuity profile |
| `/api/creative` | 6 | Creative expression tracking |
| `/api/decisions` | 6 | Decision tracking and analysis |
| `/api/distortions` | 1 | Cognitive distortion analysis |
| `/api/documents` | 4 | Document upload and processing |
| `/api/dreams` | 5 | Dream journaling and analysis |
| `/api/emotion` | 7 | Emotion extraction |
| `/api/emotion-resolution` | 3 | Emotion resolution pathways |
| `/api/emotions` | 3 | Emotional intelligence analysis |
| `/api/engine-registry` | 5 | Engine registry |
| `/api/engine-runtime` | 4 | Engine runtime execution |
| `/api/engines` | 4 | Engine management |
| `/api/entity-ambiguity` | 1 | Entity ambiguity detection and resolution |
| `/api/entity-meaning-drift` | 3 | Semantic drift detection for entities |
| `/api/entity-resolution` | 10 | Entity deduplication and resolution |
| `/api/essence` | 5 | Essence refinement |
| `/api/events` | 3 | Event extraction and storage |
| `/api/external-hub` | 0 | External data ingestion hub |
| `/api/financial` | 4 | Financial pattern analysis |
| `/api/github` | 3 | GitHub integration |
| `/api/goals` | 14 | Goal tracking |
| `/api/graph` | 4 | Knowledge graph construction |
| `/api/growth` | 4 | Growth pattern extraction |
| `/api/habits` | 4 | Habit detection and tracking |
| `/api/harmonization` | 0 | Data harmonization layer |
| `/api/hqi` | 3 | Human Quality Index |
| `/api/identity` | 8 | Identity model management |
| `/api/identity-core` | 3 | Core identity engine |
| `/api/influence` | 5 | Influence network analysis |
| `/api/inner-dialogue` | 1 | Internal dialogue extraction |
| `/api/inner-mythology` | 3 | Personal mythology engine |
| `/api/insights` | 4 | Insight storage and retrieval |
| `/api/integrations` | 4 | Third-party integrations hub |
| `/api/internal/engine` | 3 | Engine health monitoring |
| `/api/intervention` | 4 | Intervention recommendation system |
| `/api/journal` | 2 | Structured journal entries |
| `/api/knowledge` | 5 | Knowledge crystallization — durable claims with evidence traceability |
| `/api/knowledge-type` | 3 | Knowledge type classification engine |
| `/api/learning` | 3 | Learning pattern detection |
| `/api/legacy` | 5 | Legacy narrative construction |
| `/api/life` | 2 | Holistic life view |
| `/api/life-arcs` | 7 | Life arc CRUD — list, create, update, delete arcs and relationships |
| `/api/location-resolution` | 3 | Location entity resolution |
| `/api/memoir` | 6 | Memoir generation |
| `/api/memory-engine` | 11 | Extended memory engine operations |
| `/api/memory-graph` | 2 | Memory graph traversal |
| `/api/memory-ladder` | 1 | Memory ladder / hierarchy retrieval |
| `/api/meta` | 4 | Meta-control plane |
| `/api/moods` | 1 | Mood tracking |
| `/api/mrq` | 6 | Memory review queue |
| `/api/naming` | 3 | Entity naming suggestions |
| `/api/narrative-diff` | 4 | Narrative change detection |
| `/api/notebook` | 3 | Personal notebook |
| `/api/paracosm` | 1 | Imaginal world modeling |
| `/api/people-places` | 4 | People and places extraction |
| `/api/perception-reaction-engine` | 5 | Perception-reaction correlation engine |
| `/api/persona` | 4 | Persona construction |
| `/api/personality` | 2 | Personality model construction |
| `/api/perspectives` | 9 | Epistemic perspective management |
| `/api/photos` | 6 | Photo ingestion |
| `/api/prediction` | 5 | Behavioral prediction |
| `/api/predictions` | 4 | Prediction storage and retrieval |
| `/api/quests` | 22 | Quest system |
| `/api/reactions` | 6 | Reaction pattern analysis |
| `/api/recommendations` | 7 | Recommendation engine |
| `/api/reflection` | 2 | Guided reflection system |
| `/api/relationship-dynamics` | 5 | Relationship dynamics analysis |
| `/api/resilience` | 6 | Resilience scoring |
| `/api/resume` | 3 | Resume / profile claim parsing |
| `/api/rpg` | 8 | RPG gamification layer |
| `/api/scenes` | 3 | Scene-level memory extraction |
| `/api/shadow` | 2 | Shadow self engine |
| `/api/social` | 2 | Social network analysis |
| `/api/social-projection` | 2 | Social self-projection modeling |
| `/api/story-of-self` | 1 | Self-narrative construction |
| `/api/strategy` | 12 | Personal strategy training |
| `/api/tasks` | 11 | Task management |
| `/api/temporal-events` | 3 | Temporal event extraction |
| `/api/temporal-relationships` | 5 | Temporal relationship tracking |
| `/api/thoughts` | 4 | Thought classification and response |
| `/api/time` | 7 | Temporal reasoning |
| `/api/timeline-hierarchy` | 13 | Hierarchical timeline view |
| `/api/toxicity` | 4 | Relationship toxicity detection |
| `/api/values` | 5 | Values extraction and tracking |
| `/api/verification` | 6 | Identity verification |
| `/api/voids` | 4 | Void / absence pattern detection |
| `/api/will` | 3 | Intentionality and will tracking |
| `/api/wisdom` | 3 | Wisdom extraction |
| `/api/x` | 1 | X (Twitter) integration |
