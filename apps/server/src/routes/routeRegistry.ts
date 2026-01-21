// =====================================================
// ROUTE REGISTRY
// Purpose: Single source of truth for all route registrations
// Prevents duplicate registrations and missing routers
// =====================================================

import express, { Router } from 'express';


// Import all routers
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
import { memoryGraphRouter } from './memoryGraph';
import { memoryLadderRouter } from './memoryLadder';
import { namingRouter } from './naming';
import { onboardingRouter } from './onboarding';
import { orchestratorRouter } from './orchestrator';
import { peoplePlacesRouter } from './peoplePlaces';
import { personaRouter } from './persona';
import { tasksRouter } from './tasks';
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
import { essenceRouter } from './essence';
import { verificationRouter } from './verification';
import timelineV2Router from './timelineV2';
import { omegaMemoryRouter } from './omegaMemory';
import { perspectivesRouter } from './perspectives';
import { memoryReviewQueueRouter } from './memoryReviewQueue';
import { predictionsRouter } from './predictions';
import { goalsRouter } from './goals';
import { questRouter } from './quests';
import { memoryEngineRouter } from './memoryEngine';
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
import willRouter from './will';

export interface RouteEntry {
  path: string;
  router: Router;
  requiresAuth?: boolean; // Default: true
  description?: string;
}

/**
 * Route Registry - Single source of truth for all routes
 * Add all routes here to prevent duplicates
 * 
 * IMPORTANT: Each path must be unique. Duplicates will cause runtime errors.
 */
