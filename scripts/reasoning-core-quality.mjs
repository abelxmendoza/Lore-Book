#!/usr/bin/env node
/**
 * Reasoning core quality gate — Blueprint 21 Phases 1-3 (Conversation Goal
 * Tracker, Retrieval Auditor, Response Planner, Discourse Reasoner, Memory
 * Tier Gate, Milestone Detector, Reflection Generator, Retrieval
 * Compression, Response Ordering).
 * Usage: npm run test:reasoning-core-quality
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'apps/server');

const r = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    'src/services/conversationReasoning/conversationReasoning.test.ts',
    'src/services/conversationReasoning/responsePlanner.test.ts',
    'src/services/chat/systemPromptBuilder.antiEcho.test.ts',
    '--reporter=verbose',
  ],
  { cwd: server, stdio: 'inherit', env: { ...process.env, VITEST: 'true' } },
);

process.exit(r.status ?? 1);
