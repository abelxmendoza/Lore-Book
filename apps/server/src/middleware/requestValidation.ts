import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { logSecurityEvent } from '../services/securityLog';

// Maximum request sizes
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_QUERY_SIZE = 2048; // 2KB
const MAX_PARAMS_SIZE = 1024; // 1KB

// Common validation schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

// Development mode - relaxed limits
// SECURITY: Properly detect production environment
const isDevelopment = () => process.env.NODE_ENV === 'development' || 
                      process.env.NODE_ENV === 'test' ||
                      (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');
const isProduction = () => process.env.NODE_ENV === 'production' || 
                     process.env.API_ENV === 'production';
const DEV_MAX_BODY_SIZE = 50 * 1024 * 1024; // 50MB in dev

// Middleware to validate request sizes
export const validateRequestSize = (req: Request, res: Response, next: NextFunction) => {
  const bodySize = JSON.stringify(req.body || {}).length;
  const querySize = JSON.stringify(req.query || {}).length;
  const paramsSize = JSON.stringify(req.params || {}).length;

  const maxBodySize = isDevelopment() ? DEV_MAX_BODY_SIZE : MAX_BODY_SIZE;

  if (bodySize > maxBodySize) {
    logSecurityEvent('request_body_too_large', {
      ip: req.ip,
      path: req.path,
      size: bodySize,
      maxSize: maxBodySize
    });
    return res.status(413).json({ 
      error: 'Request body too large',
      maxSize: maxBodySize
    });
  }

  if (querySize > MAX_QUERY_SIZE) {
    logSecurityEvent('request_query_too_large', {
      ip: req.ip,
      path: req.path,
      size: querySize,
      maxSize: MAX_QUERY_SIZE
    });
    return res.status(413).json({ 
      error: 'Query string too large',
      maxSize: MAX_QUERY_SIZE
    });
  }

  if (paramsSize > MAX_PARAMS_SIZE) {
    logSecurityEvent('request_params_too_large', {
      ip: req.ip,
      path: req.path,
      size: paramsSize,
      maxSize: MAX_PARAMS_SIZE
    });
    return res.status(413).json({ 
      error: 'URL parameters too large',
      maxSize: MAX_PARAMS_SIZE
    });
  }

  next();
};

// Middleware to validate common patterns
export const validateCommonPatterns = (req: Request, res: Response, next: NextFunction) => {
  // Skip pattern validation in development for easier testing
  if (isDevelopment()) {
    return next();
  }

  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /\bon\w+\s*=/i, // Use word boundary to prevent ReDoS
    /\beval\s*\(/i, // Use word boundary to prevent ReDoS
    /\bexpression\s*\(/i // Use word boundary to prevent ReDoS
  ];

  const checkValue = (value: unknown, path: string): boolean => {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          logSecurityEvent('suspicious_pattern_detected', {
            ip: req.ip,
            path: req.path,
            pattern: pattern.toString(),
            valuePath: path
          });
          return false;
        }
      }
    } else if (Array.isArray(value)) {
      return value.every((item, index) => checkValue(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      return Object.entries(value).every(([key, val]) => 
        checkValue(val, path ? `${path}.${key}` : key)
      );
    }
    return true;
  };

  if (!checkValue(req.body, 'body') || 
      !checkValue(req.query, 'query') || 
      !checkValue(req.params, 'params')) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  next();
};

