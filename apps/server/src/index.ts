import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { assertConfig, config } from './config';
import { logger } from './logger';
import { setupSwagger } from './swagger';
import { calendarRouter } from './routes/calendar';
import { registerSyncJob } from './jobs/syncJob';
import { memoryExtractionWorker } from './jobs/memoryExtractionWorker';
import { entriesRouter } from './routes/entries';
import { photosRouter } from './routes/photos';
import { summaryRouter } from './routes/summary';
import { timelineRouter } from './routes/timeline';
import { timelineHierarchyRouter } from './routes/timelineHierarchy';
import { chaptersRouter } from './routes/chapters';
import { evolutionRouter } from './routes/evolution';
import { correctionsRouter } from './routes/corrections';
import { canonRouter } from './routes/canon';
import { memoryGraphRouter } from './routes/memoryGraph';
import { memoryLadderRouter } from './routes/memoryLadder';
import { hqiRouter } from './routes/hqi';
import { peoplePlacesRouter } from './routes/peoplePlaces';
import { locationsRouter } from './routes/locations';
import { xRouter } from './routes/x';
import { tasksRouter } from './routes/tasks';
import { legalRouter } from './routes/legal';
import { billingRouter } from './billing/billingRouter';
import { accountRouter } from './routes/account';
import { insightsRouter } from './routes/insights';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { inputSanitizer } from './middleware/sanitize';
import { secureHeaders } from './middleware/secureHeaders';
import { auditLogger } from './middleware/auditLogger';
import { csrfTokenMiddleware, csrfProtection } from './middleware/csrf';
import { validateRequestSize, validateCommonPatterns } from './middleware/requestValidation';
import { accountRouter } from './routes/account';
import { onboardingRouter } from './routes/onboarding';
import { agentsRouter } from './routes/agents';
import { autopilotRouter } from './routes/autopilot';
import { personaRouter } from './routes/persona';
import { orchestratorRouter } from './routes/orchestrator';
import { continuityRouter } from './routes/continuity';
import { integrationsRouter } from './routes/integrations';
import { githubRouter } from './routes/github';
import { journalRouter } from './routes/journal';
import { charactersRouter } from './routes/characters';
import perceptionsRouter from './routes/perceptions';
import reactionsRouter from './routes/reactions';
import perceptionReactionEngineRouter from './routes/perceptionReactionEngine';
import skillsRouter from './routes/skills';
import achievementsRouter from './routes/achievements';
import resumeRouter from './routes/resume';
import { notebookRouter } from './routes/notebook';
import { identityRouter } from './routes/identity';
import { externalHubRouter } from './external/external_hub.router';
import { harmonizationRouter } from './harmonization/harmonization.router';
import { chatRouter } from './routes/chat';
import { namingRouter } from './routes/naming';
import { memoirRouter } from './routes/memoir';
import { biographyRouter } from './routes/biography';
import { documentsRouter } from './routes/documents';
import { devRouter } from './routes/dev';
import { adminRouter } from './routes/admin';
import healthRouter from './routes/health';
import { timeRouter } from './routes/time';
import { privacyRouter } from './routes/privacy';
import { subscriptionRouter } from './routes/subscription';
import { userRouter } from './routes/user';
import { essenceRouter } from './routes/essence';
import { verificationRouter } from './routes/verification';
import { timelineV2Router } from './routes/timelineV2';
import { omegaMemoryRouter } from './routes/omegaMemory';
import { memoryEngineRouter } from './routes/memoryEngine';
import { knowledgeGraphRouter } from './routes/knowledgeGraph';
import { searchRouter } from './routes/search';
import { analyticsRouter } from './routes/analytics';
import { chronologyRouter } from './routes/chronology';
import recommendationsRouter from './routes/recommendations';
import wisdomRouter from './routes/wisdom';
import learningRouter from './routes/learning';
import contextRouter from './routes/context';
import consolidationRouter from './routes/consolidation';
import predictionRouter from './routes/prediction';
import narrativeRouter from './routes/narrative';
import relationshipDynamicsRouter from './routes/relationshipDynamics';
import interventionRouter from './routes/intervention';
import goalsRouter from './routes/goals';
import habitsRouter from './routes/habits';
import decisionsRouter from './routes/decisions';
import resilienceRouter from './routes/resilience';
import influenceRouter from './routes/influence';
import growthRouter from './routes/growth';
import legacyRouter from './routes/legacy';
import valuesRouter from './routes/values';
import dreamsRouter from './routes/dreams';
import emotionRouter from './routes/emotion';
import healthRouter from './routes/health';
import financialRouter from './routes/financial';
import creativeRouter from './routes/creative';
import timeRouter from './routes/time';
import socialRouter from './routes/social';
import reflectionRouter from './routes/reflection';
import personalityRouter from './routes/personality';
import archetypeRouter from './routes/archetype';
import enginesRouter from './routes/engines';
import engineRegistryRouter from './routes/engineRegistry';
import entitiesRouter from './routes/entities';
import eventsRouter from './routes/events';
import locationResolutionRouter from './routes/locationResolution';
import activitiesRouter from './routes/activities';
import temporalEventsRouter from './routes/temporalEvents';
import emotionResolutionRouter from './routes/emotionResolution';
import behaviorRouter from './routes/behavior';
import scenesRouter from './routes/scenes';
import conflictsRouter from './routes/conflicts';
import toxicityRouter from './routes/toxicity';
import socialProjectionRouter from './routes/socialProjection';
import paracosmRouter from './routes/paracosm';
import innerMythologyRouter from './routes/innerMythology';
import identityCoreRouter from './routes/identityCore';
import storyOfSelfRouter from './routes/storyOfSelf';
import innerDialogueRouter from './routes/innerDialogue';
import alternateSelfRouter from './routes/alternateSelf';
import cognitiveBiasRouter from './routes/cognitiveBias';
import distortionRouter from './routes/distortion';
import shadowEngineRouter from './routes/shadowEngine';
import emotionalIntelligenceRouter from './routes/emotionalIntelligence';
import engineRuntimeRouter from './routes/engineRuntime';
import chatMemoryRouter from './routes/chatMemory';
import { errorHandler } from './middleware/errorHandler';
import { asyncHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './utils/requestId';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { intrusionDetection } from './middleware/intrusionDetection';
import { performSecurityCheck } from './utils/securityCheck';

assertConfig();

// Perform security check on startup
const securityCheck = performSecurityCheck();
if (!securityCheck.passed) {
  logger.error('🚨 Security check failed - server starting but may be vulnerable');
  if (isProduction) {
    logger.error('⚠️  PRODUCTION MODE: Fix security issues before deploying');
  }
}

const app = express();
// SECURITY: Properly detect production environment
// Default to production for safety if NODE_ENV is not explicitly set to 'development'
const isDevelopment = process.env.NODE_ENV === 'development' || 
                      (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');
const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.API_ENV === 'production' ||
                     (!process.env.NODE_ENV && !process.env.API_ENV); // Default to production for safety

// Configure Helmet with strict security in production
app.use(
  helmet({
    contentSecurityPolicy: isDevelopment ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for some frameworks
        styleSrc: ["'self'", "'unsafe-inline'"], // Needed for Tailwind
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://*.supabase.co", "https://api.openai.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false, // Allow some third-party integrations
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);

// CORS - strict in production, permissive only in development
app.use(cors({
  origin: isDevelopment 
    ? true // Allow all origins in development
    : (origin, callback) => {
        // In production, only allow specific origins
        const allowedOrigins = [
          process.env.FRONTEND_URL,
          process.env.VITE_API_URL?.replace('/api', ''), // Remove /api if present
          'https://lorekeeper.app',
          'https://www.lorekeeper.app'
        ].filter(Boolean) as string[];
        
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn({ origin, allowedOrigins }, 'CORS: Blocked request from unauthorized origin');
          callback(new Error('Not allowed by CORS'));
        }
      },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'],
  maxAge: isDevelopment ? 86400 : 3600 // 24h in dev, 1h in prod
}));

// Stripe webhook endpoint (must be before body parser - needs raw body)
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }), subscriptionRouter);

