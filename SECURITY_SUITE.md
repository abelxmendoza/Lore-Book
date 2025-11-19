# Security Suite Implementation

## Overview

A comprehensive security suite has been implemented throughout the application to protect user privacy while maintaining full accessibility and development-friendly features.

## Security Features

### Backend Security

#### 1. **CSRF Protection** (`apps/server/src/middleware/csrf.ts`)
- ✅ CSRF token generation and validation
- ✅ **Development Mode**: Completely bypassed for easier testing
- ✅ Production: Full protection with token validation
- ✅ Supports both header and cookie-based tokens

#### 2. **Request Validation** (`apps/server/src/middleware/requestValidation.ts`)
- ✅ Request size limits (10MB production, 50MB development)
- ✅ Suspicious pattern detection (XSS, script injection)
- ✅ **Development Mode**: Pattern validation disabled
- ✅ Common validation schemas (pagination, date ranges)

#### 3. **Enhanced Secure Headers** (`apps/server/src/middleware/secureHeaders.ts`)
- ✅ Content Security Policy (CSP) with nonce support
- ✅ Strict Transport Security (HSTS)
- ✅ X-Frame-Options, X-Content-Type-Options
- ✅ **Development Mode**: Relaxed CSP for Vite HMR

#### 4. **Data Encryption Service** (`apps/server/src/services/encryption.ts`)
- ✅ AES-256-GCM encryption for sensitive data
- ✅ Secure token generation
- ✅ One-way hashing for passwords

#### 5. **Privacy Controls API** (`apps/server/src/routes/privacy.ts`)
- ✅ GDPR-compliant data export
- ✅ Account deletion with data cleanup
- ✅ Privacy settings management
- ✅ Data retention policies

#### 6. **Rate Limiting** (`apps/server/src/middleware/rateLimit.ts`)
- ✅ **Development**: 10,000 requests per 15 minutes
- ✅ **Production**: 100 requests per 15 minutes
- ✅ Per-user/IP tracking

### Frontend Security

#### 1. **XSS Protection** (`apps/web/src/lib/security.ts`)
- ✅ DOMPurify integration for HTML sanitization
- ✅ Input sanitization utilities
- ✅ Secure storage wrapper

#### 2. **CSRF Token Handling**
- ✅ Automatic CSRF token inclusion in API requests
- ✅ Development mode bypass

#### 3. **Privacy Settings UI** (`apps/web/src/components/security/PrivacySettings.tsx`)
- ✅ User-friendly privacy controls
- ✅ Data export functionality
- ✅ Account deletion interface
- ✅ Full accessibility support

### Accessibility Features

#### 1. **Accessibility Utilities** (`apps/web/src/lib/accessibility.ts`)
- ✅ Focus trap for modals
- ✅ Screen reader announcements
- ✅ Skip to main content
- ✅ Keyboard navigation helpers
- ✅ Focus management utilities

#### 2. **ARIA Support**
- ✅ Proper ARIA labels throughout
- ✅ Role attributes
- ✅ Live regions for dynamic content
- ✅ Keyboard navigation support

## Development Optimizations

### Backend Optimizations

1. **Relaxed Security in Development**
   - CSRF protection disabled
   - Pattern validation disabled
   - Larger request size limits (50MB vs 10MB)
   - Higher rate limits (10,000 vs 100)
   - CSP disabled for Vite HMR

2. **Better Error Messages**
   - Detailed error logging in development
   - Stack traces included
   - Helpful debugging information

### Frontend Optimizations

1. **Vite Configuration** (`apps/web/vite.config.ts`)
   - ✅ Faster HMR with optimized watch settings
   - ✅ Source maps always enabled
   - ✅ Pre-bundled dependencies
   - ✅ Optimized chunk splitting
   - ✅ Development-specific build optimizations

2. **Development Utilities** (`apps/web/src/lib/devUtils.ts`)
   - ✅ Development-only logging
   - ✅ Performance timing utilities
   - ✅ API request/response logging
   - ✅ Component render counting

3. **Development Styles** (`apps/web/src/styles/dev-only.css`)
   - ✅ Focus indicators for accessibility testing
   - ✅ Screen reader utilities
   - ✅ Skip links

## Security Middleware Stack

The middleware is applied in this order:

1. **Helmet** - Security headers (relaxed in dev)
2. **CORS** - Cross-origin requests (permissive in dev)
3. **Request Size Limits** - Body parsing (50MB in dev)
4. **Auth Middleware** - Authentication
5. **CSRF Token Generation** - Generate tokens (skipped in dev)
6. **Request Size Validation** - Validate sizes (relaxed in dev)
7. **CSRF Protection** - Validate tokens (skipped in dev)
8. **Pattern Validation** - XSS detection (skipped in dev)
9. **Rate Limiting** - Request throttling (lenient in dev)
10. **Input Sanitization** - Clean user input
11. **Secure Headers** - Additional headers
12. **Audit Logging** - Security event logging

## Privacy Features

### GDPR Compliance

- ✅ Right to access (data export)
- ✅ Right to erasure (account deletion)
- ✅ Data retention controls
- ✅ Privacy settings management
- ✅ Encryption of sensitive data

### Privacy Settings

Users can control:
- Data retention period (30-3650 days)
- Auto-delete after X days
- Analytics opt-in/opt-out
- Data sharing preferences
- Encryption settings

## Usage

### Backend

All security middleware is automatically applied. In development, security is relaxed for easier testing.

### Frontend

```typescript
import { sanitizeHtml, sanitizeInput } from '@/lib/security';
import { trapFocus, announceToScreenReader } from '@/lib/accessibility';
import { devLog, devTimer } from '@/lib/devUtils';

// Sanitize user input
const safeHtml = sanitizeHtml(userInput);
const safeText = sanitizeInput(userInput);

// Accessibility
const cleanup = trapFocus(modalElement);
announceToScreenReader('Operation completed');

// Development logging
devLog.log('Debug info');
const endTimer = devTimer.start('Operation');
// ... do work
endTimer();
```

## Environment Variables

No additional environment variables required. The security suite automatically detects development mode via `NODE_ENV`.

## Testing

In development mode:
- All security checks are bypassed or relaxed
- Detailed logging is enabled
- Error messages are more verbose
- Rate limits are much higher

In production mode:
- All security features are active
- Strict validation enforced
- Rate limits enforced
- Full encryption enabled

## Future Enhancements

- [ ] Two-factor authentication (2FA)
- [ ] Session management improvements
- [ ] Advanced threat detection
- [ ] Security audit logging dashboard
- [ ] Automated security scanning
- [ ] Penetration testing utilities

