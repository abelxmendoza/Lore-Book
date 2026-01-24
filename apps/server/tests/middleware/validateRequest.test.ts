import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest, validateBody } from '../../src/middleware/validateRequest';

vi.mock('../../src/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

describe('validateRequest', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { body: {}, query: {}, params: {}, path: '/api/test', method: 'POST' };
    mockResponse = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    mockNext = vi.fn();
  });

  it('should call next when validation passes', () => {
    const schema = z.object({ body: z.object({ name: z.string() }) });
    (mockRequest as any).body = { name: 'x' };
    validateRequest(schema)(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should return 400 when validation fails', () => {
    const schema = z.object({ body: z.object({ name: z.string() }) });
    (mockRequest as any).body = {};
    validateRequest(schema)(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect((mockResponse as any).json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Validation error', details: expect.any(Object) })
    );
  });
});

describe('validateBody', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { body: {}, query: {}, params: {}, path: '/api/test', method: 'POST' };
    mockResponse = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    mockNext = vi.fn();
  });

  it('should validate body only and call next when valid', () => {
    (mockRequest as any).body = { x: 1 };
    validateBody(z.object({ x: z.number() }))(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
