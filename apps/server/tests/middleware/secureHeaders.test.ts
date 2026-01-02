import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { secureHeaders } from '../../src/middleware/secureHeaders';

describe('Secure Headers Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      path: '/api/test'
    } as any;
    
    mockResponse = {
      setHeader: vi.fn()
    } as any;
    
    mockNext = vi.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.clearAllMocks();
  });

  it('should set security headers', () => {
    secureHeaders(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.stringContaining('max-age=63072000')
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.any(String)
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff'
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-Frame-Options',
      'DENY'
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-XSS-Protection',
      '1; mode=block'
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('should include nonce in CSP', () => {
    secureHeaders(mockRequest as Request, mockResponse as Response, mockNext);
    
    const cspCall = (mockResponse.setHeader as any).mock.calls.find(
      (call: any[]) => call[0] === 'Content-Security-Policy'
    );
    expect(cspCall).toBeDefined();
    expect(cspCall[1]).toContain("script-src 'self' 'nonce-");
  });

  it('should set X-CSP-Nonce header', () => {
    secureHeaders(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-CSP-Nonce',
      expect.any(String)
    );
  });

  it('should attach nonce to request object', () => {
    secureHeaders(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect((mockRequest as any).nonce).toBeDefined();
    expect(typeof (mockRequest as any).nonce).toBe('string');
  });

  it('should allow Vite HMR in development mode', () => {
    process.env.NODE_ENV = 'development';
    
    secureHeaders(mockRequest as Request, mockResponse as Response, mockNext);
    
    const cspCall = (mockResponse.setHeader as any).mock.calls.find(
      (call: any[]) => call[0] === 'Content-Security-Policy'
    );
    expect(cspCall[1]).toContain('ws://localhost:');
    expect(cspCall[1]).toContain('unsafe-eval');
  });

  it('should set Permissions-Policy header', () => {
    secureHeaders(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Permissions-Policy',
      expect.stringContaining('geolocation=()')
    );
  });

  it('should set Referrer-Policy header', () => {
    secureHeaders(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Referrer-Policy',
      'strict-origin-when-cross-origin'
    );
  });

  it('should generate unique nonces for each request', () => {
    const nonces: string[] = [];
    
    for (let i = 0; i < 5; i++) {
      secureHeaders(mockRequest as Request, mockResponse as Response, mockNext);
      nonces.push((mockRequest as any).nonce);
      vi.clearAllMocks();
    }
    
    // All nonces should be unique
    const uniqueNonces = new Set(nonces);
    expect(uniqueNonces.size).toBe(5);
  });
});

