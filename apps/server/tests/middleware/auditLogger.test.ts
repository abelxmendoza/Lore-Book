import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { auditLogger } from '../../src/middleware/auditLogger';

vi.mock('../../src/services/securityLog', () => ({
  logSecurityEvent: vi.fn(),
  redactSensitive: vi.fn((v: string) => v),
}));

describe('auditLogger', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { method: 'GET', path: '/api/test', ip: '127.0.0.1', headers: {} };
    mockResponse = { statusCode: 200, on: vi.fn((_ev: string, fn: () => void) => { (mockResponse as any)._onFinish = fn; return mockResponse; }) };
    mockNext = vi.fn();
  });

  it('should call next', () => {
    auditLogger(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should register finish handler on res', () => {
    auditLogger(mockRequest as Request, mockResponse as Response, mockNext);
    expect((mockResponse as any).on).toHaveBeenCalledWith('finish', expect.any(Function));
  });
});
