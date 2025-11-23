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
import { memoryEngineRouter } from './routes/memoryEngine';
import { knowledgeGraphRouter } from './routes/knowledgeGraph';
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
import { errorHandler } from './middleware/errorHandler';
import { asyncHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './utils/requestId';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

assertConfig();

const app = express();
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';

// Configure Helmet with relaxed CSP for development
app.use(
  helmet({
    contentSecurityPolicy: isDevelopment ? false : undefined, // Disable CSP in development
    crossOriginEmbedderPolicy: false, // Allow Vite HMR to work
    hsts: !isDevelopment // Only enforce HSTS in production
  })
);

// CORS - more permissive in development
app.use(cors({
  origin: isDevelopment ? true : process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
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

const apiRouter = express.Router();

// Security middleware stack (with dev-friendly settings)
apiRouter.use(authMiddleware);
apiRouter.use(csrfTokenMiddleware); // Generate CSRF tokens (skipped in dev)
apiRouter.use(validateRequestSize); // Validate request sizes (relaxed in dev)
if (!isDevelopment) {
  apiRouter.use(csrfProtection); // CSRF protection (skipped in dev)
  apiRouter.use(validateCommonPatterns); // Pattern validation (skipped in dev)
}
apiRouter.use(rateLimitMiddleware);
apiRouter.use(inputSanitizer);
apiRouter.use(secureHeaders);
apiRouter.use(auditLogger);
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
