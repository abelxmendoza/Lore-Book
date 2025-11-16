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
import { peoplePlacesRouter } from './routes/peoplePlaces';
import { locationsRouter } from './routes/locations';
import { xRouter } from './routes/x';

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', name: 'Lore Keeper API' });
});

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
