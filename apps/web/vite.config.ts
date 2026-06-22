/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Prefer monorepo server ontology in local dev; fall back to web-local copy for
// Vercel (CLI deploy uploads apps/web only — no ../server on the build machine).
const serverOntology = path.resolve(__dirname, '../server/src/services/ontology');
const webOntology = path.resolve(__dirname, './src/lib/ontology');
import fs from 'fs';
const ontologyRoot = fs.existsSync(serverOntology) ? serverOntology : webOntology;

// Validate environment variables at build time (production only)
// Note: For frontend-only demo, Supabase vars are optional (mock data will be used)
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars: string[] = [];
  const optionalEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  
  // Check if mock data is explicitly disabled (then Supabase is required)
  const useMockData = process.env.VITE_USE_MOCK_DATA !== 'false';
  
  if (!useMockData) {
    // If mock data is disabled, Supabase is required
    requiredEnvVars.push(...optionalEnvVars);
  }
  
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    console.error('❌ BUILD ERROR: Missing required environment variables:');
    missingEnvVars.forEach(envVar => {
      console.error(`   - ${envVar}`);
    });
    console.error('   Set these in Vercel Dashboard → Settings → Environment Variables');
    process.exit(1);
  }
  
  if (useMockData) {
    console.log('✅ Production build configured for frontend-only demo (mock data enabled)');
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
      console.log('⚠️  Supabase not configured - using mock data fallback');
    }
  } else {
    console.log('✅ Environment variables validated');
  }

  if (!process.env.VITE_API_URL) {
    console.warn('⚠️  VITE_API_URL is not set. The deployed app will have no backend until you set VITE_API_URL in Vercel to your API URL and redeploy. See DEPLOYMENT_CHECKLIST.md → Production connectivity.');
  }
} else {
  console.log('⚠️  Development mode: Environment variables not validated');
}
console.log(`📦 Node version: ${process.version}`);
console.log(`📁 Working directory: ${process.cwd()}`);

// Shared ref: when proxy errors (backend down), set true so middleware short-circuits /api calls.
const backendUnreachable = { current: false };
// Only used while backend is DOWN — serialises recovery probes so we don't flood a dead server.
let apiProbeInFlight = false;

/**
 * Vite dev-server middleware that handles a down backend gracefully.
 *
 * When backend is UP   (flag.current = false): every /api request passes through normally.
 * When backend is DOWN (flag.current = true):  only one recovery probe is forwarded at a
 *   time; all other /api requests get an immediate 503 to avoid log spam.
 *
 * The key fix: apiProbeInFlight previously blocked ALL concurrent requests, even when the
 * backend was healthy. That meant admin dashboard (4 parallel fetches) got 3x 503s on every
 * load. Now it only serialises probes during actual outages.
 */
