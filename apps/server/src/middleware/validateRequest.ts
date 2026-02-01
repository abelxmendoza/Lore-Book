import type { Request, Response, NextFunction } from 'express';
import { z, type ZodSchema } from 'zod';

import { logger } from '../logger';

/**
 * Generic validation middleware that validates request body, query, and params
 */
export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate body, query, and params
      const data = {
        body: req.body,
        query: req.query,
        params: req.params,
      };

      const result = schema.safeParse(data);
      
      if (!result.success) {
        logger.warn({ 
          errors: result.error.flatten(),
          path: req.path,
          method: req.method
        }, 'Validation failed');
        
        return res.status(400).json({
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      // Replace request data with validated data (guard in case schema only has subset of keys).
      // Only assign req.body: req.query and req.params are read-only on Node's IncomingMessage in some setups.
      const validated = result.data as Record<string, unknown> | undefined;
      if (validated?.body !== undefined) req.body = validated.body as typeof req.body;
      // Do not assign to req.query or req.params; handlers continue to use req.query/req.params as-is.

      next();
    } catch (error) {
      const err = error as Error & { code?: string };
      logger.error(
        {
          path: req.path,
          method: req.method,
          url: req.originalUrl,
          message: err?.message,
          code: err?.code,
          stack: err?.stack,
        },
        'Validation middleware error'
      );
      return res.status(500).json({ error: 'Validation error' });
    }
  };
};

/**
 * Helper for body-only validation
 */
export const validateBody = (schema: ZodSchema) => {
  return validateRequest(z.object({ body: schema }));
};

/**
 * Helper for query-only validation
 */
export const validateQuery = (schema: ZodSchema) => {
  return validateRequest(z.object({ query: schema }));
};

/**
 * Helper for params-only validation
 */
export const validateParams = (schema: ZodSchema) => {
  return validateRequest(z.object({ params: schema }));
};

/**
 * Helper for combined validation (body + query + params)
 */
export const validateAll = (schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  const shape: Record<string, ZodSchema> = {};
  if (schemas.body) shape.body = schemas.body;
  if (schemas.query) shape.query = schemas.query;
  if (schemas.params) shape.params = schemas.params;
  
  return validateRequest(z.object(shape));
};
