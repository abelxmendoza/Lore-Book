import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { assertConfig, config } from './config';
import { swaggerSpec } from './config/swagger';
import { memoryExtractionWorker } from './jobs/memoryExtractionWorker';
import { registerSyncJob } from './jobs/syncJob';
import { logger } from './logger';
import { auditLogger } from './middleware/auditLogger';
import { authMiddleware } from './middleware/auth';
import { csrfTokenMiddleware, csrfProtection } from './middleware/csrf';
import { errorHandler , asyncHandler } from './middleware/errorHandler';
import { intrusionDetection } from './middleware/intrusionDetection';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { validateRequestSize, validateCommonPatterns } from './middleware/requestValidation';
import { inputSanitizer } from './middleware/sanitize';
import { secureHeaders } from './middleware/secureHeaders';
import { registerRoutes } from './routes/routeRegistry';
import { subscriptionRouter } from './routes/subscription';
import { setupSwagger } from './swagger';
import { requestIdMiddleware } from './utils/requestId';
import { performSecurityCheck } from './utils/securityCheck';

assertConfig();

// Perform security check on startup
const securityCheck = performSecurityCheck();
if (!securityCheck.passed) {
  logger.error('🚨 Security check failed - server starting but may be vulnerable');
  if (isProduction) {
    logger.error('⚠️  PRODUCTION MODE: Fix security issues before deploying');
  }
}

const app = express();
// SECURITY: Properly detect production environment
// Default to production for safety if NODE_ENV is not explicitly set to 'development'
const isDevelopment = process.env.NODE_ENV === 'development' || 
                      (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');
const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.API_ENV === 'production' ||
                     (!process.env.NODE_ENV && !process.env.API_ENV); // Default to production for safety

// Configure Helmet with strict security in production
app.use(
  helmet({
    contentSecurityPolicy: isDevelopment ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for some frameworks
        styleSrc: ["'self'", "'unsafe-inline'"], // Needed for Tailwind
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://*.supabase.co", "https://api.openai.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false, // Allow some third-party integrations
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);

// CORS - strict in production, permissive only in development
app.use(cors({
  origin: isDevelopment 
    ? true // Allow all origins in development
    : (origin, callback) => {
        // In production, only allow specific origins
        const allowedOrigins = [
          process.env.FRONTEND_URL,
          process.env.VITE_API_URL?.replace('/api', ''), // Remove /api if present
          'https://lorekeeper.app',
          'https://www.lorekeeper.app'
        ].filter(Boolean) as string[];
        
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn({ origin, allowedOrigins }, 'CORS: Blocked request from unauthorized origin');
          callback(new Error('Not allowed by CORS'));
        }
      },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'],
  maxAge: isDevelopment ? 86400 : 3600 // 24h in dev, 1h in prod
}));

// Stripe webhook endpoint (must be before body parser - needs raw body)
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }), subscriptionRouter);

// Request size limits - larger in development
app.use(express.json({ limit: isDevelopment ? '50mb' : '1mb' }));
app.use(express.urlencoded({ extended: true, limit: isDevelopment ? '50mb' : '1mb' }));

// Request ID middleware (must be early in the chain)
app.use(requestIdMiddleware);

// Swagger API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Lore Keeper API Documentation',
}));

// Create protected routes router with auth middleware stack
const apiRouter = express.Router();

// Security middleware stack - ALWAYS enabled in production
apiRouter.use(intrusionDetection); // Intrusion detection (blocks suspicious activity)
apiRouter.use(authMiddleware); // Authentication required for all API routes
apiRouter.use(csrfTokenMiddleware); // Generate CSRF tokens
apiRouter.use(validateRequestSize); // Validate request sizes
if (isProduction) {
  // CRITICAL: These security features MUST be enabled in production
  apiRouter.use(csrfProtection); // CSRF protection
  apiRouter.use(validateCommonPatterns); // Pattern validation (SQL injection, XSS, etc.)
  logger.info('🔒 Production security enabled: CSRF protection and pattern validation active');
} else {
  logger.warn('⚠️  Development mode: Some security features are relaxed');
}
apiRouter.use(rateLimitMiddleware); // Rate limiting
apiRouter.use(inputSanitizer); // Input sanitization
apiRouter.use(secureHeaders); // Additional security headers
apiRouter.use(auditLogger); // Security audit logging

// Register all routes using the route registry
// This prevents duplicates and ensures all routes are properly registered
registerRoutes(app, apiRouter);

// Mount protected routes under /api
app.use('/api', apiRouter);

// API Documentation (only in development or when enabled)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
  setupSwagger(app);
  logger.info('API documentation available at /api-docs');
}

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Global error handler (must be last)
app.use(errorHandler);

try {
  registerSyncJob();
  memoryExtractionWorker.start();
  const { insightGenerationJob } = await import('./jobs/insightGenerationJob');
  const { graphUpdateJob } = await import('./jobs/graphUpdateJob');
  const { continuityEngineJob } = await import('./jobs/continuityEngineJob');
  const { valueEvolutionJob } = await import('./jobs/valueEvolutionJob');
  const { registerPersonalStrategyTrainingJob } = await import('./jobs/personalStrategyTrainingJob');
  
  insightGenerationJob.register();
  graphUpdateJob.register();
  continuityEngineJob.register();
  valueEvolutionJob.register();
  registerPersonalStrategyTrainingJob();
} catch (error) {
  logger.warn({ error }, 'Failed to register background jobs, continuing anyway');
}

// Start engine scheduler (if enabled)
if (process.env.ENABLE_ENGINE_SCHEDULER === 'true') {
  try {
    const { startEngineScheduler } = await import('./engineRuntime/scheduler');
    startEngineScheduler();
    logger.info('Engine scheduler started');
  } catch (error) {
    logger.warn({ error }, 'Failed to start engine scheduler, continuing anyway');
  }
}

const server = app.listen(config.port, () => {
  logger.info(`Lore Keeper API listening on ${config.port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use. Please stop the other process or change the port.`);
  } else {
    logger.error({ error }, 'Failed to start server');
  }
  process.exit(1);
});
