import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { createCsrfTokenForUser } from '../middleware/csrf';
import { logSecurityEvent } from '../services/securityLog';

const router = Router();

/**
 * GET /api/security/csrf-token
 *
 * Pre-fetches a CSRF token for the authenticated user.
 * The frontend calls this once before its first POST/PUT/PATCH/DELETE so that
 * csrfProtection middleware does not reject the request with 403.
 *
 * In development, CSRF is disabled so this returns a placeholder.
 * In production, returns the live token stored for req.user.id.
 */
router.get('/csrf-token', requireAuth, (req: AuthenticatedRequest, res) => {
  const isDev = process.env.NODE_ENV === 'development' ||
    (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');

  if (isDev) {
    return res.json({ ok: true, csrfToken: null, note: 'CSRF disabled in development' });
  }

  const userId = req.user!.id;
  const token = createCsrfTokenForUser(userId);

  res.setHeader('X-CSRF-Token', token);

  logSecurityEvent('csrf_token_issued', { ip: req.ip, path: req.path, method: req.method });

  return res.json({ ok: true, csrfToken: token });
});

export const securityRouter = router;
