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

      // Replace request data with validated data
      if (result.data.body) req.body = result.data.body;
      if (result.data.query) req.query = result.data.query;
      if (result.data.params) req.params = result.data.params;

      next();
    } catch (error) {
      logger.error({ error, path: req.path }, 'Validation middleware error');
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
