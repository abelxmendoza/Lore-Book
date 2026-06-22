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
import { errorHandler } from './middleware/errorHandler';
import { intrusionDetection } from './middleware/intrusionDetection';
import { tieredRateLimit } from './middleware/tieredRateLimit';
import { validateRequestSize, validateCommonPatterns } from './middleware/requestValidation';
import { inputSanitizer } from './middleware/sanitize';
import { secureHeaders } from './middleware/secureHeaders';
import { userIsolationGuard } from './middleware/userIsolationGuard';
import { registerRoutes, getDisabledRoutePaths } from './routes/routeRegistry';
import { runtimeRouter } from './routes/runtime';
import { handleStripeWebhook } from './routes/subscription';
import { handleOpenAiWebhook } from './routes/openaiWebhooks';
import { setupSwagger } from './swagger';
import { requestIdMiddleware } from './utils/requestId';
import { performSecurityCheck } from './utils/securityCheck';
import { getSchemaStatus, getMissingTables } from './db/schemaVerification';
import { schemaGuard } from './middleware/schemaGuard';
import { resolveBindHost } from './config/serverPort';
import { evaluateOrigin, getAllowedCorsOrigins } from './utils/corsPolicy';
import { buildHealthPayload, handleDbHealth } from './routes/health';
import { mcpRouter } from './routes/mcp';
import { mcpOAuthApproveRouter, mcpOAuthRouter } from './routes/mcpOAuth';

assertConfig();

// ── Process-level guards ───────────────────────────────────────────────────────
// The chat pipeline runs dozens of fire-and-forget async chains; a broken pipe
// on any background socket (EPIPE) was crashing the entire server mid-request.
// EPIPE/ECONNRESET are survivable (the peer went away); everything else is an
// unknown state and stays fatal.
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET') {
    logger.error({ err }, 'Survivable socket error (uncaught) — continuing');
    return;
  }
  logger.fatal({ err }, 'Uncaught exception — exiting');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection — continuing');
});

// SECURITY: Detect environment before any logic that uses it
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.API_ENV === 'dev';
const isProduction = !isDevelopment && (
  process.env.NODE_ENV === 'production' || process.env.API_ENV === 'production'
);

// Perform security check on startup
const securityCheck = performSecurityCheck();
if (!securityCheck.passed) {
  logger.error('🚨 Security check failed - server starting but may be vulnerable');
  if (isProduction) {
    logger.error('⚠️  PRODUCTION MODE: Fix security issues before deploying');
  }
}

const app = express();

