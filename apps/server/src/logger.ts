import pino from 'pino';

export const logger = pino({
  name: 'lorebook-server',
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
});
