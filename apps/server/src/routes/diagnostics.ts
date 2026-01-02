import { Router, type Request, type Response } from 'express';
import { logger } from '../logger';
import { config } from '../config';

const router = Router();

/**
 * GET /api/diagnostics
 * Public diagnostic endpoint to help troubleshoot deployment issues
 * Returns non-sensitive information about the server configuration
 */
router.get('/', (req: Request, res: Response) => {
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.API_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                        (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');

  // Return diagnostic information (no sensitive data)
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'not set',
      apiEnv: process.env.API_ENV || 'not set',
      isProduction,
      isDevelopment,
    },
    server: {
      port: config.port,
      hasSupabase: !!config.supabaseUrl,
      hasOpenAI: !!config.openAiKey,
      hasServiceRoleKey: !!config.supabaseServiceRoleKey,
    },
    security: {
      authRequired: !isDevelopment || process.env.DISABLE_AUTH_FOR_DEV !== 'true',
      corsConfigured: !!process.env.FRONTEND_URL,
      rateLimitEnabled: process.env.DISABLE_RATE_LIMIT !== 'true',
      csrfEnabled: isProduction && process.env.DISABLE_CSRF !== 'true',
    },
    request: {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
      referer: req.headers.referer,
    },
    message: 'Server is running. Check security settings if experiencing issues.',
  });
});

/**
 * GET /api/diagnostics/cors
 * Test CORS configuration
 */
router.get('/cors', (req: Request, res: Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.VITE_API_URL?.replace('/api', ''),
    'https://lorekeeper.app',
    'https://www.lorekeeper.app',
  ].filter(Boolean);

  res.json({
    origin,
    allowedOrigins,
    isAllowed: !origin || allowedOrigins.includes(origin),
    message: !origin 
      ? 'No origin header (may be same-origin request)'
      : allowedOrigins.includes(origin)
        ? 'Origin is allowed'
        : 'Origin is NOT allowed - add to FRONTEND_URL or allowed origins',
  });
});

export default router;