// Configure Helmet with strict security in production, permissive in development
app.use(
  helmet({
    contentSecurityPolicy: isDevelopment ? {
      // More permissive CSP for development (allows hot reload, dev tools, etc.)
      directives: {
        defaultSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://*.supabase.co", "https://api.openai.com", "ws:", "wss:", "http://localhost:*"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      }
    } : {
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
    ? (origin, callback) => {
        // In development, allow all origins but log them for security awareness
        if (origin) {
          logger.debug({ origin }, 'CORS: Allowing origin in development');
        }
        callback(null, true);
      }
    : (origin, callback) => {
        // In production, only allow first-party origins, localhost, and Vercel previews.
        const decision = evaluateOrigin(origin, process.env);
        if (decision.allowed) {
          callback(null, true);
        } else {
          logger.warn(
            { origin, allowedOrigins: getAllowedCorsOrigins(process.env) },
            'CORS: Blocked request from unauthorized origin'
          );
          callback(new Error('Not allowed by CORS'));
        }
      },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'],
  maxAge: isDevelopment ? 86400 : 3600 // 24h in dev, 1h in prod
}));

// Stripe webhook: no auth, raw body (must be before express.json())
app.post(
  '/api/subscription/webhook',
  tieredRateLimit,
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// OpenAI webhook: background response completion (opt-in via OPENAI_WEBHOOK_SECRET)
app.post(
  '/api/webhooks/openai',
  tieredRateLimit,
  express.raw({ type: 'application/json' }),
  handleOpenAiWebhook
);

// Request size limits - larger in development
app.use(express.json({ limit: isDevelopment ? '50mb' : '1mb' }));
app.use(express.urlencoded({ extended: true, limit: isDevelopment ? '50mb' : '1mb' }));

// Request ID middleware (must be early in the chain)
app.use(requestIdMiddleware);

// Global tiered rate limits for every /api route (public + protected). Free in-memory;
// optional Supabase Postgres via RATE_LIMIT_BACKEND=postgres (no Redis).
app.use('/api', tieredRateLimit);

// Liveness: GET /api/health first so nothing else can return 500 for it (no auth, no DB)
const SERVER_START_TIME = Date.now();
app.get('/api/health', (_req, res) => {
  res.status(200).json(buildHealthPayload(SERVER_START_TIME));
});

// Database schema + storage health: status, missing tables, cached size probe (no auth)
app.get('/api/health/db', (req, res, next) => {
  void handleDbHealth(req, res).catch(next);
});

// Runtime diagnostics — public, no auth.
app.use('/api/runtime', runtimeRouter);

// LoreBook MCP memory platform (Bearer auth, no CSRF — external agent clients)
if (config.mcpEnabled) {
  app.use('/mcp', mcpRouter);
  if (config.mcpOAuthEnabled && config.mcpOAuthJwtSecret) {
    app.use(mcpOAuthRouter);
    app.use('/api/mcp/oauth', mcpOAuthApproveRouter);
    logger.info('MCP OAuth 2.1 enabled (/.well-known/oauth-authorization-server)');
  } else if (config.mcpOAuthEnabled) {
    logger.warn('ENABLE_MCP_OAUTH is on but MCP_OAUTH_JWT_SECRET is missing — OAuth routes disabled');
  }
  logger.info('MCP memory platform enabled at /mcp');
}

// Schema guard for ALL /api routes (including public): return 503 when DB tables missing (prevents 500/PGRST205 flood)
app.use('/api', (req, res, next) => {
  if (
    req.originalUrl === '/api/health' ||
    req.originalUrl === '/api/health/db' ||
    req.originalUrl.startsWith('/api/runtime/')
  ) return next();
  if (getSchemaStatus() === 'degraded') {
    return res.status(503).json({
      error: 'Database schema incomplete',
      message: 'Required tables are missing. Run migrations: ./scripts/run-base-migrations.sh',
      missingTables: getMissingTables(),
    });
  }
  next();
});

// Swagger API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Lore Book API Documentation',
}));

// Create protected routes router with auth middleware stack
const apiRouter = express.Router();

// Schema guard: return 503 when required DB tables are missing (prevents PGRST205 log flood)
apiRouter.use(schemaGuard);

// Security middleware stack - ALWAYS enabled in production
apiRouter.use(intrusionDetection); // Intrusion detection (blocks suspicious activity)
apiRouter.use(authMiddleware); // Authentication required for all API routes
apiRouter.use(userIsolationGuard); // Fail closed if a response contains another user's user_id
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

