import type { NextFunction, Request, Response } from 'express';

import { logSecurityEvent, redactSensitive } from '../services/securityLog';

const REQUEST_FOOTPRINT: Record<string, number> = {};
const WINDOW_MS = 5 * 60 * 1000;

export const auditLogger = (req: Request, res: Response, next: NextFunction) => {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const previous = REQUEST_FOOTPRINT[key];

  if (!previous || now - previous > WINDOW_MS) {
    REQUEST_FOOTPRINT[key] = now;
  } else {
    logSecurityEvent('repeat_request_pattern', {
      ip: req.ip,
      path: req.path,
      deltaMs: now - previous,
      method: req.method
    });
    REQUEST_FOOTPRINT[key] = now;
  }

  res.on('finish', () => {
    if (res.statusCode >= 400) {
      logSecurityEvent('api_error', {
        ip: req.ip,
        path: req.path,
        status: res.statusCode,
        method: req.method,
        userAgent: req.headers['user-agent'],
        referer: req.headers.referer ? redactSensitive(req.headers.referer.toString()) : undefined
      });
    }
  });

  next();
};
