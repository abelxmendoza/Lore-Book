import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
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
        '**/mockData/**',
        '**/stories/**',
        '**/*.stories.{ts,tsx}',
      ],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,
      },
      // Enforce coverage on critical paths
      perFile: true,
      // Report uncovered lines
      reportOnFailure: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

