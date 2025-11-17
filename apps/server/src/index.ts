import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { assertConfig, config } from './config';
import { logger } from './logger';
import { calendarRouter } from './routes/calendar';
import { chatRouter } from './routes/chat';
import { registerSyncJob } from './jobs/syncJob';
import { entriesRouter } from './routes/entries';
import { photosRouter } from './routes/photos';
import { summaryRouter } from './routes/summary';
import { timelineRouter } from './routes/timeline';
import { chaptersRouter } from './routes/chapters';
import { evolutionRouter } from './routes/evolution';
import { correctionsRouter } from './routes/corrections';
import { canonRouter } from './routes/canon';
import { ladderRouter } from './routes/ladder';
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
import { documentsRouter } from './routes/documents';
import { devRouter } from './routes/dev';
import healthRouter from './routes/health';
import { timeRouter } from './routes/time';

assertConfig();

const app = express();
// Configure Helmet with relaxed CSP for development
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false, // Disable CSP in development
    crossOriginEmbedderPolicy: false // Allow Vite HMR to work
  })
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check routes (no auth required)
app.use(healthRouter);

const apiRouter = express.Router();
apiRouter.use(authMiddleware, rateLimitMiddleware, inputSanitizer, secureHeaders, auditLogger);
apiRouter.use('/entries', entriesRouter);
apiRouter.use('/photos', photosRouter);
apiRouter.use('/calendar', calendarRouter);
apiRouter.use('/chat', chatRouter);
apiRouter.use('/timeline', timelineRouter);
apiRouter.use('/summary', summaryRouter);
apiRouter.use('/chapters', chaptersRouter);
apiRouter.use('/evolution', evolutionRouter);
apiRouter.use('/corrections', correctionsRouter);
apiRouter.use('/canon', canonRouter);
apiRouter.use('/ladder', ladderRouter);
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
apiRouter.use('/memoir', memoirRouter);
apiRouter.use('/documents', documentsRouter);
apiRouter.use('/time', timeRouter);
apiRouter.use('/dev', devRouter);

app.use('/api', apiRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Unexpected error' });
});

try {
  registerSyncJob();
} catch (error) {
  logger.warn({ error }, 'Failed to register sync job, continuing anyway');
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
