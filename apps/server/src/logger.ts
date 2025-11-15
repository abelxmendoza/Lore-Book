import pino from 'pino';

export const logger = pino({
  name: 'lore-keeper-server',
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
});
