import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { config } from '../../config';
import { logger } from '../../logger';
import * as schema from './schema';

// This is a persistent backend (long-lived Express server), so prefer a direct
// connection / session pooler where prepared statements work. Fall back to the
// transaction pooler last for IPv4-only environments that need it.
const connectionString =
  config.databaseUrl ||
  config.supabasePoolerSessionUrl ||
  config.supabasePoolerTransactionUrl;

if (!connectionString && process.env.NODE_ENV !== 'test') {
  logger.warn('Direct Postgres connection is not configured; set DATABASE_URL or SUPABASE_POOLER_SESSION_URL');
}

export const postgresClient = connectionString
  ? postgres(connectionString, {
      // Required for Supabase transaction-mode pooler; harmless for session pooler.
      prepare: false,
      max: Number(process.env.POSTGRES_POOL_MAX ?? 10),
      idle_timeout: Number(process.env.POSTGRES_IDLE_TIMEOUT_SECONDS ?? 20),
      connect_timeout: Number(process.env.POSTGRES_CONNECT_TIMEOUT_SECONDS ?? 10),
    })
  : null;

export const db = postgresClient ? drizzle(postgresClient, { schema }) : null;

export async function closePostgresConnection(): Promise<void> {
  await postgresClient?.end({ timeout: 5 });
}
