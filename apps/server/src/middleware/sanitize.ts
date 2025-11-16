import type { NextFunction, Request, Response } from 'express';

import { logSecurityEvent } from '../services/securityLog';

const sqlPatterns = [
  /union\s+select/gi,
  /drop\s+table/gi,
  /information_schema/gi,
  /;--/g,
  /\bOR\s+1=1/gi,
  /\bAND\s+1=1/gi
];

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    let sanitized = value;
    for (const pattern of sqlPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === 'object') {
    const sanitizedObject: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitizedObject[key] = sanitizeValue(val);
    }
    return sanitizedObject;
  }

  return value;
};

export const inputSanitizer = (req: Request, _res: Response, next: NextFunction) => {
  const originalBody = JSON.stringify(req.body ?? {});
  req.body = sanitizeValue(req.body) as any;
  req.query = sanitizeValue(req.query) as any;
  req.params = sanitizeValue(req.params) as any;

  const sanitizedBody = JSON.stringify(req.body ?? {});
  if (originalBody !== sanitizedBody) {
    logSecurityEvent('sanitized_input', {
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      originalLength: originalBody.length,
      sanitizedLength: sanitizedBody.length
    });
  }

  next();
};
