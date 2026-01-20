#!/usr/bin/env node

/**
 * Chunk Dependency Check
 * Validates that React-dependent chunks are not split incorrectly
 * This prevents "React.forwardRef is undefined" errors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(process.cwd(), 'dist');
const assetsPath = path.join(distPath, 'assets');

const errors = [];
const warnings = [];

// React-dependent patterns that should NOT be in separate chunks
const REACT_DEPENDENT_PATTERNS = [
  /ui-vendor/i,
  /editor-vendor/i,
  /visualization-vendor/i,
  /route-/i,
  /chat-components/i,
  /character-components/i,
  /timeline-components/i,
];

// Allowed vendor chunks (non-React dependent)
const ALLOWED_VENDOR_CHUNKS = [
  /supabase-vendor/i,
  /monitoring-vendor/i,
];

function checkChunkDependencies() {
  console.log('🔍 Checking chunk dependencies...\n');

  if (!fs.existsSync(assetsPath)) {
    errors.push('Assets directory not found');
    return;
  }

  const files = fs.readdirSync(assetsPath);
  const jsFiles = files.filter(f => f.endsWith('.js'));

  // Check for forbidden React-dependent chunks
  for (const file of jsFiles) {
    for (const pattern of REACT_DEPENDENT_PATTERNS) {
      if (pattern.test(file)) {
        errors.push(
          `❌ Found React-dependent chunk: ${file}\n` +
          `   This chunk should be merged into the main bundle to prevent "React.forwardRef is undefined" errors.\n` +
          `   Check vite.config.ts manualChunks configuration.`
        );
      }
    }
  }

  // Check main bundle exists
  const mainBundle = jsFiles.find(f => f.startsWith('index-') && f.endsWith('.js'));
  if (!mainBundle) {
    errors.push('Main bundle (index-*.js) not found');
  } else {
    console.log(`✅ Main bundle found: ${mainBundle}`);
    
    // Check main bundle size (should be substantial if React is included)
    const mainBundlePath = path.join(assetsPath, mainBundle);
    const stats = fs.statSync(mainBundlePath);
    const sizeKB = stats.size / 1024;
    
    if (sizeKB < 100) {
      warnings.push(
        `⚠️  Main bundle is very small (${sizeKB.toFixed(2)}KB). ` +
        `React and dependencies should be in the main bundle.`
      );
    } else {
      console.log(`✅ Main bundle size: ${sizeKB.toFixed(2)}KB (React included)`);
    }
  }

  // Check HTML references
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    const htmlContent = fs.readFileSync(indexPath, 'utf8');
    
    // Check for forbidden chunk references in HTML
    for (const pattern of REACT_DEPENDENT_PATTERNS) {
      const matches = htmlContent.match(new RegExp(pattern.source, 'gi'));
      if (matches) {
        errors.push(
          `❌ HTML references React-dependent chunk: ${matches[0]}\n` +
          `   These chunks should be merged into the main bundle.`
        );
      }
    }

    // Check that main bundle is referenced
    if (!htmlContent.includes('index-') || !htmlContent.includes('.js')) {
      errors.push('HTML does not reference main JavaScript bundle');
    } else {
      console.log('✅ HTML correctly references main bundle');
    }
  }

  // Summary
  console.log('\n📊 Chunk Dependency Check Results:');
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(w => console.log(`   ${w}`));
  }

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => console.log(`   ${e}`));
    console.log('\n❌ Chunk dependency check FAILED!');
    console.log('   This build may cause "React.forwardRef is undefined" errors in production.');
    process.exit(1);
  } else {
    console.log('\n✅ Chunk dependency check PASSED!');
    console.log('   All React-dependent code is in the main bundle.');
  }
}

// Run check
checkChunkDependencies();
