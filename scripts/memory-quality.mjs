#!/usr/bin/env node
/**
 * Memory Quality release gate.
 * Usage: npm run test:memory-quality
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'apps/server');

const r = spawnSync(
  'npx',
  ['vitest', 'run', 'tests/services/memoryQuality/', '--reporter=verbose'],
  { cwd: server, stdio: 'inherit', env: { ...process.env, VITEST: 'true' } },
);

process.exit(r.status ?? 1);
