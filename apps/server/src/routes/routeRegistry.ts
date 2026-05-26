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

import { billingRouter } from '../billing/billingRouter';
import { externalHubRouter } from '../external/external_hub.router';
import { harmonizationRouter } from '../harmonization/harmonization.router';
import { logger } from '../logger';

import { accountRouter } from './account';
import achievementsRouter from './achievements';
import activitiesRouter from './activities';
import { adminRouter } from './admin';
import { agentsRouter } from './agents';
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
import { entriesRouter } from './entries';
import { evolutionRouter } from './evolution';
import { githubRouter } from './github';
import { hqiRouter } from './hqi';
import healthRouter from './health';
import { insightsRouter } from './insights';
import { integrationsRouter } from './integrations';
import { legalRouter } from './legal';
import { locationsRouter } from './locations';
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
import resumeRouter from './resume';
import { notebookRouter } from './notebook';
import { identityRouter } from './identity';
import timeRouter from './time';
import { privacyRouter } from './privacy';
import { subscriptionRouter } from './subscription';
import { userRouter } from './user';
import { securityRouter } from './security';
import { essenceRouter } from './essence';
import { verificationRouter } from './verification';
import timelineV2Router from './timelineV2';
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
import lifeArcRouter from './lifeArc';
import { lifeRouter } from './life';
import metaControlRouter from './metaControl';
import entityAmbiguityRouter from './entityAmbiguity';
import entityMeaningDriftRouter from './entityMeaningDrift';
import knowledgeTypeEngineRouter from './knowledgeTypeEngine';
import narrativeDiffRouter from './narrativeDiff';
import continuityProfileRouter from './continuityProfile';
import contradictionAlertsRouter from './contradictionAlerts';
import diagnosticsRouter from './diagnostics';
import { personalStrategyRouter } from './personalStrategy';
import { photosRouter } from './photos';
import { summaryRouter } from './summary';
import { timelineRouter } from './timeline';
import { timelineHierarchyRouter } from './timelineHierarchy';
import { threadsRouter } from './threads';
import willRouter from './will';
import { voidRouter } from './voids';
import biasEthicsRouter from './biasEthics';
import thoughtsRouter from './thoughts';

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
    path: '/',
    router: healthRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Liveness check — no auth, no DB',
  },
  {
    path: '/api/health',
    router: healthRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Health check (Railway healthcheck target)',
  },
  {
    path: '/api/diagnostics',
    router: diagnosticsRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Runtime diagnostics',
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
    requiresAuth: false,
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
    path: '/api/billing',
    router: billingRouter,
    requiresAuth: false,
    classification: 'CORE_RUNTIME',
    description: 'Stripe billing, webhooks',
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
    classification: 'EXPERIMENTAL',
    description: 'Document upload and processing',
  },
  {
    path: '/api/photos',
    router: photosRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'Photo ingestion',
  },

  // ---- CHAT ---------------------------------------------------------------
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
    classification: 'EXPERIMENTAL',
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
    classification: 'EXPERIMENTAL',
    description: 'Insight storage and retrieval',
  },
  {
    path: '/api/mrq',
    router: memoryReviewQueueRouter,
    classification: 'EXPERIMENTAL',
    description: 'Memory review queue',
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
    path: '/api/perspectives',
    router: perspectivesRouter,
    classification: 'EXPERIMENTAL',
    description: 'Epistemic perspective management',
  },
  {
    path: '/api/relationships',
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
    classification: 'EXPERIMENTAL',
    description: 'Hierarchical timeline view',
  },
  {
    path: '/api/chapters',
    router: chaptersRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'Chapter-based narrative organization',
  },
  {
    path: '/api/chronology',
    router: chronologyRouter,
    classification: 'EXPERIMENTAL',
    description: 'Chronological event ordering',
  },
  {
    path: '/api/evolution',
    router: evolutionRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'Personal evolution tracking',
  },
  {
    path: '/api/life-arc',
    router: lifeArcRouter,
    classification: 'EXPERIMENTAL',
    description: 'Life arc narrative engine',
  },
  {
    path: '/api/life',
    router: lifeRouter,
    classification: 'EXPERIMENTAL',
    description: 'Holistic life view',
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
    classification: 'EXPERIMENTAL',
    description: 'Conversation-centered extraction system',
  },

  // ---- ENTITY EXTENSIONS --------------------------------------------------
  {
    path: '/api/entity-ambiguity',
    router: entityAmbiguityRouter,
    classification: 'EXPERIMENTAL',
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
    classification: 'EXPERIMENTAL',
    description: 'Organization entity management',
  },
  {
    path: '/api/locations',
    router: locationsRouter,
    requiresAuth: false,
    classification: 'EXPERIMENTAL',
    description: 'Location entity management',
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
    classification: 'EXPERIMENTAL',
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
    classification: 'EXPERIMENTAL',
    description: 'Habit detection and tracking',
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
    classification: 'EXPERIMENTAL',
    description: 'Values extraction and tracking',
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
    classification: 'EXPERIMENTAL',
    description: 'Decision tracking and analysis',
  },
  {
    path: '/api/goals',
    router: goalsRouter,
    classification: 'EXPERIMENTAL',
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
    classification: 'EXPERIMENTAL',
    description: 'Void / absence pattern detection',
  },

  // ---- IDENTITY / PSYCHOLOGY ----------------------------------------------
  {
    path: '/api/identity',
    router: identityRouter,
    classification: 'EXPERIMENTAL',
    description: 'Identity model management',
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
    classification: 'EXPERIMENTAL',
    description: 'Essence refinement',
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
    classification: 'EXPERIMENTAL',
    description: 'Perception tracking',
  },
  {
    path: '/api/reactions',
    router: reactionsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Reaction pattern analysis',
  },
  {
    path: '/api/perception-reaction-engine',
    router: perceptionReactionEngineRouter,
    classification: 'EXPERIMENTAL',
    description: 'Perception-reaction correlation engine',
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
    classification: 'EXPERIMENTAL',
    description: 'Skill tracking',
  },
  {
    path: '/api/achievements',
    router: achievementsRouter,
    classification: 'EXPERIMENTAL',
    description: 'Achievement system',
  },
  {
    path: '/api/resume',
    router: resumeRouter,
    classification: 'EXPERIMENTAL',
    description: 'Resume / profile claim parsing',
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
    classification: 'EXPERIMENTAL',
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
    classification: 'EXPERIMENTAL',
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
    classification: 'EXPERIMENTAL',
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

  // ---- ADMIN --------------------------------------------------------------
  {
    path: '/api/admin',
    router: adminRouter,
    classification: 'ADMIN',
    description: 'Admin panel',
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
    classification: 'ADMIN',
    description: 'Platform analytics',
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

  // ---- LEGACY -------------------------------------------------------------
  {
    path: '/api/timeline-v2',
    router: timelineV2Router,
    classification: 'LEGACY',
    description: 'Superseded by /api/timeline — kept for data migration',
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
      publicRoutesApp.use(entry.path, entry.router);
      publicCount++;
      logger.debug(`Registered public route: ${entry.path}`);
    } else {
      const mountPath = entry.path.startsWith('/api')
        ? entry.path.slice(4) || '/'
        : entry.path;
      protectedRoutesApp.use(mountPath, entry.router);
      protectedCount++;
      logger.debug(`Registered protected route: ${entry.path} -> ${mountPath}`);
    }
  }

  logger.info(
    `Routes registered: ${publicCount} public, ${protectedCount} protected` +
    (skippedCount > 0 ? `, ${skippedCount} skipped (ENABLE_EXPERIMENTAL_RUNTIME=false)` : '')
  );
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
