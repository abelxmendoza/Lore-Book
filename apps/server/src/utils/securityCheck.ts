import { logger } from '../logger';
import { config } from '../config';

/**
 * Security startup check
 * Validates that production environment is properly secured
 */
export const performSecurityCheck = (): { passed: boolean; warnings: string[]; errors: string[] } => {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.API_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                        (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');

  // CRITICAL: Check if authentication is disabled in production
  if (isProduction && process.env.DISABLE_AUTH_FOR_DEV === 'true') {
    errors.push('🚨 CRITICAL: Authentication is disabled in production! Set DISABLE_AUTH_FOR_DEV=false');
  }

  // Check required environment variables in production
  if (isProduction) {
    const requiredVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
    ];

    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (!value || value.includes('placeholder') || value.includes('your-') || value === 'sk-xxx') {
        errors.push(`Missing or placeholder value for ${varName}`);
      }
    }

    // Check CORS configuration
    if (!process.env.FRONTEND_URL) {
      warnings.push('FRONTEND_URL not set - CORS may be too permissive');
    }

    // Check if secrets are exposed
    const exposedSecrets = [
      process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      process.env.VITE_OPENAI_API_KEY,
    ].filter(Boolean);

    if (exposedSecrets.length > 0) {
      errors.push('🚨 CRITICAL: Secrets exposed in VITE_ environment variables (will be exposed to frontend)');
    }
  }

  // Check for development settings in production
  if (isProduction) {
    if (process.env.NODE_ENV !== 'production') {
      warnings.push(`NODE_ENV is "${process.env.NODE_ENV}" but should be "production"`);
    }

    if (process.env.API_ENV === 'dev') {
      warnings.push('API_ENV is "dev" in production - this may disable security features');
    }
  }

  // Validate Supabase configuration
  if (config.supabaseUrl && !config.supabaseUrl.startsWith('https://')) {
    warnings.push('Supabase URL should use HTTPS in production');
  }

  // Check rate limiting
  if (isProduction && process.env.DISABLE_RATE_LIMIT === 'true') {
    errors.push('🚨 CRITICAL: Rate limiting is disabled in production!');
  }

  // Check CSRF protection
  if (isProduction && process.env.DISABLE_CSRF === 'true') {
    errors.push('🚨 CRITICAL: CSRF protection is disabled in production!');
  }

  // Log results
  if (errors.length > 0) {
    logger.error({ errors, warnings }, '🔒 Security check FAILED');
    errors.forEach(error => logger.error(error));
  } else if (warnings.length > 0) {
    logger.warn({ warnings }, '🔒 Security check passed with warnings');
    warnings.forEach(warning => logger.warn(warning));
  } else {
    logger.info('🔒 Security check passed');
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
};
