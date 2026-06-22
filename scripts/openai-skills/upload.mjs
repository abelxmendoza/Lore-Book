#!/usr/bin/env node
/**
 * Upload packaged skills to OpenAI Skills API and write openai-skills/manifest.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const skillsRoot = path.join(root, 'openai-skills');
const distDir = path.join(skillsRoot, 'dist');
const manifestPath = path.join(skillsRoot, 'manifest.json');

const SKILL_DIRS = [
  { folder: 'character-card-audit', envKey: 'OPENAI_SKILL_CHARACTER_CARD_AUDIT_ID' },
  { folder: 'lorebook-rescan-ops', envKey: 'OPENAI_SKILL_RESCAN_OPS_ID' },
];

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error('OPENAI_API_KEY is required');
  process.exit(1);
}

async function uploadZip(zipPath, label) {
  const form = new FormData();
  const blob = new Blob([fs.readFileSync(zipPath)], { type: 'application/zip' });
  form.append('files', blob, path.basename(zipPath));

  const res = await fetch('https://api.openai.com/v1/skills', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed for ${label} (${res.status}): ${text}`);
  }

  return res.json();
}

async function createVersion(skillId, zipPath, label) {
  const form = new FormData();
  const blob = new Blob([fs.readFileSync(zipPath)], { type: 'application/zip' });
  form.append('files', blob, path.basename(zipPath));

  const res = await fetch(`https://api.openai.com/v1/skills/${skillId}/versions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Version upload failed for ${label} (${res.status}): ${text}`);
  }

  return res.json();
}

const existingManifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : { skills: {} };

const manifest = {
  updatedAt: new Date().toISOString(),
  skills: { ...existingManifest.skills },
};

console.log('Uploading OpenAI skills…');

for (const { folder, envKey } of SKILL_DIRS) {
  const zipPath = path.join(distDir, `${folder}.zip`);
  if (!fs.existsSync(zipPath)) {
    console.error(`Missing ${zipPath}. Run: npm run openai-skills:package`);
    process.exit(1);
  }

  const priorId = manifest.skills[folder]?.id;
  let result;
  if (priorId) {
    console.log(`  Updating ${folder} (${priorId})…`);
    result = await createVersion(priorId, zipPath, folder);
    manifest.skills[folder] = {
      id: priorId,
      envKey,
      latestVersion: result.version ?? result.latest_version,
      defaultVersion: result.default_version,
    };
  } else {
    console.log(`  Creating ${folder}…`);
    result = await uploadZip(zipPath, folder);
    manifest.skills[folder] = {
      id: result.id,
      envKey,
      latestVersion: result.latest_version,
      defaultVersion: result.default_version,
    };
  }

  console.log(`  ✓ ${folder} → ${manifest.skills[folder].id}`);
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nManifest: ${manifestPath}`);
console.log('\nSet these env vars on Railway:');
for (const { folder } of SKILL_DIRS) {
  const entry = manifest.skills[folder];
  console.log(`  ${entry.envKey}=${entry.id}`);
}
