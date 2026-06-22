// =====================================================
// ROUTE REGISTRY — STABILIZATION PHASE ALPHA
//
// Classification tiers:
//   CORE_RUNTIME   — required for auth/chat/ingestion/entity/threads/continuity/contradiction
//   EXPERIMENTAL   — domain features under active development, safe to disable
//   ADMIN          — internal tooling, never exposed to end users
//   RESEARCH       — exploratory systems, not production-proven
//   LEGACY         — superseded by newer implementation, kept for data migration
//   UNUSED         — imported but not yet wired / dead code
//
// Gate: ENABLE_EXPERIMENTAL_RUNTIME=true loads ALL tiers.
//       Default (false / unset) loads CORE_RUNTIME only.
// =====================================================

import express, { Router } from 'express';

import { externalHubRouter } from '../external/external_hub.router';
import { harmonizationRouter } from '../harmonization/harmonization.router';
import { logger } from '../logger';

import { accountRouter } from './account';
import achievementsRouter from './achievements';
import activitiesRouter from './activities';
import { adminRouter } from './admin';
import { agentsRouter } from './agents';
import { loreAgentsRouter } from './loreAgents';
import { openAiPlatformRouter } from './openaiPlatform';
import alternateSelfRouter from './alternateSelf';
import { analyticsRouter } from './analytics';
import archetypeRouter from './archetype';
import { autopilotRouter } from './autopilot';
import behaviorRouter from './behavior';
import beliefRealityReconciliationRouter from './beliefRealityReconciliation';
import { biographyRouter } from './biography';
import { calendarRouter } from './calendar';
import { canonRouter } from './canon';
import { chaptersRouter } from './chapters';
import { charactersRouter } from './characters';
import { guestRouter } from './guest';
import { chatRouter } from './chat';
import chatMemoryRouter from './chatMemory';
import { chatOrchestrationRouter } from './chatOrchestration';
import chronologyRouter from './chronology';
import conflictsRouter from './conflicts';
import consolidationRouter from './consolidation';
import contextRouter from './context';
import { continuityRouter } from './continuity';
import { correctionsRouter } from './corrections';
import { decisionsRouter } from './decisions';
import { devRouter } from './dev';
import { documentsRouter } from './documents';
import { careerRouter } from './career';
import { profileClaimsRouter } from './profileClaims';
import { entriesRouter } from './entries';
import { evolutionRouter } from './evolution';
import { githubRouter } from './github';
import { hqiRouter } from './hqi';
import wellnessRouter from './wellness';
import { insightsRouter } from './insights';
import { integrationsRouter } from './integrations';
import { legalRouter } from './legal';
import { locationsRouter } from './locations';
import { projectsRouter } from './projects';
import { suggestionsRouter } from './suggestions';
import { entityAuthorityRouter } from './entityAuthority';
import { memoirRouter } from './memoir';
import { moodsRouter } from './moods';
import { memoryGraphRouter } from './memoryGraph';
import { memoryLadderRouter } from './memoryLadder';
import { namingRouter } from './naming';
import { onboardingRouter } from './onboarding';
import { orchestratorRouter } from './orchestrator';
import { peoplePlacesRouter } from './peoplePlaces';
import { personaRouter } from './persona';
import { tasksRouter } from './tasks';
import { temporalRelationshipsRouter } from './temporalRelationships';
import { xRouter } from './x';
import { journalRouter } from './journal';
import perceptionsRouter from './perceptions';
import reactionsRouter from './reactions';
import perceptionReactionEngineRouter from './perceptionReactionEngine';
import skillsRouter from './skills';
import { revealedPreferenceRouter } from './revealedPreference';
import { contradictionsRouter } from './contradictions';
import resumeRouter from './resume';
import { notebookRouter } from './notebook';
import { identityRouter } from './identity';
import { artifactsRouter } from './artifacts';
import timeRouter from './time';
import { privacyRouter } from './privacy';
import { subscriptionRouter } from './subscription';
import { userRouter } from './user';
import { securityRouter } from './security';
import { essenceRouter } from './essence';
import { verificationRouter } from './verification';
import { omegaMemoryRouter } from './omegaMemory';
import { perspectivesRouter } from './perspectives';
import { memoryReviewQueueRouter } from './memoryReviewQueue';
import { predictionsRouter } from './predictions';
import { goalsRouter } from './goals';
import { questRouter } from './quests';
import rpgRouter from './rpg';
import { memoryEngineRouter } from './memoryEngine';
import { backwardStorytellingRouter } from './backwardStorytelling';
import { knowledgeGraphRouter } from './knowledgeGraph';
import { searchRouter } from './search';
import conversationCenteredRouter from './conversationCentered';
import recommendationsRouter from './recommendations';
import wisdomRouter from './wisdom';
import learningRouter from './learning';
import predictionRouter from './prediction';
import narrativeRouter from './narrative';
import relationshipDynamicsRouter from './relationshipDynamics';
import interventionRouter from './intervention';
import habitsRouter from './habits';
import resilienceRouter from './resilience';
import influenceRouter from './influence';
import relationshipsRouter from './relationships';
import growthRouter from './growth';
import legacyRouter from './legacy';
import valuesRouter from './values';
import dreamsRouter from './dreams';
import emotionRouter from './emotion';
import financialRouter from './financial';
import creativeRouter from './creative';
import socialRouter from './social';
import reflectionRouter from './reflection';
import personalityRouter from './personality';
import enginesRouter from './engines';
import engineRegistryRouter from './engineRegistry';
import entitiesRouter from './entities';
import eventsRouter from './events';
import locationResolutionRouter from './locationResolution';
import temporalEventsRouter from './temporalEvents';
import emotionResolutionRouter from './emotionResolution';
import scenesRouter from './scenes';
import toxicityRouter from './toxicity';
import socialProjectionRouter from './socialProjection';
import paracosmRouter from './paracosm';
import innerMythologyRouter from './innerMythology';
import identityCoreRouter from './identityCore';
import storyOfSelfRouter from './storyOfSelf';
import innerDialogueRouter from './innerDialogue';
import cognitiveBiasRouter from './cognitiveBias';
import distortionRouter from './distortion';
import shadowEngineRouter from './shadowEngine';
import emotionalIntelligenceRouter from './emotionalIntelligence';
import engineRuntimeRouter from './engineRuntime';
import { engineHealthRouter } from './engineHealth';
import correctionDashboardRouter from './correctionDashboard';
import entityResolutionRouter from './entityResolution';
import memoryRecallRouter from './memoryRecall';
import organizationsRouter from './organizations';
import familyTreesRouter from './familyTrees';
import familyRouter from './family';
import groupCandidatesRouter from './groupCandidates';
import responseActionsRouter from './responseActions';
import lifeArcRouter from './lifeArc';
import lifeArcRecentRouter from './lifeArcRecent';
import { lifeRouter } from './life';
import { storyRouter } from './story';
import { cognitionRouter } from './cognition';
import { ontologyRouter } from './ontology';
import { lexicalRouter } from './lexical';
import { meaningRouter } from './meaning';
import metaControlRouter from './metaControl';
import entityAmbiguityRouter from './entityAmbiguity';
import entityMeaningDriftRouter from './entityMeaningDrift';
import knowledgeTypeEngineRouter from './knowledgeTypeEngine';
import narrativeDiffRouter from './narrativeDiff';
import continuityProfileRouter from './continuityProfile';
import contradictionAlertsRouter from './contradictionAlerts';
import knowledgeRouter from './knowledge';
import diagnosticsRouter from './diagnostics';
import { inferenceRouter } from './inference';
import { personalStrategyRouter } from './personalStrategy';
import { photosRouter } from './photos';
import { summaryRouter } from './summary';
import { timelineRouter } from './timeline';
import timelineV2Router from './timelineV2';
import { timelineHierarchyRouter } from './timelineHierarchy';
import { threadsRouter } from './threads';
import willRouter from './will';
import { voidRouter } from './voids';
import biasEthicsRouter from './biasEthics';
import thoughtsRouter from './thoughts';
import { countsRouter } from './counts';
import { booksRouter } from './books';
import { memoryNamespaceRouter } from './memoryNamespace';
import { governanceRouter } from './governance';
import { chatThreadsHealthRouter } from './chatThreadsHealth';
import { narrativeThemeThreadsRouter } from './narrativeThemeThreads';
import { trustRouter } from './trust';
import { deprecateRoute } from '../middleware/deprecation';