export const routeRegistry: RouteEntry[] = [
  // Health & Diagnostics (no auth)
  { path: '/', router: healthRouter, requiresAuth: false, description: 'Health check' },
  { path: '/api/diagnostics', router: diagnosticsRouter, requiresAuth: false, description: 'Diagnostics' },
  
  // Public routes (no auth) - registered before auth middleware
  { path: '/api/entries', router: entriesRouter, requiresAuth: false },
  { path: '/api/photos', router: photosRouter, requiresAuth: false },
  { path: '/api/calendar', router: calendarRouter, requiresAuth: false },
  { path: '/api/chat', router: chatRouter, requiresAuth: false },
  { path: '/api/timeline', router: timelineRouter, requiresAuth: false },
  { path: '/api/summary', router: summaryRouter, requiresAuth: false },
  { path: '/api/chapters', router: chaptersRouter, requiresAuth: false },
  { path: '/api/evolution', router: evolutionRouter, requiresAuth: false },
  { path: '/api/corrections', router: correctionsRouter, requiresAuth: false },
  { path: '/api/canon', router: canonRouter, requiresAuth: false },
  { path: '/api/memory-graph', router: memoryGraphRouter, requiresAuth: false },
  { path: '/api/memory-ladder', router: memoryLadderRouter, requiresAuth: false },
  { path: '/api/people-places', router: peoplePlacesRouter, requiresAuth: false },
  { path: '/api/locations', router: locationsRouter, requiresAuth: false },
  { path: '/api/x', router: xRouter, requiresAuth: false },
  { path: '/api/tasks', router: tasksRouter, requiresAuth: false },
  { path: '/api/legal', router: legalRouter, requiresAuth: false },
  { path: '/api/billing', router: billingRouter, requiresAuth: false },
  { path: '/api/account', router: accountRouter, requiresAuth: false },
  
  // Protected routes (require auth) - registered after auth middleware
  { path: '/api/timeline-hierarchy', router: timelineHierarchyRouter },
  { path: '/api/omega-memory', router: omegaMemoryRouter },
  { path: '/api/continuity', router: continuityRouter },
  { path: '/api/perspectives', router: perspectivesRouter },
  { path: '/api/mrq', router: memoryReviewQueueRouter },
  { path: '/api/insights', router: insightsRouter },
  // Note: /api/chat is registered above as public, chatOrchestrationRouter handles protected chat endpoints
  { path: '/api/chat/message', router: chatOrchestrationRouter },
  { path: '/api/decisions', router: decisionsRouter },
  { path: '/api/predictions', router: predictionsRouter },
  { path: '/api/goals', router: goalsRouter },
  { path: '/api/quests', router: questRouter },
  { path: '/api/privacy', router: privacyRouter },
  { path: '/api/hqi', router: hqiRouter },
  { path: '/api/search', router: searchRouter },
  { path: '/api/onboarding', router: onboardingRouter },
  { path: '/api/agents', router: agentsRouter },
  { path: '/api/autopilot', router: autopilotRouter },
  { path: '/api/persona', router: personaRouter },
  { path: '/api/orchestrator', router: orchestratorRouter },
  { path: '/api/github', router: githubRouter },
  { path: '/api/external-hub', router: externalHubRouter },
  { path: '/api/integrations', router: integrationsRouter },
  { path: '/api/journal', router: journalRouter },
  { path: '/api/characters', router: charactersRouter },
  { path: '/api/perceptions', router: perceptionsRouter },
  { path: '/api/reactions', router: reactionsRouter },
  { path: '/api/perception-reaction-engine', router: perceptionReactionEngineRouter },
  { path: '/api/skills', router: skillsRouter },
  { path: '/api/achievements', router: achievementsRouter },
  { path: '/api/resume', router: resumeRouter },
  { path: '/api/notebook', router: notebookRouter },
  { path: '/api/identity', router: identityRouter },
  { path: '/api/harmonization', router: harmonizationRouter },
  { path: '/api/naming', router: namingRouter },
  { path: '/api/subscription', router: subscriptionRouter },
  { path: '/api/memoir', router: memoirRouter },
  { path: '/api/biography', router: biographyRouter },
  { path: '/api/documents', router: documentsRouter },
  { path: '/api/time', router: timeRouter },
  { path: '/api/user', router: userRouter },
  { path: '/api/essence', router: essenceRouter },
  { path: '/api/verification', router: verificationRouter },
  { path: '/api/admin', router: adminRouter },
  { path: '/api/dev', router: devRouter },
  { path: '/api/timeline-v2', router: timelineV2Router },
  { path: '/api/memory-engine', router: memoryEngineRouter },
  { path: '/api/graph', router: knowledgeGraphRouter },
  { path: '/api/analytics', router: analyticsRouter },
  { path: '/api/chronology', router: chronologyRouter },
  { path: '/api/conversation', router: conversationCenteredRouter },
  { path: '/api/recommendations', router: recommendationsRouter },
  { path: '/api/wisdom', router: wisdomRouter },
  { path: '/api/learning', router: learningRouter },
  { path: '/api/context', router: contextRouter },
  { path: '/api/consolidation', router: consolidationRouter },
  { path: '/api/prediction', router: predictionRouter },
  { path: '/api/narrative', router: narrativeRouter },
  { path: '/api/relationship-dynamics', router: relationshipDynamicsRouter },
  { path: '/api/intervention', router: interventionRouter },
  { path: '/api/habits', router: habitsRouter },
  { path: '/api/resilience', router: resilienceRouter },
  { path: '/api/influence', router: influenceRouter },
  { path: '/api/growth', router: growthRouter },
  { path: '/api/legacy', router: legacyRouter },
  { path: '/api/values', router: valuesRouter },
  { path: '/api/dreams', router: dreamsRouter },
  { path: '/api/emotion', router: emotionRouter },
  { path: '/api/health', router: healthRouter },
  { path: '/api/financial', router: financialRouter },
  { path: '/api/creative', router: creativeRouter },
  { path: '/api/social', router: socialRouter },
  { path: '/api/reflection', router: reflectionRouter },
  { path: '/api/personality', router: personalityRouter },
  { path: '/api/archetype', router: archetypeRouter },
  { path: '/api/engines', router: enginesRouter },
  { path: '/api/engine-registry', router: engineRegistryRouter },
  { path: '/api/entities', router: entitiesRouter },
  { path: '/api/events', router: eventsRouter },
  { path: '/api/location-resolution', router: locationResolutionRouter },
  { path: '/api/activities', router: activitiesRouter },
  { path: '/api/temporal-events', router: temporalEventsRouter },
  { path: '/api/emotion-resolution', router: emotionResolutionRouter },
  { path: '/api/emotions', router: emotionalIntelligenceRouter },
  { path: '/api/behavior', router: behaviorRouter },
  { path: '/api/engine-runtime', router: engineRuntimeRouter },
  { path: '/api/scenes', router: scenesRouter },
  { path: '/api/conflicts', router: conflictsRouter },
  { path: '/api/toxicity', router: toxicityRouter },
  { path: '/api/social-projection', router: socialProjectionRouter },
  { path: '/api/paracosm', router: paracosmRouter },
  { path: '/api/inner-mythology', router: innerMythologyRouter },
  { path: '/api/identity-core', router: identityCoreRouter },
  { path: '/api/story-of-self', router: storyOfSelfRouter },
  { path: '/api/inner-dialogue', router: innerDialogueRouter },
  { path: '/api/alternate-self', router: alternateSelfRouter },
  { path: '/api/cognitive-bias', router: cognitiveBiasRouter },
  { path: '/api/distortions', router: distortionRouter },
  { path: '/api/shadow', router: shadowEngineRouter },
  { path: '/api/chat-memory', router: chatMemoryRouter },
  { path: '/api/internal/engine', router: engineHealthRouter },
  { path: '/api/life-arc', router: lifeArcRouter },
  { path: '/api/meta', router: metaControlRouter },
  { path: '/api/correction-dashboard', router: correctionDashboardRouter },
  { path: '/api/entity-resolution', router: entityResolutionRouter },
  { path: '/api/organizations', router: organizationsRouter },
  { path: '/api/memory-recall', router: memoryRecallRouter },
  { path: '/api/entity-ambiguity', router: entityAmbiguityRouter },
  { path: '/api/entity-meaning-drift', router: entityMeaningDriftRouter },
  { path: '/api/knowledge-type', router: knowledgeTypeEngineRouter },
  { path: '/api/belief-reconciliation', router: beliefRealityReconciliationRouter },
  { path: '/api/narrative-diff', router: narrativeDiffRouter },
  { path: '/api/contradiction-alerts', router: contradictionAlertsRouter },
  { path: '/api/will', router: willRouter },
  { path: '/api/continuity-profile', router: continuityProfileRouter },
  { path: '/api/strategy', router: personalStrategyRouter },
];

