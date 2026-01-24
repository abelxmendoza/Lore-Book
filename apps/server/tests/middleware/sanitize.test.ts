import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { inputSanitizer } from '../../src/middleware/sanitize';

vi.mock('../../src/services/securityLog', () => ({ logSecurityEvent: vi.fn() }));

describe('inputSanitizer', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { body: {}, query: {}, params: {}, path: '/api/test', ip: '127.0.0.1', headers: {} };
    mockResponse = {};
    mockNext = vi.fn();
  });

  it('should call next', () => {
    inputSanitizer(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should strip SQL-like patterns from body', () => {
    (mockRequest as any).body = { q: "x union select * from users" };
    inputSanitizer(mockRequest as Request, mockResponse as Response, mockNext);
    expect((mockRequest as any).body.q).toBe('x  * from users');
  });

  it('should leave safe strings unchanged', () => {
    (mockRequest as any).body = { name: 'hello' };
    inputSanitizer(mockRequest as Request, mockResponse as Response, mockNext);
    expect((mockRequest as any).body.name).toBe('hello');
  });
});
