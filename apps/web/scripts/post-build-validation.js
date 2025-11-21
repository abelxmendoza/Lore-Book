#!/usr/bin/env node

/**
 * Post-Build Validation Script
 * Runs after build to verify the build output is correct
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 POST-BUILD VALIDATION');
console.log('='.repeat(50));
console.log('');

const cwd = process.cwd();
const distPath = path.join(cwd, 'dist');

// 1. Check dist directory exists
console.log(`📁 Checking dist directory: ${distPath}`);
if (!fs.existsSync(distPath)) {
  console.error(`❌ ERROR: dist directory not found at ${distPath}`);
  console.error(`   Build may have failed or output directory is incorrect`);
  process.exit(1);
}
console.log(`✅ dist directory exists`);
console.log('');

// 2. Check for index.html
const indexHtmlPath = path.join(distPath, 'index.html');
console.log(`📄 Checking index.html: ${indexHtmlPath}`);
if (!fs.existsSync(indexHtmlPath)) {
  console.error(`❌ ERROR: index.html not found in dist directory`);
  process.exit(1);
}
console.log(`✅ index.html exists`);
console.log('');

// 3. Check for assets directory
const assetsPath = path.join(distPath, 'assets');
console.log(`📦 Checking assets directory: ${assetsPath}`);
if (!fs.existsSync(assetsPath)) {
  console.warn(`⚠️  WARNING: assets directory not found`);
} else {
  const assets = fs.readdirSync(assetsPath);
  console.log(`✅ assets directory exists with ${assets.length} files`);
  const jsFiles = assets.filter(f => f.endsWith('.js'));
  const cssFiles = assets.filter(f => f.endsWith('.css'));
  console.log(`   - JavaScript files: ${jsFiles.length}`);
  console.log(`   - CSS files: ${cssFiles.length}`);
}
console.log('');

// 4. Check dist directory size
try {
  const distSize = getDirectorySize(distPath);
  const distSizeMB = (distSize / 1024 / 1024).toFixed(2);
  console.log(`📊 Dist directory size: ${distSizeMB} MB`);
  if (distSize < 1000) {
    console.warn(`⚠️  WARNING: Dist directory is very small (${distSize} bytes). Build may be incomplete.`);
  }
} catch (err) {
  console.warn(`⚠️  Could not calculate dist size: ${err.message}`);
}
console.log('');

// 5. Validate index.html content
console.log(`🔍 Validating index.html content...`);
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
if (!indexHtml.includes('<div id="root">')) {
  console.warn(`⚠️  WARNING: index.html doesn't contain root div`);
}
if (!indexHtml.includes('src=')) {
  console.warn(`⚠️  WARNING: index.html doesn't contain script tags`);
} else {
  console.log(`✅ index.html contains expected structure`);
}
console.log('');

// Summary
console.log('='.repeat(50));
console.log('✅ Post-build validation complete!');
console.log(`📦 Build output: ${distPath}`);
console.log('='.repeat(50));
console.log('');

function getDirectorySize(dirPath) {
  let size = 0;
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  }
  
  return size;
}