/**
 * Validate route registry for duplicates and missing routers
 */
export function validateRouteRegistry(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenPaths = new Set<string>();

  for (const entry of routeRegistry) {
    // Check for duplicate paths
    if (seenPaths.has(entry.path)) {
      errors.push(`Duplicate route path: ${entry.path}`);
    }
    seenPaths.add(entry.path);

    // Check for missing router
    if (!entry.router) {
      errors.push(`Missing router for path: ${entry.path}`);
    }

    // Check for invalid router type
    if (entry.router && typeof entry.router !== 'function' && typeof entry.router.use !== 'function') {
      errors.push(`Invalid router type for path: ${entry.path}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Register all routes with Express app
 * Routes are split into public (no auth) and protected (with auth middleware)
 * 
 * @param app Express application
 * @param publicRoutesApp Express app/router for public routes (no auth)
 * @param protectedRoutesApp Express app/router for protected routes (with auth middleware stack)
 */
export function registerRoutes(
  publicRoutesApp: express.Application | express.Router,
  protectedRoutesApp: express.Router
): void {
  const validation = validateRouteRegistry();
  
  if (!validation.valid) {
    logger.error('Route registry validation failed:', validation.errors);
    throw new Error(`Route registry validation failed: ${validation.errors.join(', ')}`);
  }

  const seenPaths = new Set<string>();
  let publicRoutes = 0;
  let protectedRoutes = 0;

  for (const entry of routeRegistry) {
    // Double-check for duplicates at runtime
    if (seenPaths.has(entry.path)) {
      logger.error(`Duplicate route detected at runtime: ${entry.path}`);
      throw new Error(`Duplicate route registration detected: ${entry.path}`);
    }
    seenPaths.add(entry.path);

    // Register route
    if (entry.requiresAuth === false) {
      // Public route (no auth required)
      publicRoutesApp.use(entry.path, entry.router);
      publicRoutes++;
      logger.debug(`Registered public route: ${entry.path}`);
    } else {
      // Protected route (requires auth - middleware already applied to protectedRoutesApp)
      protectedRoutesApp.use(entry.path, entry.router);
      protectedRoutes++;
      logger.debug(`Registered protected route: ${entry.path}`);
    }
  }

  logger.info(`Route registration complete: ${publicRoutes} public, ${protectedRoutes} protected routes`);
}

/**
 * Development-time validation to check for duplicate imports
 * This runs at module load time in development
 */
if (process.env.NODE_ENV === 'development') {
  // Validate on import in development
  const validation = validateRouteRegistry();
  if (!validation.valid) {
    console.error('❌ Route registry validation failed at module load:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    // Don't throw in development, just warn - allows for hot reload
    console.warn('⚠️  Server will continue, but routes may not work correctly');
  } else {
    console.log(`✅ Route registry validated: ${routeRegistry.length} routes registered`);
  }
}

