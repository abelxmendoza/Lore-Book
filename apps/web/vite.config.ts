import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    sourcemap: true, // Always include source maps for debugging
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
