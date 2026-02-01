/**
 * Request guard: when schema is DEGRADED, return 503 for API routes
 * so we don't flood logs with PGRST205 and cascade failures.
 * /api/health and /api/health/db are excluded (mounted on main app).
 */

import { Request, Response, NextFunction } from 'express';
import { getSchemaStatus, getMissingTables } from '../db/schemaVerification';
import { logger } from '../logger';

export function schemaGuard(req: Request, res: Response, next: NextFunction): void {
  if (getSchemaStatus() !== 'degraded') {
    return next();
  }
  const missing = getMissingTables();
  logger.debug({ path: req.path, missingTables: missing }, 'Request blocked: schema degraded');
  res.status(503).json({
    error: 'Database schema incomplete',
    message: 'Required tables are missing. Run migrations: ./scripts/run-base-migrations.sh',
    missingTables: missing,
  });
}