// ---------------------------------------------------------------------------

export type RouteClassification =
  | 'CORE_RUNTIME'
  | 'EXPERIMENTAL'
  | 'ADMIN'
  | 'RESEARCH'
  | 'LEGACY'
  | 'UNUSED';

export interface RouteEntry {
  path: string;
  router: Router;
  requiresAuth?: boolean;
  classification: RouteClassification;
  description?: string;
}

// ---------------------------------------------------------------------------
// ROUTE REGISTRY
// ---------------------------------------------------------------------------

export const routeRegistry: RouteEntry[] = [
  // ---- HEALTH & DIAGNOSTICS -----------------------------------------------
  {
    path: '/api/wellness',
    router: wellnessRouter,
    classification: 'CORE_RUNTIME',
    description: 'User wellness analytics — symptoms, sleep, energy (not system liveness)',
  },
  {
    path: '/api/diagnostics',
    router: diagnosticsRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Runtime diagnostics',
  },
  {
    path: '/api/inference',
    router: inferenceRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Lore inference orchestrator — sync materialized views across books',
  },
  {
    path: '/api/books',
    router: booksRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Books BFF — aggregate one-call payloads per LoreBook surface',
  },
  {
    path: '/api/trust',
    router: trustRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Trust Center — coverage, confidence, unknowns, conflicts, review queue',
  },
  {
    path: '/api/memory',
    router: memoryNamespaceRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Canonical memory namespace — claims, recall, coverage, graph recovery',
  },
  {
    path: '/api/governance',
    router: governanceRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Canonical governance — contradictions, alerts, belief reconciliation',
  },
  {
    path: '/api/chat-threads',
    router: chatThreadsHealthRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Chat thread durability health and repair (canonical)',
  },
  {
    path: '/api/narrative/theme-threads',
    router: narrativeThemeThreadsRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Saga/arc theme threads — canonical successor to /api/threads',
  },
  {
    path: '/api/counts',
    router: countsRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Entity count summary for sidebar badges',
  },

  // ---- SECURITY -----------------------------------------------------------
  {
    path: '/api/security',
    router: securityRouter,
    classification: 'CORE_RUNTIME',
    description: 'CSRF token endpoint — GET /api/security/csrf-token',
  },

  // ---- AUTH / ACCOUNT -----------------------------------------------------
  {
    path: '/api/user',
    router: userRouter,
    classification: 'CORE_RUNTIME',
    description: 'User profile, ToS acceptance, settings',
  },
  {
    path: '/api/account',
    router: accountRouter,
    classification: 'CORE_RUNTIME',
    description: 'Account management',
  },
  {
    path: '/api/legal',
    router: legalRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Terms of service, privacy policy',
  },
  {
    path: '/api/onboarding',
    router: onboardingRouter,
    classification: 'CORE_RUNTIME',
    description: 'User onboarding flow',
  },
  {
    path: '/api/subscription',
    router: subscriptionRouter,
    classification: 'CORE_RUNTIME',
    description: 'Subscription tier management',
  },
  {
    path: '/api/verification',
    router: verificationRouter,
    classification: 'EXPERIMENTAL',
    description: 'Identity verification',
  },
  {
    path: '/api/privacy',
    router: privacyRouter,
    classification: 'CORE_RUNTIME',
    description: 'Privacy settings and data controls',
  },

  // ---- INGESTION ----------------------------------------------------------
  {
    path: '/api/entries',
    router: entriesRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Journal entry creation and retrieval',
  },
  {
    path: '/api/documents',
    router: documentsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Document upload and processing',
  },
  {
    path: '/api/career',
    router: careerRouter,
    classification: 'CORE_RUNTIME',
    description: 'Career summary read model (resume, jobs, skills, timeline)',
  },
  {
    path: '/api/profile-claims',
    router: profileClaimsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Profile claims inbox — confirm or reject resume/chat claims',
  },
  {
    path: '/api/photos',
    router: photosRouter,
    classification: 'CORE_RUNTIME',
    description: 'Photo ingestion',
  },

  // ---- CHAT ---------------------------------------------------------------
  {
    path: '/api/guest',
    router: guestRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Guest preview chat — stateless, no DB writes',
  },
  {
    path: '/api/chat',
    router: chatRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Chat interface — primary AI interaction',
  },
  {
    path: '/api/chat/message',
    router: chatOrchestrationRouter,
    classification: 'CORE_RUNTIME',
    description: 'Orchestrated chat message processing',
  },
  {
    path: '/api/chat-memory',
    router: chatMemoryRouter,
    classification: 'CORE_RUNTIME',
    description: 'Per-session chat memory store',
  },

  // ---- THREADS / PERSISTENCE ----------------------------------------------
  {
    path: '/api/threads',
    router: threadsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Conversation thread persistence and retrieval',
  },
  {
    path: '/api/omega-memory',
    router: omegaMemoryRouter,
    classification: 'CORE_RUNTIME',
    description: 'Long-term memory persistence layer',
  },

  // ---- ENTITY EXTRACTION --------------------------------------------------
  {
    path: '/api/entities',
    router: entitiesRouter,
    classification: 'CORE_RUNTIME',
    description: 'Entity extraction and management',
  },
  {
    path: '/api/entity-resolution',
    router: entityResolutionRouter,
    classification: 'CORE_RUNTIME',
    description: 'Entity deduplication and resolution',
  },

  // ---- RETRIEVAL ----------------------------------------------------------
  {
    path: '/api/search',
    router: searchRouter,
    classification: 'CORE_RUNTIME',
    description: 'Semantic and keyword search',
  },
  {
    path: '/api/memory-recall',
    router: memoryRecallRouter,
    classification: 'CORE_RUNTIME',
    description: 'Memory retrieval and RAG',
  },
  {
    path: '/api/memory-graph',
    router: memoryGraphRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'Memory graph traversal',
  },
  {
    path: '/api/memory-ladder',
    router: memoryLadderRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'Memory ladder / hierarchy retrieval',
  },
  {
    path: '/api/context',
    router: contextRouter,
    classification: 'CORE_RUNTIME',
    description: 'Context assembly for RAG prompts',
  },
  {
    path: '/api/insights',
    router: insightsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Insight storage and retrieval',
  },
  {
    path: '/api/mrq',
    router: memoryReviewQueueRouter,
    classification: 'CORE_RUNTIME',
    description: 'Memory review queue — Discovery Hub memory review panel',
  },

  // ---- CONTINUITY ---------------------------------------------------------
  {
    path: '/api/continuity',
    router: continuityRouter,
    classification: 'CORE_RUNTIME',
    description: 'Narrative continuity engine',
  },
  {
    path: '/api/continuity-profile',
    router: continuityProfileRouter,
    classification: 'EXPERIMENTAL',
    description: 'User continuity profile',
  },

  // ---- CONTRADICTION GOVERNANCE -------------------------------------------
  {
    path: '/api/corrections',
    router: correctionsRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Factual corrections and truth reconciliation',
  },
  {
    path: '/api/canon',
    router: canonRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Canon status management',
  },
  {
    path: '/api/contradiction-alerts',
    router: contradictionAlertsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Contradiction detection and alert routing',
  },
  {
    path: '/api/belief-reconciliation',
    router: beliefRealityReconciliationRouter,
    classification: 'EXPERIMENTAL',
    description: 'Belief-reality gap detection and reconciliation',
  },
  {
    path: '/api/correction-dashboard',
    router: correctionDashboardRouter,
    classification: 'ADMIN',
    description: 'Correction review dashboard',
  },
  {
    path: '/api/lore-agents',
    router: loreAgentsRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'System Cognition / Agent Layer — read-only agent run traces ("How LoreBook Understood This")',
  },

  // ---- NARRATIVE CORE -----------------------------------------------------
  {
    path: '/api/narrative',
    router: narrativeRouter,
    classification: 'CORE_RUNTIME',
    description: 'Core narrative structuring',
  },
  {
    path: '/api/summary',
    router: summaryRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Entry and period summaries',
  },
  {
    path: '/api/timeline',
    router: timelineRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Primary timeline view',
  },
  {
    path: '/api/timeline-v2',
    router: timelineV2Router,
    classification: 'CORE_RUNTIME',
    description: 'Timeline v2 — full CRUD, used by TimelineV2 components',
  },
  {
    path: '/api/perspectives',
    router: perspectivesRouter,
    classification: 'EXPERIMENTAL',
    description: 'Epistemic perspective management',
  },
  {
    path: '/api/temporal-relationships',
    router: temporalRelationshipsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Temporal relationship tracking',
  },

  // =========================================================================
  // EXPERIMENTAL — loaded only when ENABLE_EXPERIMENTAL_RUNTIME=true
  // =========================================================================

  // ---- EXTENDED TIMELINE / CHRONOLOGY ------------------------------------
  {
    path: '/api/timeline-hierarchy',
    router: timelineHierarchyRouter,
    classification: 'CORE_RUNTIME',
    description: 'Hierarchical timeline view',
  },
  {
    path: '/api/chapters',
    router: chaptersRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Chapter-based narrative organization',
  },
  {
    path: '/api/chronology',
    router: chronologyRouter,
    classification: 'CORE_RUNTIME',
    description: 'Chronological event ordering — used by timeline UI',
  },
  {
    path: '/api/evolution',
    router: evolutionRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Personal evolution tracking',
  },
  {
    path: '/api/life-arcs',
    router: lifeArcRouter,
    classification: 'CORE_RUNTIME',
    description: 'Life arc CRUD — list, create, update, delete arcs and relationships',
  },
  {
    path: '/api/life-arc',
    router: lifeArcRecentRouter,
    classification: 'CORE_RUNTIME',
    description: 'Recent life narrative — significant events, patterns, and summary',
  },
  {
    path: '/api/life',
    router: lifeRouter,
    classification: 'EXPERIMENTAL',
    description: 'Holistic life view',
  },
  {
    path: '/api/story',
    router: storyRouter,
    classification: 'CORE_RUNTIME',
    description: 'Narrative IR — chapters, arcs, turning points, story surfaces',
  },
  {
    path: '/api/cognition',
    router: cognitionRouter,
    classification: 'CORE_RUNTIME',
    description: 'Cognition graph — nodes, edges, epistemic state, salience, life history',
  },
  {
    path: '/api/ontology',
    router: ontologyRouter,
    classification: 'ADMIN',
    description: 'Ontology hierarchy explorer and analytics',
  },
  {
    path: '/api/lexical',
    router: lexicalRouter,
    classification: 'CORE_RUNTIME',
    description: 'Lexical analyzer — pre-ontology signal extraction for LoreBook',
  },
  {
    path: '/api/meaning',
    router: meaningRouter,
    classification: 'CORE_RUNTIME',
    description: 'Meaning resolution — ambiguity, references, collisions before action planning',
  },

  // ---- MEMORY ENGINE EXTENSIONS -------------------------------------------
  {
    path: '/api/memory-engine',
    router: memoryEngineRouter,
    classification: 'EXPERIMENTAL',
    description: 'Extended memory engine operations',
  },
  {
    path: '/api/consolidation',
    router: consolidationRouter,
    classification: 'EXPERIMENTAL',
    description: 'Memory consolidation pipeline',
  },
  {
    path: '/api/conversation',
    router: conversationCenteredRouter,
    classification: 'CORE_RUNTIME',
    description: 'Chat thread CRUD — create, load, save, delete conversation threads',
  },

  // ---- ENTITY EXTENSIONS --------------------------------------------------
  {
    path: '/api/entity-ambiguity',
    router: entityAmbiguityRouter,
    classification: 'CORE_RUNTIME',
    description: 'Entity ambiguity detection and resolution',
  },
  {
    path: '/api/entity-meaning-drift',
    router: entityMeaningDriftRouter,
    classification: 'EXPERIMENTAL',
    description: 'Semantic drift detection for entities',
  },
  {
    path: '/api/organizations',
    router: organizationsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Organization and group entity management',
  },
  {
    path: '/api/family-trees',
    router: familyTreesRouter,
    classification: 'CORE_RUNTIME',
    description: 'Family trees and character group affiliations',
  },
  {
    path: '/api/family',
    router: familyRouter,
    classification: 'CORE_RUNTIME',
    description: 'Family graph, households, and relationship analytics',
  },
  {
    path: '/api/group-candidates',
    router: groupCandidatesRouter,
    classification: 'CORE_RUNTIME',
    description: 'Group candidate review queue — detected groups awaiting user confirmation',
  },
  {
    path: '/api/response-actions',
    router: responseActionsRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Apply Response Compiler action chips (user-confirmed) — e.g. create a group',
  },
  {
    path: '/api/locations',
    router: locationsRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Location entity management — used in lorebook, character profiles, entity detail',
  },
  {
    path: '/api/projects',
    router: projectsRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Projects Book — canonical project entities (mirrors locations authority)',
  },
  {
    path: '/api/suggestions',
    router: suggestionsRouter,
    requiresAuth: true,
    classification: 'CORE_RUNTIME',
    description: 'Cross-book suggestion dismissals — thread-scoped hides and permanent suppression',
  },
  {
    path: '/api/entity-authority',
    router: entityAuthorityRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Entity authority — confirm/dismiss merge/link/parent-child decisions (one canonical entity)',
  },
  {
    path: '/api/location-resolution',
    router: locationResolutionRouter,
    classification: 'EXPERIMENTAL',
    description: 'Location entity resolution',
  },
  {
    path: '/api/people-places',
    router: peoplePlacesRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'People and places extraction',
  },

  // ---- KNOWLEDGE CRYSTALLIZATION ------------------------------------------
  {
    path: '/api/knowledge',
    router: knowledgeRouter,
    classification: 'CORE_RUNTIME',
    description: 'Knowledge crystallization — durable claims with evidence traceability',
  },

  // ---- KNOWLEDGE GRAPH ----------------------------------------------------
  {
    path: '/api/graph',
    router: knowledgeGraphRouter,
    classification: 'EXPERIMENTAL',
    description: 'Knowledge graph construction',
  },
  {
    path: '/api/knowledge-type',
    router: knowledgeTypeEngineRouter,
    classification: 'EXPERIMENTAL',
    description: 'Knowledge type classification engine',
  },

  // ---- TEMPORAL -----------------------------------------------------------
  {
    path: '/api/temporal-events',
    router: temporalEventsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Temporal event extraction',
  },
  {
    path: '/api/events',
    router: eventsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Event extraction and storage',
  },
  {
    path: '/api/activities',
    router: activitiesRouter,
    classification: 'EXPERIMENTAL',
    description: 'Activity tracking',
  },
  {
    path: '/api/calendar',
    router: calendarRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'Calendar integration',
  },
  {
    path: '/api/time',
    router: timeRouter,
    classification: 'EXPERIMENTAL',
    description: 'Temporal reasoning',
  },

  // ---- DOMAIN COGNITION ---------------------------------------------------
  {
    path: '/api/recommendations',
    router: recommendationsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Recommendation engine',
  },
  {
    path: '/api/wisdom',
    router: wisdomRouter,
    classification: 'EXPERIMENTAL',
    description: 'Wisdom extraction',
  },
  {
    path: '/api/learning',
    router: learningRouter,
    classification: 'EXPERIMENTAL',
    description: 'Learning pattern detection',
  },
  {
    path: '/api/prediction',
    router: predictionRouter,
    classification: 'EXPERIMENTAL',
    description: 'Behavioral prediction',
  },
  {
    path: '/api/predictions',
    router: predictionsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Prediction storage and retrieval',
  },
  {
    path: '/api/relationship-dynamics',
    router: relationshipDynamicsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Relationship dynamics analysis',
  },
  {
    path: '/api/intervention',
    router: interventionRouter,
    classification: 'EXPERIMENTAL',
    description: 'Intervention recommendation system',
  },
  {
    path: '/api/habits',
    router: habitsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Habit detection and tracking — Discovery Hub values & habits panel',
  },
  {
    path: '/api/resilience',
    router: resilienceRouter,
    classification: 'EXPERIMENTAL',
    description: 'Resilience scoring',
  },
  {
    path: '/api/influence',
    router: influenceRouter,
    classification: 'EXPERIMENTAL',
    description: 'Influence network analysis',
  },
  {
    path: '/api/relationships',
    router: relationshipsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Relationship role inference — infers social hierarchy from natural language',
  },
  {
    path: '/api/growth',
    router: growthRouter,
    classification: 'EXPERIMENTAL',
    description: 'Growth pattern extraction',
  },
  {
    path: '/api/legacy',
    router: legacyRouter,
    classification: 'EXPERIMENTAL',
    description: 'Legacy narrative construction',
  },
  {
    path: '/api/values',
    router: valuesRouter,
    classification: 'CORE_RUNTIME',
    description: 'Values extraction and tracking — Discovery Hub values & habits panel',
  },
  {
    path: '/api/dreams',
    router: dreamsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Dream journaling and analysis',
  },
  {
    path: '/api/emotion',
    router: emotionRouter,
    classification: 'EXPERIMENTAL',
    description: 'Emotion extraction',
  },
  {
    path: '/api/financial',
    router: financialRouter,
    classification: 'EXPERIMENTAL',
    description: 'Financial pattern analysis',
  },
  {
    path: '/api/creative',
    router: creativeRouter,
    classification: 'EXPERIMENTAL',
    description: 'Creative expression tracking',
  },
  {
    path: '/api/social',
    router: socialRouter,
    classification: 'EXPERIMENTAL',
    description: 'Social network analysis',
  },
  {
    path: '/api/reflection',
    router: reflectionRouter,
    classification: 'EXPERIMENTAL',
    description: 'Guided reflection system',
  },
  {
    path: '/api/narrative-diff',
    router: narrativeDiffRouter,
    classification: 'EXPERIMENTAL',
    description: 'Narrative change detection',
  },
  {
    path: '/api/decisions',
    router: decisionsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Decision tracking and analysis — Discovery Hub decision memory panel',
  },
  {
    path: '/api/goals',
    router: goalsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Goal tracking',
  },
  {
    path: '/api/will',
    router: willRouter,
    classification: 'EXPERIMENTAL',
    description: 'Intentionality and will tracking',
  },
  {
    path: '/api/voids',
    router: voidRouter,
    classification: 'CORE_RUNTIME',
    description: 'Void / absence pattern detection',
  },

  // ---- IDENTITY / PSYCHOLOGY ----------------------------------------------
  {
    path: '/api/identity',
    router: identityRouter,
    classification: 'CORE_RUNTIME',
    description: 'Identity model — pulse, what-ai-knows, revisions',
  },
  {
    path: '/api/artifacts',
    router: artifactsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Unified artifact index — list, get, provenance',
  },
  {
    path: '/api/identity-core',
    router: identityCoreRouter,
    classification: 'EXPERIMENTAL',
    description: 'Core identity engine',
  },
  {
    path: '/api/archetype',
    router: archetypeRouter,
    classification: 'EXPERIMENTAL',
    description: 'Archetypal pattern recognition',
  },
  {
    path: '/api/persona',
    router: personaRouter,
    classification: 'EXPERIMENTAL',
    description: 'Persona construction',
  },
  {
    path: '/api/essence',
    router: essenceRouter,
    classification: 'CORE_RUNTIME',
    description: 'Essence refinement — Discovery Hub soul profile panel',
  },
  {
    path: '/api/story-of-self',
    router: storyOfSelfRouter,
    classification: 'EXPERIMENTAL',
    description: 'Self-narrative construction',
  },
  {
    path: '/api/inner-mythology',
    router: innerMythologyRouter,
    classification: 'EXPERIMENTAL',
    description: 'Personal mythology engine',
  },
  {
    path: '/api/paracosm',
    router: paracosmRouter,
    classification: 'EXPERIMENTAL',
    description: 'Imaginal world modeling',
  },
  {
    path: '/api/alternate-self',
    router: alternateSelfRouter,
    classification: 'EXPERIMENTAL',
    description: 'Alternate self modeling',
  },
  {
    path: '/api/inner-dialogue',
    router: innerDialogueRouter,
    classification: 'EXPERIMENTAL',
    description: 'Internal dialogue extraction',
  },
  {
    path: '/api/shadow',
    router: shadowEngineRouter,
    classification: 'EXPERIMENTAL',
    description: 'Shadow self engine',
  },
  {
    path: '/api/cognitive-bias',
    router: cognitiveBiasRouter,
    classification: 'EXPERIMENTAL',
    description: 'Cognitive bias detection',
  },
  {
    path: '/api/distortions',
    router: distortionRouter,
    classification: 'EXPERIMENTAL',
    description: 'Cognitive distortion analysis',
  },
  {
    path: '/api/personality',
    router: personalityRouter,
    classification: 'EXPERIMENTAL',
    description: 'Personality model construction',
  },
  {
    path: '/api/thoughts',
    router: thoughtsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Thought classification and response',
  },
  {
    path: '/api/bias-ethics',
    router: biasEthicsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Bias detection and ethics review',
  },

  // ---- EMOTION INTELLIGENCE -----------------------------------------------
  {
    path: '/api/emotions',
    router: emotionalIntelligenceRouter,
    classification: 'EXPERIMENTAL',
    description: 'Emotional intelligence analysis',
  },
  {
    path: '/api/emotion-resolution',
    router: emotionResolutionRouter,
    classification: 'EXPERIMENTAL',
    description: 'Emotion resolution pathways',
  },
  {
    path: '/api/perceptions',
    router: perceptionsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Perception tracking — character intelligence layer',
  },
  {
    path: '/api/reactions',
    router: reactionsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Reaction pattern analysis — Discovery Hub reactions panel',
  },
  {
    path: '/api/perception-reaction-engine',
    router: perceptionReactionEngineRouter,
    classification: 'CORE_RUNTIME',
    description: 'Perception-reaction correlation engine — Discovery Hub reactions panel',
  },
  {
    path: '/api/moods',
    router: moodsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Mood tracking',
  },
  {
    path: '/api/toxicity',
    router: toxicityRouter,
    classification: 'EXPERIMENTAL',
    description: 'Relationship toxicity detection',
  },
  {
    path: '/api/social-projection',
    router: socialProjectionRouter,
    classification: 'EXPERIMENTAL',
    description: 'Social self-projection modeling',
  },
  {
    path: '/api/behavior',
    router: behaviorRouter,
    classification: 'EXPERIMENTAL',
    description: 'Behavior pattern detection',
  },
  {
    path: '/api/conflicts',
    router: conflictsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Conflict tracking',
  },
  {
    path: '/api/scenes',
    router: scenesRouter,
    classification: 'EXPERIMENTAL',
    description: 'Scene-level memory extraction',
  },

  // ---- PERSONAL TOOLS -----------------------------------------------------
  {
    path: '/api/journal',
    router: journalRouter,
    classification: 'EXPERIMENTAL',
    description: 'Structured journal entries',
  },
  {
    path: '/api/notebook',
    router: notebookRouter,
    classification: 'EXPERIMENTAL',
    description: 'Personal notebook',
  },
  {
    path: '/api/skills',
    router: skillsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Skill tracking, suggestions, and skill profile intelligence',
  },
  {
    path: '/api/revealed-self',
    router: revealedPreferenceRouter,
    classification: 'CORE_RUNTIME',
    description: 'Revealed Preference Engine: stated-vs-revealed priorities from real episodes',
  },
  {
    path: '/api/contradictions',
    router: contradictionsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Contradiction Engine: proven divergences between stated identity and revealed behavior',
  },
  {
    path: '/api/achievements',
    router: achievementsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Achievement system — Discovery Hub achievements panel',
  },
  {
    path: '/api/resume',
    router: resumeRouter,
    classification: 'CORE_RUNTIME',
    description: 'Resume upload, parse, and lore population',
  },
  {
    path: '/api/tasks',
    router: tasksRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'Task management',
  },
  {
    path: '/api/quests',
    router: questRouter,
    classification: 'CORE_RUNTIME',
    description: 'Quest system',
  },
  {
    path: '/api/rpg',
    router: rpgRouter,
    classification: 'EXPERIMENTAL',
    description: 'RPG gamification layer',
  },
  {
    path: '/api/hqi',
    router: hqiRouter,
    classification: 'EXPERIMENTAL',
    description: 'Human Quality Index',
  },
  {
    path: '/api/backward-storytelling',
    router: backwardStorytellingRouter,
    classification: 'EXPERIMENTAL',
    description: 'Backward storytelling reconstruction',
  },
  {
    path: '/api/memoir',
    router: memoirRouter,
    classification: 'EXPERIMENTAL',
    description: 'Memoir generation',
  },
  {
    path: '/api/biography',
    router: biographyRouter,
    classification: 'CORE_RUNTIME',
    description: 'Automated biography generation',
  },
  {
    path: '/api/naming',
    router: namingRouter,
    classification: 'EXPERIMENTAL',
    description: 'Entity naming suggestions',
  },
  {
    path: '/api/harmonization',
    router: harmonizationRouter,
    classification: 'EXPERIMENTAL',
    description: 'Data harmonization layer',
  },
  {
    path: '/api/characters',
    router: charactersRouter,
    classification: 'CORE_RUNTIME',
    description: 'Character / people management',
  },

  // ---- ENGINE SYSTEM ------------------------------------------------------
  {
    path: '/api/engines',
    router: enginesRouter,
    classification: 'EXPERIMENTAL',
    description: 'Engine management',
  },
  {
    path: '/api/engine-registry',
    router: engineRegistryRouter,
    classification: 'EXPERIMENTAL',
    description: 'Engine registry',
  },
  {
    path: '/api/engine-runtime',
    router: engineRuntimeRouter,
    classification: 'EXPERIMENTAL',
    description: 'Engine runtime execution',
  },
  {
    path: '/api/internal/engine',
    router: engineHealthRouter,
    classification: 'EXPERIMENTAL',
    description: 'Engine health monitoring',
  },
  {
    path: '/api/meta',
    router: metaControlRouter,
    classification: 'EXPERIMENTAL',
    description: 'Meta-control plane',
  },
  {
    path: '/api/strategy',
    router: personalStrategyRouter,
    classification: 'EXPERIMENTAL',
    description: 'Personal strategy training',
  },

  // ---- ADMIN (production-facing; protected by requireAdmin on the router) --
  {
    path: '/api/admin',
    router: adminRouter,
    classification: 'CORE_RUNTIME',
    description: 'Admin panel — metrics, users, finance, system tools',
  },
  {
    path: '/api/openai-platform',
    router: openAiPlatformRouter,
    requiresAuth: true,
    classification: 'ADMIN',
    description: 'Opt-in OpenAI platform features — chaining, background, vector stores',
  },
  {
    path: '/api/dev',
    router: devRouter,
    classification: 'ADMIN',
    description: 'Development-only tooling',
  },
  {
    path: '/api/analytics',
    router: analyticsRouter,
    classification: 'CORE_RUNTIME',
    description: 'Discovery Hub analytics — identity, relationships, shadow, XP, and more',
  },

  // ---- RESEARCH -----------------------------------------------------------
  {
    path: '/api/orchestrator',
    router: orchestratorRouter,
    classification: 'RESEARCH',
    description: 'Multi-agent orchestration research',
  },
  {
    path: '/api/autopilot',
    router: autopilotRouter,
    classification: 'RESEARCH',
    description: 'Autonomous operation research',
  },
  {
    path: '/api/agents',
    router: agentsRouter,
    classification: 'RESEARCH',
    description: 'Agent system research',
  },

  // ---- EXTERNAL INTEGRATIONS ----------------------------------------------
  {
    path: '/api/x',
    router: xRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'X (Twitter) integration',
  },
  {
    path: '/api/github',
    router: githubRouter,
    classification: 'EXPERIMENTAL',
    description: 'GitHub integration',
  },
  {
    path: '/api/integrations',
    router: integrationsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Third-party integrations hub',
  },
  {
    path: '/api/external-hub',
    router: externalHubRouter,
    classification: 'EXPERIMENTAL',
    description: 'External data ingestion hub',
  },

];

