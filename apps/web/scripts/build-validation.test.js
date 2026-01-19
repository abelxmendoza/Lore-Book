#!/usr/bin/env node

/**
 * Build Validation Test
 * Tests that the build output is valid and won't cause black screens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(process.cwd(), 'dist');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: dist directory exists
test('dist directory exists', () => {
  assert(fs.existsSync(distPath), `dist directory not found at ${distPath}`);
});

// Test 2: index.html exists
test('index.html exists', () => {
  const indexPath = path.join(distPath, 'index.html');
  assert(fs.existsSync(indexPath), 'index.html not found');
});

// Test 3: index.html has root div
test('index.html contains root div', () => {
  const indexPath = path.join(distPath, 'index.html');
  const content = fs.readFileSync(indexPath, 'utf8');
  assert(content.includes('<div id="root">'), 'index.html missing root div');
});

// Test 4: index.html references built assets, not source files
test('index.html references built assets', () => {
  const indexPath = path.join(distPath, 'index.html');
  const content = fs.readFileSync(indexPath, 'utf8');
  
  // Should NOT reference source files
  assert(!content.includes('/src/main.tsx'), 'index.html still references source file');
  assert(!content.includes('/src/'), 'index.html references source directory');
  
  // Should reference built assets
  assert(content.includes('/assets/'), 'index.html missing asset references');
});

// Test 5: assets directory exists
test('assets directory exists', () => {
  const assetsPath = path.join(distPath, 'assets');
  assert(fs.existsSync(assetsPath), 'assets directory not found');
});

// Test 6: JavaScript files exist
test('JavaScript bundle files exist', () => {
  const assetsPath = path.join(distPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    const files = fs.readdirSync(assetsPath);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    assert(jsFiles.length > 0, 'No JavaScript bundle files found');
  }
});

// Test 7: CSS files exist
test('CSS files exist', () => {
  const assetsPath = path.join(distPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    const files = fs.readdirSync(assetsPath);
    const cssFiles = files.filter(f => f.endsWith('.css'));
    // CSS might be inlined, so this is optional
    if (cssFiles.length === 0) {
      console.warn('⚠️  No CSS files found (may be inlined)');
    }
  }
});

// Test 8: Build size is reasonable
test('Build size is reasonable', () => {
  function getSize(dir) {
    let size = 0;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getSize(filePath);
      } else {
        size += stats.size;
      }
    }
    return size;
  }
  
  const size = getSize(distPath);
  const sizeMB = size / 1024 / 1024;
  
  // Should be at least 100KB (indicates real build)
  assert(size > 100 * 1024, `Build size too small: ${sizeMB.toFixed(2)}MB`);
  
  // Should be less than 50MB (indicates no accidental source inclusion)
  assert(size < 50 * 1024 * 1024, `Build size too large: ${sizeMB.toFixed(2)}MB`);
});

// Run all tests
console.log('🔍 Running build validation tests...\n');

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   ${error.message}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\n❌ Build validation failed! This may cause black screens on deployment.');
  // Only exit if not running as a test (check for test environment)
  if (!process.env.VITEST && !process.env.NODE_ENV?.includes('test')) {
    process.exit(1);
  } else {
    throw new Error(`Build validation failed: ${failed} test(s) failed`);
  }
} else {
  console.log('\n✅ Build validation passed!');
  // Only exit if not running as a test
  if (!process.env.VITEST && !process.env.NODE_ENV?.includes('test')) {
    process.exit(0);
  }
}

