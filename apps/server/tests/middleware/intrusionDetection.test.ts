import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { intrusionDetection } from '../../src/middleware/intrusionDetection';

vi.mock('../../src/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../../src/services/securityLog', () => ({ logSecurityEvent: vi.fn() }));

describe('intrusionDetection', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { method: 'GET', path: '/api/health', ip: '127.0.0.1', url: '/api/health', body: {}, headers: { 'user-agent': 'Mozilla/5.0' } };
    mockResponse = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    mockNext = vi.fn();
  });

  it('should call next for normal request', () => {
    intrusionDetection(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should call next when url has no suspicious patterns', () => {
    (mockRequest as any).url = '/api/entries';
    (mockRequest as any).path = '/api/entries';
    intrusionDetection(mockRequest as Request, mockResponse as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