function backendDownMiddlewarePlugin(flag: { current: boolean }) {
  return {
    name: 'backend-down-middleware',
    configureServer(server: any) {
      return () => {
        const middleware = (req: any, res: any, next: () => void) => {
          if (!req.url?.startsWith('/api')) return next();

          // Always let health checks through so the app can detect recovery.
          if (req.url === '/api/health' || req.url.startsWith('/api/health?')) {
            return next();
          }

          if (flag.current) {
            // Backend is DOWN — serialise recovery probes.
            if (apiProbeInFlight) {
              res.statusCode = 503;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Backend unavailable' }));
              return;
            }
            apiProbeInFlight = true;
            const origEnd = (res.end as Function).bind(res);
            res.end = (...args: unknown[]) => {
              apiProbeInFlight = false;
              return origEnd(...args);
            };
          }

          // Backend UP — pass through immediately, no throttling.
          next();
        };

        server.middlewares.stack.unshift({ route: '', handle: middleware });

        // Every 30 s, clear the down-flag so the next request acts as a fresh probe.
        setInterval(() => { flag.current = false; }, 30_000);
      };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    backendDownMiddlewarePlugin(backendUnreachable),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lorekeeper/ontology': ontologyRoot,
    },
  },
  server: {
    port: 5173,
    host: true, // Allow external connections
    hmr: {
      overlay: true, // Show error overlay
    },
    // Proxy /api to backend in dev so same-origin requests avoid CORS.
    // Use 127.0.0.1 to avoid Node 17+ IPv6 localhost issues (ECONNREFUSED).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        configure(proxy: any) {
          // When proxy errors (e.g. ECONNREFUSED), respond with 503 so client sees "unavailable" not 500
          proxy.on('error', (_err: any, _req: any, res: any) => {
            backendUnreachable.current = true;
            apiProbeInFlight = false;
            if (res && typeof res === 'object' && 'req' in res && !(res as { headersSent?: boolean }).headersSent && !(res as { writableEnded?: boolean }).writableEnded) {
              try {
                (res as { writeHead: (code: number, h: Record<string, string>) => void }).writeHead(503, { 'Content-Type': 'application/json' });
                (res as { end: (s: string) => void }).end(JSON.stringify({ error: 'Backend unavailable' }));
              } catch (_e) {
                // ignore
              }
            }
          });
          // When /api/health returns 2xx, backend is up again — clear flag so other /api routes are proxied
          proxy.on('proxyRes', (proxyRes: { statusCode?: number }, req: { url?: string }) => {
            const url = req?.url ?? '';
            const isHealth = url === '/api/health' || url.startsWith('/api/health?');
            const ok = proxyRes?.statusCode != null && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300;
            if (isHealth && ok) {
              backendUnreachable.current = false;
            }
          });
        },
      },
    },
    // Faster HMR in development
    watch: {
      usePolling: false,
      interval: 100,
    },
  },
  build: {
    // Production optimizations
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    sourcemap: process.env.NODE_ENV !== 'production', // Disable source maps in production for security
    rollupOptions: {
      output: {
        // CRITICAL FIX: Force React into the main entry chunk to ensure it's always available
        // This prevents UI vendor chunks from executing before React is defined
        manualChunks: (id) => {
          // CRITICAL: NEVER split React or React-DOM - they MUST stay in the main bundle
          // This ensures React.forwardRef is always available when UI vendor chunks execute
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react/jsx-runtime') ||
            id.includes('node_modules/react/jsx-dev-runtime') ||
            id.includes('node_modules/react-dom/client') ||
            id.includes('node_modules/react-dom/server')
          ) {
            // Return undefined to keep React in the main bundle
            return undefined;
          }
          
          // CRITICAL FIX: Don't split UI vendor - keep it in main bundle to ensure React is available
          // The ui-vendor chunk was executing before React was defined, causing "React.forwardRef is undefined"
          // Keeping it in the main bundle ensures React loads first
          // if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/lucide-react')) {
          //   return 'ui-vendor';
          // }
          // Supabase and auth
          if (id.includes('node_modules/@supabase')) {
            return 'supabase-vendor';
          }
          // Monitoring and analytics
          if (id.includes('node_modules/@sentry') || id.includes('node_modules/posthog')) {
            return 'monitoring-vendor';
          }
          // CRITICAL FIX: Don't split visualization vendor - keep it in main bundle to avoid React dependency issues
          // The visualization-vendor chunk depends on React, so it can have the same initialization order problems
          // if (id.includes('node_modules/recharts') || id.includes('node_modules/react-force-graph')) {
          //   return 'visualization-vendor';
          // }
          // CRITICAL FIX: Don't split editor vendor - keep it in main bundle to avoid initialization order issues
          // The editor-vendor chunk was causing "can't access lexical declaration before initialization" errors
          // Keeping it in the main bundle ensures proper initialization order
          // if (id.includes('node_modules/react-markdown') || id.includes('node_modules/react-simple-code-editor') || id.includes('node_modules/highlight.js')) {
          //   return 'editor-vendor';
          // }
          // CRITICAL FIX: Don't split routes or components - keep them in main bundle
          // Route chunks were causing "React.forwardRef is undefined" errors because they execute before React loads
          // Component chunks can have the same issue. Keep everything in main bundle for now.
          
          // Routes - merge into main bundle to avoid React dependency issues
          // if (id.includes('/routes/') || id.includes('/pages/')) {
          //   const routeMatch = id.match(/\/(routes|pages)\/([^/]+)/);
          //   if (routeMatch) {
          //     return `route-${routeMatch[2]}`;
          //   }
          // }
          // Components - merge into main bundle to avoid React dependency issues
          // if (id.includes('/components/chat/')) {
          //   return 'chat-components';
          // }
          // if (id.includes('/components/characters/')) {
          //   return 'character-components';
          // }
          // if (id.includes('/components/timeline/')) {
          //   return 'timeline-components';
          // }
          // Return undefined for everything else (including React) to keep in main bundle
          return undefined;
        },
      },
      // CRITICAL: Ensure main bundle loads before vendor chunks
      // This prevents "React is undefined" errors in vendor chunks
      preserveEntrySignatures: 'strict',
    },
    // Faster builds in development
    ...(process.env.NODE_ENV === 'development' && {
      minify: false,
    }),
  },
  optimizeDeps: {
    // Pre-bundle these for faster dev server startup
    // CRITICAL: Include React to ensure it's available before vendor chunks
    // This prevents UI vendor chunks from executing before React is defined
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      '@supabase/supabase-js',
      'vis-timeline',
      'vis-data',
    ],
    // Exclude these from pre-bundling (they're large or cause issues)
    exclude: ['@tanstack/react-virtual', 'jspdf'],
  },
  // Development-specific optimizations
  esbuild: {
    // Remove console.log in production (keep console.error and console.warn)
    // CRITICAL: Do NOT drop all console - we need console.error and console.warn for debugging
    ...(process.env.NODE_ENV === 'production' && {
      pure: ['console.log', 'console.debug', 'console.info'], // Only remove these, keep error/warn
      drop: ['debugger'], // Only drop debugger, not console
    }),
    // Faster builds in development
    ...(process.env.NODE_ENV === 'development' && {
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false,
    }),
  },
  // Vitest configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/e2e/**', // Exclude Playwright tests
      '**/*.e2e.spec.ts',
      '**/*.e2e.spec.tsx',
    ],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:5173',
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/__tests__/**',
        '**/dist/**',
        '**/build/**',
        '**/*.config.{ts,js}',
        '**/types/**',
        '**/*.d.ts',
      ],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
