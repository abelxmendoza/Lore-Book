import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..', '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const secretKeys = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'X_API_BEARER_TOKEN',
  'MICROSOFT_GRAPH_CLIENT_SECRET',
  'ENCRYPTION_SALT'
];

const forbiddenPrefixes = ['NEXT_PUBLIC_', 'VITE_'];

for (const key of secretKeys) {
  for (const prefix of forbiddenPrefixes) {
    if (process.env[`${prefix}${key}`]) {
      console.error(`❌ Secret ${key} must not be exposed as ${prefix}${key}`);
      process.exit(1);
    }
  }
}

const secretValues = secretKeys
  .map((key) => process.env[key])
  .filter((value): value is string => Boolean(value && value.trim()));

if (!secretValues.length) {
  console.warn('⚠️  No secret values found to validate.');
  process.exit(0);
}

const forbiddenRoots = [path.join(rootDir, 'apps', 'web', 'src')];

const walk = (dir: string, files: string[] = []): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

const containsSecret = (filePath: string) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return secretValues.some((secret) => secret && content.includes(secret));
};

for (const root of forbiddenRoots) {
  if (!fs.existsSync(root)) continue;
  const files = walk(root);
  for (const file of files) {
    if (containsSecret(file)) {
      console.error(`❌ Secret value leaked into frontend source: ${path.relative(rootDir, file)}`);
      process.exit(1);
    }
  }
}

console.log('✅ Environment secrets validated: no leaks detected.');
