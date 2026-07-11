#!/usr/bin/env node
/**
 * Session delta ranking gate.
 * Usage: npm run test:session-delta
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'apps/server');

const r = spawnSync(
  'npx',
  ['vitest', 'run', 'src/services/chat/sessionDelta.test.ts', '--reporter=verbose'],
  { cwd: server, stdio: 'inherit', env: { ...process.env, VITEST: 'true' } },
);

process.exit(r.status ?? 1);