// ---------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------

export function validateRouteRegistry(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenPaths = new Set<string>();

  for (const entry of routeRegistry) {
    if (seenPaths.has(entry.path)) {
      errors.push(`Duplicate route path: ${entry.path}`);
    }
    seenPaths.add(entry.path);

    if (!entry.router) {
      errors.push(`Missing router for path: ${entry.path}`);
    }

    if (entry.router && typeof entry.router !== 'function' && typeof (entry.router as { use?: unknown }).use !== 'function') {
      errors.push(`Invalid router type for path: ${entry.path}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// REGISTRATION
// ---------------------------------------------------------------------------

const EXPERIMENTAL_TIERS: RouteClassification[] = [
  'EXPERIMENTAL',
  'ADMIN',
  'RESEARCH',
  'LEGACY',
  'UNUSED',
];

/**
 * Register all routes with the Express app.
 *
 * When ENABLE_EXPERIMENTAL_RUNTIME is not "true", only CORE_RUNTIME routes
 * are mounted. This shrinks the compile-time surface that affects Railway
 * cold-start and reduces runtime attack surface.
 */
export function registerRoutes(
  publicRoutesApp: express.Application,
  protectedRoutesApp: express.Router
): void {
  const validation = validateRouteRegistry();
  if (!validation.valid) {
    logger.error({ errors: validation.errors }, 'Route registry validation failed');
    throw new Error(`Route registry validation failed: ${validation.errors.join(', ')}`);
  }

  const experimentalEnabled = process.env.ENABLE_EXPERIMENTAL_RUNTIME === 'true';

  const seenPaths = new Set<string>();
  let publicCount = 0;
  let protectedCount = 0;
  let skippedCount = 0;

  for (const entry of routeRegistry) {
    if (!experimentalEnabled && EXPERIMENTAL_TIERS.includes(entry.classification)) {
      skippedCount++;
      logger.debug(`Skipping ${entry.classification} route: ${entry.path}`);
      continue;
    }

    if (seenPaths.has(entry.path)) {
      logger.error(`Duplicate route detected at runtime: ${entry.path}`);
      throw new Error(`Duplicate route registration detected: ${entry.path}`);
    }
    seenPaths.add(entry.path);

    if (entry.requiresAuth === false) {
      publicRoutesApp.use(entry.path, deprecateRoute(entry.path), entry.router);
      publicCount++;
      logger.debug(`Registered public route: ${entry.path}`);
    } else {
      const mountPath = entry.path.startsWith('/api')
        ? entry.path.slice(4) || '/'
        : entry.path;
      protectedRoutesApp.use(mountPath, deprecateRoute(entry.path), entry.router);
      protectedCount++;
      logger.debug(`Registered protected route: ${entry.path} -> ${mountPath}`);
    }
  }

  const skippedPaths = routeRegistry
    .filter((e) => !experimentalEnabled && EXPERIMENTAL_TIERS.includes(e.classification))
    .map((e) => e.path);

  logger.info(
    `Routes registered: ${publicCount} public, ${protectedCount} protected` +
    (skippedCount > 0 ? `, ${skippedCount} skipped (ENABLE_EXPERIMENTAL_RUNTIME=false)` : '')
  );

  if (skippedCount > 0) {
    logger.info(
      { skippedPaths },
      'Disabled routes (set ENABLE_EXPERIMENTAL_RUNTIME=true to activate)'
    );
  }

  // Log every registered CORE_RUNTIME path at info level for Railway startup verification
  logger.info(
    {
      core: routeRegistry
        .filter((e) => e.classification === 'CORE_RUNTIME')
        .map((e) => e.path),
    },
    'CORE_RUNTIME routes active'
  );
}

/** Returns all route paths that are disabled in the current runtime (EXPERIMENTAL not enabled). */
export function getDisabledRoutePaths(): string[] {
  const experimentalEnabled = process.env.ENABLE_EXPERIMENTAL_RUNTIME === 'true';
  if (experimentalEnabled) return [];
  return routeRegistry
    .filter((e) => EXPERIMENTAL_TIERS.includes(e.classification))
    .map((e) => e.path);
}

/** Returns a summary of all routes for the /api/runtime/routes endpoint. */
export function getRegisteredRoutes(): Array<{
  path: string;
  classification: RouteClassification;
  description: string;
  active: boolean;
  requiresAuth: boolean;
}> {
  const experimentalEnabled = process.env.ENABLE_EXPERIMENTAL_RUNTIME === 'true';
  return routeRegistry.map((e) => ({
    path: e.path,
    classification: e.classification,
    description: e.description ?? '',
    active: experimentalEnabled || e.classification === 'CORE_RUNTIME',
    requiresAuth: e.requiresAuth !== false,
  }));
}

// Development-time duplicate check
if (process.env.NODE_ENV === 'development') {
  const validation = validateRouteRegistry();
  if (!validation.valid) {
    console.error('❌ Route registry validation failed at module load:');
    validation.errors.forEach((e) => console.error(`  - ${e}`));
    console.warn('⚠️  Server will continue, but routes may not work correctly');
  } else {
    console.log(`✅ Route registry validated: ${routeRegistry.length} routes registered`);
  }
}
