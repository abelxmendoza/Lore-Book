import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
/// <reference types="vitest" />

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
} else {
  console.log('⚠️  Development mode: Environment variables not validated');
}
console.log(`📦 Node version: ${process.version}`);
console.log(`📁 Working directory: ${process.cwd()}`);

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react({ typescript: { ignoreBuildErrors: true } }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true, // Allow external connections
    hmr: {
      overlay: true, // Show error overlay
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
          // DO NOT split React into a separate chunk - keep it in the main bundle
          // This ensures React.forwardRef is always available when UI vendor chunks execute
          // The trade-off is a slightly larger main bundle, but it prevents runtime errors
          
          // UI libraries - these depend on React, so they can be in a separate chunk
          // React will already be loaded in the main bundle before these execute
          if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/lucide-react')) {
            return 'ui-vendor';
          }
          // Supabase and auth
          if (id.includes('node_modules/@supabase')) {
            return 'supabase-vendor';
          }
          // Monitoring and analytics
          if (id.includes('node_modules/@sentry') || id.includes('node_modules/posthog')) {
            return 'monitoring-vendor';
          }
          // Large visualization libraries (depend on React)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/react-force-graph')) {
            return 'visualization-vendor';
          }
          // Markdown and code editing (depend on React)
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/react-simple-code-editor') || id.includes('node_modules/highlight.js')) {
            return 'editor-vendor';
          }
          // Routes - split by feature
          if (id.includes('/routes/') || id.includes('/pages/')) {
            const routeMatch = id.match(/\/(routes|pages)\/([^/]+)/);
            if (routeMatch) {
              return `route-${routeMatch[2]}`;
            }
          }
          // Components - split large component directories
          if (id.includes('/components/chat/')) {
            return 'chat-components';
          }
          if (id.includes('/components/characters/')) {
            return 'character-components';
          }
          if (id.includes('/components/timeline/')) {
            return 'timeline-components';
          }
        },
      },
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
    ...(process.env.NODE_ENV === 'production' && {
      drop: ['console', 'debugger'],
      pure: ['console.log', 'console.debug', 'console.info'],
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
