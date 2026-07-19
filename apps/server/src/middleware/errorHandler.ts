import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

import { logger } from '../logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public errors?: any) {
    super(400, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Body-parser "request entity too large" → clean 413 instead of a generic 500.
  // The chat client shows this message next to the failed send.
  const maybeHttpError = err as Error & { type?: string; status?: number; limit?: number };
  if (maybeHttpError.type === 'entity.too.large') {
    logger.warn(
      { path: req.path, method: req.method, limit: maybeHttpError.limit },
      'Request body too large'
    );
    return res.status(413).json({
      error: 'Request too large',
      message: 'This message is too large to send. If you attached photos, try fewer or smaller photos.',
    });
  }

  // Log error
  if (err instanceof AppError && err.isOperational) {
    logger.warn({ err, path: req.path, method: req.method }, 'Operational error');
  } else {
    logger.error({ err, path: req.path, method: req.method }, 'Unexpected error');
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.flatten()
    });
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    };
    if ('apiCode' in err && typeof (err as { apiCode?: string }).apiCode === 'string') {
      body.code = (err as { apiCode: string }).apiCode;
    }
    return res.status(err.statusCode).json(body);
  }

  // Handle unknown errors
  const statusCode = 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      name: err.name 
    })
  });
};

// Async handler wrapper to catch errors in async routes
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

