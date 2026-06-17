import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { intrusionDetection, resetIntrusionDetectionState } from '../../src/middleware/intrusionDetection';

vi.mock('../../src/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../../src/services/securityLog', () => ({ logSecurityEvent: vi.fn() }));

describe('intrusionDetection', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    resetIntrusionDetectionState();
    mockRequest = { method: 'GET', path: '/api/health', ip: '127.0.0.1', url: '/api/health', body: {}, headers: { 'user-agent': 'Mozilla/5.0' } };
    mockResponse = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    mockNext = vi.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    resetIntrusionDetectionState();
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

  it('should not block loopback traffic in development', () => {
    process.env.NODE_ENV = 'development';
    (mockRequest as any).ip = '::ffff:127.0.0.1';
    (mockRequest as any).body = { messages: [{ content: 'Use ..\\docs\\readme.md on Windows' }] };

    for (let i = 0; i < 20; i += 1) {
      intrusionDetection(mockRequest as Request, mockResponse as Response, mockNext);
    }

    expect(mockResponse.status).not.toHaveBeenCalledWith(403);
    expect(mockNext).toHaveBeenCalledTimes(20);
  });

  it('should not treat Windows-style paths in JSON bodies as attacks in production', () => {
    process.env.NODE_ENV = 'production';
    (mockRequest as any).ip = '203.0.113.50';
    (mockRequest as any).method = 'PATCH';
    (mockRequest as any).url = '/api/conversation/threads/abc';
    (mockRequest as any).path = '/api/conversation/threads/abc';
    (mockRequest as any).body = { title: 'Fix ..\\server\\config' };

    for (let i = 0; i < 20; i += 1) {
      intrusionDetection(mockRequest as Request, mockResponse as Response, mockNext);
    }

    expect(mockResponse.status).not.toHaveBeenCalledWith(403);
    expect(mockNext).toHaveBeenCalledTimes(20);
  });

  it('should block repeated URL path traversal in production', () => {
    process.env.NODE_ENV = 'production';
    (mockRequest as any).ip = '203.0.113.50';
    (mockRequest as any).url = '/api/../../../etc/passwd';
    (mockRequest as any).path = '/api/../../../etc/passwd';

    for (let i = 0; i < 12; i += 1) {
      intrusionDetection(mockRequest as Request, mockResponse as Response, mockNext);
    }

    expect(mockResponse.status).toHaveBeenCalledWith(403);
  });
});
