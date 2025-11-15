import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { assertConfig, config } from './config';
import { logger } from './logger';
import { chatRouter } from './routes/chat';
import { registerSyncJob } from './jobs/syncJob';
import { entriesRouter } from './routes/entries';
import { summaryRouter } from './routes/summary';
import { timelineRouter } from './routes/timeline';

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
app.use('/api/chat', chatRouter);
app.use('/api/timeline', timelineRouter);
app.use('/api/summary', summaryRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Unexpected error' });
});

registerSyncJob();

app.listen(config.port, () => {
  logger.info(`Lore Keeper API listening on ${config.port}`);
});
