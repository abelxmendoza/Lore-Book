import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Mirror vite.config.ts: monorepo contracts source locally; vendored mirror otherwise.
const monorepoContracts = path.resolve(__dirname, '../../packages/api-contracts/src/index.ts');
const webContracts = path.resolve(__dirname, './src/lib/api-contracts/index.ts');
const contractsEntry = fs.existsSync(monorepoContracts) ? monorepoContracts : webContracts;

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.integration.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/e2e/**',
      '**/cypress/**',
      '**/*.e2e.{ts,tsx}',
      '**/*.spec.{ts,tsx}', // Exclude Playwright spec files
      '**/scripts/**', // Exclude script files
    ],
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
        '**/mockData/**',
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lorebook/api-contracts': contractsEntry,
    },
  },
});

