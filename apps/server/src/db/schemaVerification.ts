/**
 * Lore-Keeper Database Sync Blueprint
 * Ensures backend expectations, Supabase schema, and PostgREST cache stay in lockstep.
 * Prevents PGRST205 cascade by verifying required tables at boot and gating requests when degraded.
 */

import { supabaseAdmin } from './dbAdapter';
import { logger } from '../logger';

/** Tables the backend expects. Missing any = DEGRADED, request guard returns 503. */
export const REQUIRED_TABLES = [
  'chapters',
  'journal_entries',
  'characters',
  'tasks',
] as const;

export type SchemaStatus = 'ok' | 'degraded';

let schemaStatus: SchemaStatus = 'ok';
let missingTables: string[] = [];
let lastSchemaCheck: Date | null = null;

function isTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? '';
  if (code === 'PGRST205') return true;
  if (/schema cache|could not find the table/i.test(message)) return true;
  return false;
}

/**
 * Check if a table exists by probing PostgREST (minimal select).
 * PGRST205 or "table not in schema cache" => table missing.
 */
export async function tableExists(tableName: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .limit(1);
    if (error && isTableMissingError(error)) return false;
    if (error) {
      logger.debug({ table: tableName, error: error.message }, 'Schema probe error (non-PGRST205)');
      return false;
    }
    return true;
  } catch (err) {
    if (isTableMissingError(err)) return false;
    logger.warn({ table: tableName, err }, 'Schema probe exception');
    return false;
  }
}

/**
 * Verify all REQUIRED_TABLES exist. Updates module state (schemaStatus, missingTables, lastSchemaCheck).
 */
export async function verifySchema(): Promise<{ ok: boolean; missingTables: string[] }> {
  const missing: string[] = [];
  for (const table of REQUIRED_TABLES) {
    const exists = await tableExists(table);
    if (!exists) missing.push(table);
  }
  missingTables = missing;
  lastSchemaCheck = new Date();
  schemaStatus = missing.length === 0 ? 'ok' : 'degraded';

  if (missing.length > 0) {
    logger.warn(
      { missingTables: missing, lastSchemaCheck: lastSchemaCheck.toISOString() },
      'Database schema incomplete (DEGRADED). Run migrations: ./scripts/run-base-migrations.sh'
    );
  }

  return { ok: missing.length === 0, missingTables: missing };
}

export function getSchemaStatus(): SchemaStatus {
  return schemaStatus;
}

export function getMissingTables(): string[] {
  return [...missingTables];
}

export function getLastSchemaCheck(): Date | null {
  return lastSchemaCheck;
}

export function setSchemaStatus(status: SchemaStatus, missing: string[] = []): void {
  schemaStatus = status;
  missingTables = status === 'degraded' ? missing : [];
}
