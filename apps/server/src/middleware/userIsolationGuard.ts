import type { NextFunction, Request, Response } from 'express';

import { logger } from '../logger';

type JsonPayload = unknown;

type LeakFinding = {
  path: string;
  ownerUserId: string;
};

const USER_ID_KEYS = new Set(['user_id', 'userId']);
const DEFAULT_MAX_SCAN_DEPTH = 8;

/** Admin console routes are RBAC-gated and intentionally return cross-user aggregates. */
export function shouldBypassUserIsolation(req: Pick<Request, 'path' | 'originalUrl'>): boolean {
  const path = req.path ?? '';
  const originalPath = (req.originalUrl ?? '').split('?')[0] ?? '';
  return path.startsWith('/admin') || originalPath.startsWith('/api/admin');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findForeignUserId(
  value: JsonPayload,
  expectedUserId: string,
  path = '$',
  depth = 0,
): LeakFinding | null {
  if (depth > DEFAULT_MAX_SCAN_DEPTH || value == null) return null;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const finding = findForeignUserId(value[index], expectedUserId, `${path}[${index}]`, depth + 1);
      if (finding) return finding;
    }
    return null;
  }

  if (!isPlainObject(value)) return null;

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (USER_ID_KEYS.has(key) && typeof nestedValue === 'string' && nestedValue !== expectedUserId) {
      return { path: nextPath, ownerUserId: nestedValue };
    }

    const finding = findForeignUserId(nestedValue, expectedUserId, nextPath, depth + 1);
    if (finding) return finding;
  }

  return null;
}

export function assertPayloadOwnedByUser(payload: JsonPayload, expectedUserId: string): void {
  const finding = findForeignUserId(payload, expectedUserId);
  if (!finding) return;

  const error = new Error(`Cross-user payload blocked at ${finding.path}`);
  Object.assign(error, finding);
  throw error;
}

export function userIsolationGuard(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = ((payload: JsonPayload) => {
    const expectedUserId = req.user?.id;

    if (expectedUserId && res.statusCode < 400 && !shouldBypassUserIsolation(req)) {
      try {
        assertPayloadOwnedByUser(payload, expectedUserId);
      } catch (error) {
        logger.error(
          {
            error,
            requestId: req.requestId,
            path: req.originalUrl,
            userId: expectedUserId,
          },
          'Blocked cross-user data in API response',
        );

        res.status(500);
        return originalJson({
          error: 'User data isolation violation blocked',
          requestId: req.requestId,
        });
      }
    }

    return originalJson(payload);
  }) as Response['json'];

  next();
}
