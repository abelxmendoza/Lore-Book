import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/tests/**',
        '**/logger.ts',
        '**/config.ts',
        '**/swagger*.ts',
        '**/scripts/**'
      ]
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Tests always use the vendored contracts SOURCE — CI installs the vendor
      // package whose exports point at dist/, which is only built on deploy.
      '@lorebook/api-contracts': path.resolve(__dirname, './vendor/api-contracts/src/index.ts')
    }
  },
  esbuild: {
    target: 'esnext'
  }
});

