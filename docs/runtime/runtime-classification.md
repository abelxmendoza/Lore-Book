# Runtime Classification Map
**Stabilization Phase Alpha — generated 2026-05-26**

## Tiers

| Tier | Loaded by default | Description |
|------|-------------------|-------------|
| `CORE_RUNTIME` | ✅ Always | Required for auth, chat, ingestion, entity extraction, persistence, contradiction governance, retrieval, threads, continuity |
| `EXPERIMENTAL` | ❌ `ENABLE_EXPERIMENTAL_RUNTIME=true` | Domain features under active development |
| `ADMIN` | ❌ `ENABLE_EXPERIMENTAL_RUNTIME=true` | Internal tooling, never exposed to end users |
| `RESEARCH` | ❌ `ENABLE_EXPERIMENTAL_RUNTIME=true` | Exploratory systems, not production-proven |
| `LEGACY` | ❌ `ENABLE_EXPERIMENTAL_RUNTIME=true` | Superseded implementations kept for data migration |
| `UNUSED` | ❌ | Imported but not yet wired / dead code |

---

## CORE_RUNTIME Routes (34)

These routes form the minimum production surface. All must be green for the service to be considered healthy.

### Health & Diagnostics
| Path | Description |
|------|-------------|
| `GET /` | Liveness check — no auth, no DB |
| `GET /api/health` | Railway healthcheck target |
| `GET /api/diagnostics` | Runtime diagnostics |

### Auth / Account
| Path | Description |
|------|-------------|
| `/api/user` | User profile, ToS acceptance, settings |
| `/api/account` | Account management |
| `/api/legal` | Terms of service, privacy policy |
| `/api/onboarding` | User onboarding flow |
| `/api/subscription` | Subscription tier management |
| `/api/billing` | Stripe billing, webhooks |
| `/api/verification` | Identity verification |
| `/api/privacy` | Privacy settings and data controls |

### Ingestion
| Path | Description |
|------|-------------|
| `/api/entries` | Journal entry creation and retrieval |
| `/api/documents` | Document upload and processing |
| `/api/photos` | Photo ingestion |

### Chat
| Path | Description |
|------|-------------|
| `/api/chat` | Primary AI interaction surface |
| `/api/chat/message` | Orchestrated chat message processing |
| `/api/chat-memory` | Per-session chat memory store |

### Threads / Persistence
| Path | Description |
|------|-------------|
| `/api/threads` | Conversation thread persistence and retrieval |
| `/api/omega-memory` | Long-term memory persistence layer |

### Entity Extraction
| Path | Description |
|------|-------------|
| `/api/entities` | Entity extraction and management |
| `/api/entity-resolution` | Entity deduplication and resolution |

### Retrieval
| Path | Description |
|------|-------------|
| `/api/search` | Semantic and keyword search |
| `/api/memory-recall` | Memory retrieval and RAG |
| `/api/memory-graph` | Memory graph traversal |
| `/api/memory-ladder` | Memory ladder / hierarchy retrieval |
| `/api/context` | Context assembly for RAG prompts |
| `/api/insights` | Insight storage and retrieval |
| `/api/mrq` | Memory review queue |

### Continuity
| Path | Description |
|------|-------------|
| `/api/continuity` | Narrative continuity engine |
| `/api/continuity-profile` | User continuity profile |

### Contradiction Governance
| Path | Description |
|------|-------------|
| `/api/corrections` | Factual corrections and truth reconciliation |
| `/api/canon` | Canon status management |
| `/api/contradiction-alerts` | Contradiction detection and alert routing |
| `/api/belief-reconciliation` | Belief-reality gap detection and reconciliation |
| `/api/correction-dashboard` | Correction review dashboard |

### Narrative Core
| Path | Description |
|------|-------------|
| `/api/narrative` | Core narrative structuring |
| `/api/summary` | Entry and period summaries |
| `/api/timeline` | Primary timeline view |
| `/api/perspectives` | Epistemic perspective management |
| `/api/relationships` | Temporal relationship tracking |

---

## EXPERIMENTAL Routes (90+)

Loaded only when `ENABLE_EXPERIMENTAL_RUNTIME=true`. Safe to disable for production core deployment.

