import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
  plugins: [react({ typescript: { ignoreBuildErrors: true } })],
  resolve: {
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
    minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
    sourcemap: process.env.NODE_ENV !== 'production', // Disable source maps in production for security
    // Remove console.log in production (keep console.error and console.warn)
    terserOptions: process.env.NODE_ENV === 'production' ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug', 'console.info'],
      },
    } : undefined,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-scroll-area'],
        },
      },
    },
    // Faster builds in development
    ...(process.env.NODE_ENV === 'development' && {
      minify: false,
      terserOptions: undefined,
    }),
  },
  optimizeDeps: {
    // Pre-bundle these for faster dev server startup
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
    ],
    // Exclude these from pre-bundling (they're large)
    exclude: ['@tanstack/react-virtual'],
  },
  // Development-specific optimizations
  esbuild: {
    // Faster builds in development
    ...(process.env.NODE_ENV === 'development' && {
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false,
    }),
  },
});
