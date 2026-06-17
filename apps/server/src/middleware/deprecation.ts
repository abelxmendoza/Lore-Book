import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Mount prefixes scheduled for consolidation. Nothing is removed — clients get
 * Sunset/Link headers pointing at the canonical replacement.
 */
export const DEPRECATED_ROUTE_ALIASES: Record<string, { successor: string; sunset?: string }> = {
  '/api/omega-memory': { successor: '/api/memory', sunset: '2026-12-01' },
  '/api/memory-recall': { successor: '/api/memory/recall', sunset: '2026-12-01' },
  '/api/contradiction-alerts': { successor: '/api/governance/alerts', sunset: '2026-12-01' },
  '/api/belief-reconciliation': { successor: '/api/governance/beliefs', sunset: '2026-12-01' },
  '/api/threads': {
    successor: '/api/narrative/theme-threads',
    sunset: '2026-12-01',
  },
  '/api/timeline': { successor: '/api/timeline-v2', sunset: '2026-12-01' },
  '/api/chronology': { successor: '/api/timeline-v2/chronology', sunset: '2026-12-01' },
  '/api/timeline-hierarchy': { successor: '/api/timeline-v2/hierarchy', sunset: '2026-12-01' },
  '/api/people-places': { successor: '/api/locations', sunset: '2026-12-01' },
  '/api/github': { successor: '/api/integrations/github', sunset: '2026-12-01' },
  '/api/prediction': { successor: '/api/predictions', sunset: '2026-12-01' },
  '/api/emotion': { successor: '/api/emotions', sunset: '2026-12-01' },
};

export function deprecateRoute(mountPath: string): RequestHandler {
  const entry = DEPRECATED_ROUTE_ALIASES[mountPath];
  return (_req: Request, res: Response, next: NextFunction) => {
    if (entry) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Link', `<${entry.successor}>; rel="successor-version"`);
      if (entry.sunset) res.setHeader('Sunset', entry.sunset);
      res.setHeader('X-Deprecated-Route', mountPath);
      res.setHeader('X-Successor-Route', entry.successor);
    }
    next();
  };
}

/** Global middleware: attach deprecation headers when request hits a legacy mount. */
export function deprecationHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  const base = (req.baseUrl || '').replace(/\/$/, '');
  const entry = DEPRECATED_ROUTE_ALIASES[base];
  if (entry) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `<${entry.successor}>; rel="successor-version"`);
    if (entry.sunset) res.setHeader('Sunset', entry.sunset);
    res.setHeader('X-Deprecated-Route', base);
    res.setHeader('X-Successor-Route', entry.successor);
  }
  next();
}