### Extended Timeline / Chronology
`/api/timeline-hierarchy`, `/api/chapters`, `/api/chronology`, `/api/evolution`, `/api/life-arc`, `/api/life`

### Memory Engine Extensions
`/api/memory-engine`, `/api/consolidation`, `/api/conversation`

### Entity Extensions
`/api/entity-ambiguity`, `/api/entity-meaning-drift`, `/api/organizations`, `/api/locations`, `/api/location-resolution`, `/api/people-places`

### Knowledge Graph
`/api/graph`, `/api/knowledge-type`

### Temporal
`/api/temporal-events`, `/api/events`, `/api/activities`, `/api/calendar`, `/api/time`

### Domain Cognition
`/api/recommendations`, `/api/wisdom`, `/api/learning`, `/api/prediction`, `/api/predictions`, `/api/relationship-dynamics`, `/api/intervention`, `/api/habits`, `/api/resilience`, `/api/influence`, `/api/growth`, `/api/legacy`, `/api/values`, `/api/dreams`, `/api/emotion`, `/api/financial`, `/api/creative`, `/api/social`, `/api/reflection`, `/api/narrative-diff`, `/api/decisions`, `/api/goals`, `/api/will`, `/api/voids`

### Identity / Psychology
`/api/identity`, `/api/identity-core`, `/api/archetype`, `/api/persona`, `/api/essence`, `/api/story-of-self`, `/api/inner-mythology`, `/api/paracosm`, `/api/alternate-self`, `/api/inner-dialogue`, `/api/shadow`, `/api/cognitive-bias`, `/api/distortions`, `/api/personality`, `/api/thoughts`, `/api/bias-ethics`

### Emotion Intelligence
`/api/emotions`, `/api/emotion-resolution`, `/api/perceptions`, `/api/reactions`, `/api/perception-reaction-engine`, `/api/moods`, `/api/toxicity`, `/api/social-projection`, `/api/behavior`, `/api/conflicts`, `/api/scenes`

### Personal Tools
`/api/journal`, `/api/notebook`, `/api/skills`, `/api/achievements`, `/api/resume`, `/api/tasks`, `/api/quests`, `/api/rpg`, `/api/hqi`, `/api/backward-storytelling`, `/api/memoir`, `/api/biography`, `/api/naming`, `/api/harmonization`, `/api/characters`

### Engine System
`/api/engines`, `/api/engine-registry`, `/api/engine-runtime`, `/api/internal/engine`, `/api/meta`, `/api/strategy`

### External Integrations
`/api/x`, `/api/github`, `/api/integrations`, `/api/external-hub`

---

## ADMIN Routes

| Path | Description |
|------|-------------|
| `/api/admin` | Admin panel |
| `/api/dev` | Development-only tooling |
| `/api/analytics` | Platform analytics |

---

## RESEARCH Routes

| Path | Description |
|------|-------------|
| `/api/orchestrator` | Multi-agent orchestration research |
| `/api/autopilot` | Autonomous operation research |
| `/api/agents` | Agent system research |

---

## LEGACY Routes

| Path | Description | Superseded by |
|------|-------------|---------------|
| `/api/timeline-v2` | Old timeline implementation | `/api/timeline` |

---

## Background Jobs Classification

| Job | Tier | Cron |
|-----|------|------|
| `syncJob` | CORE_RUNTIME | continuous |
| `memoryExtractionWorker` | CORE_RUNTIME | continuous |
| `continuityEngineJob` | CORE_RUNTIME | scheduled |
| `insightGenerationJob` | EXPERIMENTAL | scheduled |
| `graphUpdateJob` | EXPERIMENTAL | scheduled |
| `valueEvolutionJob` | EXPERIMENTAL | scheduled |
| `evolveRelationshipsJob` | EXPERIMENTAL | scheduled |
| `episodicClosureJob` | EXPERIMENTAL | scheduled |
| `personalStrategyTrainingJob` | EXPERIMENTAL | scheduled |
| `engineScheduler` | EXPERIMENTAL | daily 2 AM |

---

## Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| `ENABLE_EXPERIMENTAL_RUNTIME` | `false` | Enables EXPERIMENTAL, ADMIN, RESEARCH, LEGACY routes and jobs |
| `DISABLE_ENGINE_SCHEDULER` | `false` | Disables the daily engine scheduler (only runs if experimental enabled) |
