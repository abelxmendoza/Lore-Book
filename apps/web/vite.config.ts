import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Validate environment variables at build time (production only)
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    console.error('❌ BUILD ERROR: Missing required environment variables:');
    missingEnvVars.forEach(envVar => {
      console.error(`   - ${envVar}`);
    });
    console.error('   Set these in Vercel Dashboard → Settings → Environment Variables');
    process.exit(1);
  }
  console.log('✅ Environment variables validated');
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
    // Optimize for development builds
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV === 'development', // Only in dev - protect source code in production
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
