#!/usr/bin/env node

/**
 * Vercel Build Diagnostics Script
 * Runs before build to validate environment and provide detailed error messages
 * 
 * Note: Using .js extension with CommonJS for Node compatibility
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 VERCEL BUILD DIAGNOSTICS');
console.log('='.repeat(50));
console.log('');

// 1. Check Node version
const nodeVersion = process.version;
const requiredVersion = '20.x';
console.log(`📦 Node Version: ${nodeVersion}`);
if (!nodeVersion.startsWith('v20.')) {
  console.warn(`⚠️  WARNING: Node version should be ${requiredVersion}, got ${nodeVersion}`);
  console.warn(`   Please set Node version to 20.x in Vercel Dashboard → Project Settings → General`);
  console.warn(`   Continuing with current version, but this may cause issues...`);
  // Don't exit - allow build to proceed with warning
}
console.log(`✅ Node version check passed (with warning if not 20.x)`);
console.log('');

// 2. Check current directory
const cwd = process.cwd();
console.log(`📁 Current Directory: ${cwd}`);
console.log(`📁 Expected to be in: apps/web`);
if (!cwd.endsWith('apps/web')) {
  console.warn(`⚠️  WARNING: Not in apps/web directory. This may cause issues.`);
}
console.log('');

// 3. Check package.json exists
const packageJsonPath = path.join(cwd, 'package.json');
console.log(`📄 Checking package.json: ${packageJsonPath}`);
if (!fs.existsSync(packageJsonPath)) {
  console.error(`❌ ERROR: package.json not found at ${packageJsonPath}`);
  process.exit(1);
}
console.log(`✅ package.json exists`);
console.log('');

// 4. Check package.json contents
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
console.log(`📦 Package Name: ${packageJson.name}`);
console.log(`📦 Package Version: ${packageJson.version}`);

// Check for vite in dependencies
const hasVite = packageJson.dependencies?.vite || packageJson.devDependencies?.vite;
if (!hasVite) {
  console.error(`❌ ERROR: vite is not in dependencies or devDependencies`);
  console.error(`   Dependencies: ${Object.keys(packageJson.dependencies || {}).join(', ')}`);
  process.exit(1);
}
console.log(`✅ vite found in dependencies`);
console.log(`📊 Total dependencies: ${Object.keys(packageJson.dependencies || {}).length}`);
console.log(`📊 Total devDependencies: ${Object.keys(packageJson.devDependencies || {}).length}`);
console.log('');

// 5. Check package-lock.json
const packageLockPath = path.join(cwd, 'package-lock.json');
console.log(`📄 Checking package-lock.json: ${packageLockPath}`);
if (!fs.existsSync(packageLockPath)) {
  console.warn(`⚠️  WARNING: package-lock.json not found. This may cause inconsistent installs.`);
} else {
  const packageLock = fs.readFileSync(packageLockPath, 'utf8');
  if (packageLock.includes('"vite"')) {
    console.log(`✅ package-lock.json exists and contains vite`);
  } else {
    console.warn(`⚠️  WARNING: package-lock.json exists but doesn't contain vite`);
  }
}
console.log('');

// 6. Check node_modules
const nodeModulesPath = path.join(cwd, 'node_modules');
console.log(`📦 Checking node_modules: ${nodeModulesPath}`);
if (!fs.existsSync(nodeModulesPath)) {
  console.warn(`⚠️  WARNING: node_modules not found. Dependencies may not be installed.`);
} else {
  const vitePath = path.join(nodeModulesPath, 'vite');
  if (fs.existsSync(vitePath)) {
    console.log(`✅ vite is installed in node_modules`);
  } else {
    console.warn(`⚠️  WARNING: vite not found in node_modules`);
  }
}
console.log('');

// 7. Check vite.config.ts
const viteConfigPath = path.join(cwd, 'vite.config.ts');
console.log(`⚙️  Checking vite.config.ts: ${viteConfigPath}`);
if (!fs.existsSync(viteConfigPath)) {
  console.error(`❌ ERROR: vite.config.ts not found`);
  process.exit(1);
}
console.log(`✅ vite.config.ts exists`);
console.log('');

// 8. Check environment variables (build-time)
console.log(`🔐 Environment Variables Check:`);
const useMockData = String(process.env.VITE_USE_MOCK_DATA || '').toLowerCase().trim() === 'true';
console.log(`ℹ️  VITE_USE_MOCK_DATA: ${process.env.VITE_USE_MOCK_DATA || 'not set'} (useMockData: ${useMockData})`);
const requiredEnvVars = useMockData ? [] : ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const optionalEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missingEnvVars = [];

// Check required vars
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (!value) {
    console.error(`❌ ${envVar}: MISSING`);
    missingEnvVars.push(envVar);
  } else {
    console.log(`✅ ${envVar}: Present (${value.length} chars)`);
  }
});

// Check optional vars (for info)
if (useMockData) {
  optionalEnvVars.forEach(envVar => {
    const value = process.env[envVar];
    if (!value) {
      console.log(`⚠️  ${envVar}: MISSING (optional - using mock data)`);
    } else {
      console.log(`✅ ${envVar}: Present (${value.length} chars)`);
    }
  });
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    console.log(`ℹ️  Mock data mode enabled - Supabase variables are optional`);
  }
}

if (missingEnvVars.length > 0) {
  console.error('');
  console.error(`❌ ERROR: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error(`   These must be set in Vercel Dashboard → Settings → Environment Variables`);
  process.exit(1);
}
console.log('');

// 9. Check vercel.json
const vercelJsonPath = path.join(cwd, 'vercel.json');
console.log(`📄 Checking vercel.json: ${vercelJsonPath}`);
if (fs.existsSync(vercelJsonPath)) {
  const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  console.log(`✅ vercel.json exists`);
  console.log(`   Install Command: ${vercelJson.installCommand || 'default'}`);
  console.log(`   Build Command: ${vercelJson.buildCommand || 'default'}`);
  console.log(`   Output Directory: ${vercelJson.outputDirectory || 'default'}`);
} else {
  console.warn(`⚠️  WARNING: vercel.json not found`);
}
console.log('');

// 10. Check dist directory (will be created during build)
const distPath = path.join(cwd, 'dist');
console.log(`📁 Dist directory: ${distPath}`);
if (fs.existsSync(distPath)) {
  console.log(`   (exists, will be overwritten)`);
} else {
  console.log(`   (will be created during build)`);
}
console.log('');

// Summary
console.log('='.repeat(50));
console.log('✅ All pre-build checks passed!');
console.log('🚀 Proceeding with build...');
console.log('='.repeat(50));
console.log('');

