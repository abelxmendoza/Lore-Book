#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
execSync('node scripts/openai-skills/package.mjs', { cwd: path.resolve(dir, '../..'), stdio: 'inherit' });
execSync('node scripts/openai-skills/upload.mjs', { cwd: path.resolve(dir, '../..'), stdio: 'inherit' });