// Request size limits - larger in development
app.use(express.json({ limit: isDevelopment ? '50mb' : '1mb' }));
app.use(express.urlencoded({ extended: true, limit: isDevelopment ? '50mb' : '1mb' }));

// Request ID middleware (must be early in the chain)
app.use(requestIdMiddleware);

// Swagger API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Lore Keeper API Documentation',
}));

// Health check routes (no auth required)
app.use('/', healthRouter);

// Diagnostic routes (no auth required, for troubleshooting)
import diagnosticsRouter from './routes/diagnostics';
app.use('/api/diagnostics', diagnosticsRouter);

app.use('/api/entries', entriesRouter);
app.use('/api/photos', photosRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/chat', chatRouter);
app.use('/api/timeline', timelineRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/chapters', chaptersRouter);
app.use('/api/evolution', evolutionRouter);
app.use('/api/corrections', correctionsRouter);
app.use('/api/canon', canonRouter);
app.use('/api/ladder', ladderRouter);
app.use('/api/memory-graph', memoryGraphRouter);
app.use('/api/memory-ladder', memoryLadderRouter);
app.use('/api/people-places', peoplePlacesRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/x', xRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/legal', legalRouter);
app.use('/api/billing', billingRouter);
app.use('/api/account', accountRouter);
const apiRouter = express.Router();

// Security middleware stack - ALWAYS enabled in production
apiRouter.use(intrusionDetection); // Intrusion detection (blocks suspicious activity)
apiRouter.use(authMiddleware); // Authentication required for all API routes
apiRouter.use(csrfTokenMiddleware); // Generate CSRF tokens
apiRouter.use(validateRequestSize); // Validate request sizes
if (isProduction) {
  // CRITICAL: These security features MUST be enabled in production
  apiRouter.use(csrfProtection); // CSRF protection
  apiRouter.use(validateCommonPatterns); // Pattern validation (SQL injection, XSS, etc.)
  logger.info('🔒 Production security enabled: CSRF protection and pattern validation active');
} else {
  logger.warn('⚠️  Development mode: Some security features are relaxed');
}
apiRouter.use(rateLimitMiddleware); // Rate limiting
apiRouter.use(inputSanitizer); // Input sanitization
apiRouter.use(secureHeaders); // Additional security headers
apiRouter.use(auditLogger); // Security audit logging
apiRouter.use('/entries', entriesRouter);
apiRouter.use('/photos', photosRouter);
apiRouter.use('/calendar', calendarRouter);
apiRouter.use('/chat', chatRouter);
apiRouter.use('/timeline', timelineRouter);
apiRouter.use('/timeline-hierarchy', timelineHierarchyRouter);
apiRouter.use('/summary', summaryRouter);
apiRouter.use('/chapters', chaptersRouter);
apiRouter.use('/evolution', evolutionRouter);
apiRouter.use('/corrections', correctionsRouter);
apiRouter.use('/canon', canonRouter);
apiRouter.use('/memory-graph', memoryGraphRouter);
apiRouter.use('/memory-ladder', memoryLadderRouter);
apiRouter.use('/hqi', hqiRouter);
apiRouter.use('/people-places', peoplePlacesRouter);
apiRouter.use('/locations', locationsRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/x', xRouter);
apiRouter.use('/tasks', tasksRouter);
apiRouter.use('/account', accountRouter);
apiRouter.use('/onboarding', onboardingRouter);
apiRouter.use('/agents', agentsRouter);
apiRouter.use('/autopilot', autopilotRouter);
apiRouter.use('/insights', insightsRouter);
apiRouter.use('/persona', personaRouter);
apiRouter.use('/orchestrator', orchestratorRouter);
apiRouter.use('/continuity', continuityRouter);
apiRouter.use('/github', githubRouter);
apiRouter.use('/external-hub', externalHubRouter);
apiRouter.use('/integrations', integrationsRouter);
apiRouter.use('/journal', journalRouter);
apiRouter.use('/characters', charactersRouter);
apiRouter.use('/perceptions', perceptionsRouter);
apiRouter.use('/reactions', reactionsRouter);
apiRouter.use('/perception-reaction-engine', perceptionReactionEngineRouter);
apiRouter.use('/skills', skillsRouter);
apiRouter.use('/achievements', achievementsRouter);
apiRouter.use('/resume', resumeRouter);
apiRouter.use('/', notebookRouter);
apiRouter.use('/identity', identityRouter);
apiRouter.use('/harmonization', harmonizationRouter);
apiRouter.use('/chat', chatRouter);
apiRouter.use('/naming', namingRouter);
apiRouter.use('/subscription', subscriptionRouter);
apiRouter.use('/memoir', memoirRouter);
apiRouter.use('/biography', biographyRouter);
apiRouter.use('/documents', documentsRouter);
apiRouter.use('/time', timeRouter);
apiRouter.use('/privacy', privacyRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/essence', essenceRouter);
apiRouter.use('/verification', verificationRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/dev', devRouter);
apiRouter.use('/internal/engine', engineHealthRouter);
apiRouter.use('/internal/engine', engineHealthRouter);
apiRouter.use('/timeline-v2', timelineV2Router);
apiRouter.use('/memory-engine', memoryEngineRouter);
apiRouter.use('/graph', knowledgeGraphRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/chronology', chronologyRouter);
apiRouter.use('/recommendations', recommendationsRouter);
apiRouter.use('/wisdom', wisdomRouter);
apiRouter.use('/learning', learningRouter);
apiRouter.use('/context', contextRouter);
apiRouter.use('/consolidation', consolidationRouter);
apiRouter.use('/prediction', predictionRouter);
apiRouter.use('/narrative', narrativeRouter);
apiRouter.use('/relationship-dynamics', relationshipDynamicsRouter);
apiRouter.use('/intervention', interventionRouter);
apiRouter.use('/goals', goalsRouter);
apiRouter.use('/habits', habitsRouter);
apiRouter.use('/decisions', decisionsRouter);
apiRouter.use('/resilience', resilienceRouter);
apiRouter.use('/influence', influenceRouter);
apiRouter.use('/growth', growthRouter);
apiRouter.use('/legacy', legacyRouter);
apiRouter.use('/values', valuesRouter);
apiRouter.use('/dreams', dreamsRouter);
apiRouter.use('/emotion', emotionRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/financial', financialRouter);
apiRouter.use('/creative', creativeRouter);
apiRouter.use('/time', timeRouter);
apiRouter.use('/social', socialRouter);
apiRouter.use('/reflection', reflectionRouter);
apiRouter.use('/personality', personalityRouter);
apiRouter.use('/archetype', archetypeRouter);
apiRouter.use('/engines', enginesRouter);
apiRouter.use('/engine-registry', engineRegistryRouter);
apiRouter.use('/entities', entitiesRouter);
apiRouter.use('/events', eventsRouter);
apiRouter.use('/locations', locationResolutionRouter);
apiRouter.use('/activities', activitiesRouter);
apiRouter.use('/temporal-events', temporalEventsRouter);
apiRouter.use('/emotion', emotionResolutionRouter);
apiRouter.use('/emotions', emotionalIntelligenceRouter);
apiRouter.use('/behavior', behaviorRouter);
apiRouter.use('/engine-runtime', engineRuntimeRouter);
apiRouter.use('/scenes', scenesRouter);
apiRouter.use('/conflicts', conflictsRouter);
apiRouter.use('/toxicity', toxicityRouter);
apiRouter.use('/social-projection', socialProjectionRouter);
apiRouter.use('/paracosm', paracosmRouter);
apiRouter.use('/inner-mythology', innerMythologyRouter);
apiRouter.use('/identity-core', identityCoreRouter);
apiRouter.use('/story-of-self', storyOfSelfRouter);
apiRouter.use('/inner-dialogue', innerDialogueRouter);
apiRouter.use('/alternate-self', alternateSelfRouter);
apiRouter.use('/cognitive-bias', cognitiveBiasRouter);
apiRouter.use('/distortions', distortionRouter);
apiRouter.use('/shadow', shadowEngineRouter);
apiRouter.use('/engine-runtime', engineRuntimeRouter);
apiRouter.use('/chat-memory', chatMemoryRouter);

app.use('/api', apiRouter);

// API Documentation (only in development or when enabled)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
  setupSwagger(app);
  logger.info('API documentation available at /api-docs');
}

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Global error handler (must be last)
app.use(errorHandler);

try {
  registerSyncJob();
  memoryExtractionWorker.start();
  insightGenerationJob.register();
  graphUpdateJob.register();
  continuityEngineJob.register();
} catch (error) {
  logger.warn({ error }, 'Failed to register background jobs, continuing anyway');
}

// Start engine scheduler (if enabled)
if (process.env.ENABLE_ENGINE_SCHEDULER === 'true') {
  try {
    const { startEngineScheduler } = await import('./engineRuntime/scheduler');
    startEngineScheduler();
    logger.info('Engine scheduler started');
  } catch (error) {
    logger.warn({ error }, 'Failed to start engine scheduler, continuing anyway');
  }
}

const server = app.listen(config.port, () => {
  logger.info(`Lore Keeper API listening on ${config.port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use. Please stop the other process or change the port.`);
  } else {
    logger.error({ error }, 'Failed to start server');
  }
  process.exit(1);
});
