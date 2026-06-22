#!/usr/bin/env node
/**
 * Zip each skill folder under openai-skills/ for OpenAI Skills API upload.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const skillsRoot = path.join(root, 'openai-skills');
const distDir = path.join(skillsRoot, 'dist');

const SKILL_DIRS = ['character-card-audit', 'lorebook-rescan-ops'];

function assertSkillMd(dir) {
  const skillMd = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    throw new Error(`Missing SKILL.md in ${dir}`);
  }
}

function packageSkill(name) {
  const src = path.join(skillsRoot, name);
  assertSkillMd(src);
  fs.mkdirSync(distDir, { recursive: true });
  const zipPath = path.join(distDir, `${name}.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`cd "${skillsRoot}" && zip -r "${zipPath}" "${name}"`, { stdio: 'inherit' });
  return zipPath;
}

console.log('Packaging OpenAI skills…');
const artifacts = {};
for (const name of SKILL_DIRS) {
  const zipPath = packageSkill(name);
  artifacts[name] = zipPath;
  console.log(`  ✓ ${name} → ${zipPath}`);
}
console.log('Done.');