// Health check (unprotected — used to verify server is alive)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 503 for disabled EXPERIMENTAL routes — more useful than a generic 404.
// Fires before the 404 catch-all so callers know the route exists but is gated.
app.use('/api', (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const disabledPaths = getDisabledRoutePaths();
  const matchedDisabled = disabledPaths.find((p) =>
    req.path === p.replace(/^\/api/, '') || req.path.startsWith(p.replace(/^\/api/, '') + '/')
  );
  if (matchedDisabled) {
    return res.status(503).json({
      error: 'Feature not available in production mode',
      path: req.path,
      message: `${matchedDisabled} is an EXPERIMENTAL route disabled in this deployment. ` +
        'Set ENABLE_EXPERIMENTAL_RUNTIME=true to enable it.',
    });
  }
  return next();
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Global error handler (must be last)
app.use(errorHandler);

// Heavy boot work (schema verification, background jobs, engine scheduler).
// Runs AFTER the HTTP server is already listening so that a slow/unreachable
// Supabase at cold boot can never delay the port bind past Railway's healthcheck
// window. Previously this ran before app.listen(); a single slow schema probe on
// Railway would stall startup, fail the /api/health check, and crash-loop the
// container into a permanent 502.
async function runBootTasks(): Promise<void> {
  try {
    // Boot-time schema verification: mark DEGRADED if required tables missing
    const { verifySchema } = await import('./db/schemaVerification');
    const schemaResult = await verifySchema();
    if (!schemaResult.ok) {
      logger.warn(
        { missingTables: schemaResult.missingTables },
        'CRITICAL: Missing DB tables - system DEGRADED. Run: ./scripts/run-base-migrations.sh'
      );
      // Auto-retry after 5s — handles startup race where Supabase isn't fully ready yet
      setTimeout(async () => {
        const retry = await verifySchema();
        if (retry.ok) {
          logger.info('Schema re-verified OK after startup delay — system no longer DEGRADED');
        }
      }, 5000);
    }

    // CORE jobs — always run
    registerSyncJob();
    memoryExtractionWorker.start();

    // Crash recovery: re-enqueue durable ingestion jobs that were pending or
    // interrupted before a previous shutdown, so no message's memory is lost.
    void import('./services/ingestion/ingestionQueue')
      .then(({ ingestionQueue }) => ingestionQueue.recover())
      .catch((err) => logger.warn({ err }, 'Ingestion queue recovery failed'));

    // GroupDetectionWorker is DISABLED by default: it builds O(n²) co-occurrence
    // graphs + wide org fan-outs over each user's whole history and retains
    // never-evicted singleton caches, driving the process to a ~4 GB heap OOM
    // crash-loop (see docs/oom-root-cause-report.md). It is background enrichment
    // only — chat, memory, retrieval, threads, summaries, and life reconstruction
    // do NOT depend on it. Opt in explicitly once P1/P2 memory bounds land.
    if (process.env.ENABLE_GROUP_DETECTION === 'true') {
      const { groupDetectionWorker } = await import('./workers/groupDetectionWorker');
      groupDetectionWorker.start();
      logger.warn('GroupDetectionWorker ENABLED (ENABLE_GROUP_DETECTION=true) — monitor heap; known OOM risk until P1/P2 land');
    } else {
      logger.info('GroupDetectionWorker DISABLED (set ENABLE_GROUP_DETECTION=true to enable) — prevents the group-detection OOM crash-loop');
    }

    const { continuityEngineJob } = await import('./jobs/continuityEngineJob');
    continuityEngineJob.register();
    const { accessibilityDecayJob } = await import('./jobs/accessibilityDecayJob');
    accessibilityDecayJob.register();
    const { arcStabilityDecayJob } = await import('./jobs/arcStabilityDecayJob');
    arcStabilityDecayJob.register();
    logger.info('Core background jobs registered: sync, memoryExtraction, continuityEngine, accessibilityDecay, arcStabilityDecay');

    // EXPERIMENTAL jobs — gated behind ENABLE_EXPERIMENTAL_RUNTIME
    if (process.env.ENABLE_EXPERIMENTAL_RUNTIME === 'true') {
      const { insightGenerationJob } = await import('./jobs/insightGenerationJob');
      const { graphUpdateJob } = await import('./jobs/graphUpdateJob');
      const { valueEvolutionJob } = await import('./jobs/valueEvolutionJob');
      const { evolveRelationshipsJob } = await import('./jobs/evolveRelationshipsJob');
      const { episodicClosureJob } = await import('./jobs/episodicClosureJob');
      const { registerPersonalStrategyTrainingJob } = await import('./jobs/personalStrategyTrainingJob');
      const { registerEnrichmentJob } = await import('./jobs/enrichmentJob');
      insightGenerationJob.register();
      graphUpdateJob.register();
      valueEvolutionJob.register();
      evolveRelationshipsJob.register();
      episodicClosureJob.register();
      registerPersonalStrategyTrainingJob();
      registerEnrichmentJob();
      logger.info('Experimental background jobs registered (ENABLE_EXPERIMENTAL_RUNTIME=true)');
    } else {
      logger.info('Experimental jobs skipped (ENABLE_EXPERIMENTAL_RUNTIME not set)');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to register background jobs, continuing anyway');
  }

  // Engine scheduler: opt-in only — nightly runAll() is ~20 LLM calls per active user.
  const engineSchedulerEnabled =
    process.env.ENABLE_ENGINE_SCHEDULER === 'true' &&
    process.env.DISABLE_ENGINE_SCHEDULER !== 'true';
  if (engineSchedulerEnabled) {
    try {
      const { startEngineScheduler } = await import('./engineRuntime/scheduler');
      startEngineScheduler();
      logger.info('Engine scheduler started (runs daily at 2 AM)');
    } catch (error) {
      logger.warn({ error }, 'Failed to start engine scheduler, continuing anyway');
    }
  } else {
    logger.info(
      'Engine scheduler disabled (set ENABLE_ENGINE_SCHEDULER=true to run nightly engine batch)'
    );
  }
}

// Bind the port FIRST so the healthcheck (/api/health) is reachable immediately,
// then kick off boot tasks in the background. CJS requires an async IIFE only
// for the top-level awaits inside runBootTasks().
const BIND_HOST = resolveBindHost(process.env);
const server = app.listen(config.port, BIND_HOST, () => {
  logger.info(
    { port: config.port, host: BIND_HOST, nodeEnv: process.env.NODE_ENV ?? 'unknown' },
    `Lore Book API listening on ${BIND_HOST}:${config.port}`
  );
  const aiMode = process.env.DEV_AI_FALLBACK === 'true'
    ? '⚠️  AI Provider: FALLBACK MODE (DEV_AI_FALLBACK=true — no real inference)'
    : config.openAiKey
      ? '✅ AI Provider: OpenAI LIVE'
      : '❌ AI Provider: NO KEY — requests will fail';
  logger.info(aiMode);

  // Self health-probe: confirm the edge-facing /api/health is actually reachable
  // on the bound port. This catches the class of failure behind the 2026-06-18
  // outage (process "up" but unreachable on the expected port) at boot time
  // instead of via a user-reported 502. Non-fatal: log loudly and continue.
  void verifyOwnHealth(config.port);

  // Fire-and-forget: never let boot work block or crash the listening server.
  runBootTasks().catch((error) => {
    logger.error({ error }, 'Boot tasks failed — server still listening');
  });
});

async function verifyOwnHealth(port: number): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      logger.info({ port }, '✅ Self health-check passed (/api/health reachable on bound port)');
    } else {
      logger.error(
        { port, status: res.status },
        '🚨 Self health-check returned non-200 — the app may be unreachable to the platform edge'
      );
    }
  } catch (error) {
    logger.error(
      { port, error },
      '🚨 Self health-check could not reach /api/health on the bound port — ' +
        'verify the platform domain target port matches PORT or the edge will return 502'
    );
  }
}

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(
      `Port ${config.port} is already in use. ` +
      `Stop the other server (Ctrl+C in the terminal running "npm run dev") or set PORT to a different value.`
    );
  } else {
    logger.error({ error }, 'Failed to start server');
  }
  process.exit(1);
});

// Graceful shutdown: close the HTTP server (release port 4000) before exiting so
// restarts don't race on EADDRINUSE, and so `tsx watch` stops logging
// "Process hasn't exited. Killing process…" on every file change.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — closing server`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000).unref();
  });
}
