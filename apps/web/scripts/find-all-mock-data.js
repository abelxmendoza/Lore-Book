#!/usr/bin/env node

/**
 * Mock Data Finder Script
 * 
 * Searches for all mock/dummy/sample data in the codebase
 * Helps ensure all mock data is properly managed through the centralized service
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOCK_PATTERNS = [
  /dummy\w+/i,
  /mock\w+/i,
  /sample\w+/i,
  /test\w+[Dd]ata/i,
  /fake\w+/i,
  /demo\w+/i,
  /generateMock\w+/i,
  /createMock\w+/i,
  /getMock\w+/i,
  /getDummy\w+/i,
  /createDummy\w+/i,
];

const IGNORE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
];

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
}

function findMockData(dir, results = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!shouldIgnore(filePath)) {
        findMockData(filePath, results);
      }
    } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx'))) {
      if (!shouldIgnore(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          for (const pattern of MOCK_PATTERNS) {
            if (pattern.test(line)) {
              // Check if it's a variable declaration or function
              if (line.match(/(const|let|var|function|export)\s+.*(dummy|mock|sample|test|fake|demo)/i)) {
                results.push({
                  file: filePath,
                  line: index + 1,
                  content: line.trim(),
                  type: line.match(/dummy/i) ? 'dummy' :
                        line.match(/mock/i) ? 'mock' :
                        line.match(/sample/i) ? 'sample' :
                        line.match(/test/i) ? 'test' : 'fake'
                });
              }
            }
          }

          // Check for mock-user or dummy- patterns in content
          if (line.includes('mock-user') || line.includes('dummy-') || line.includes('mock-')) {
            if (!results.some(r => r.file === filePath && r.line === index + 1)) {
              results.push({
                file: filePath,
                line: index + 1,
                content: line.trim(),
                type: 'data-reference'
              });
            }
          }
        });
      }
    }
  }

  return results;
}

// Main execution
const srcDir = path.join(__dirname, '../src');
console.log('🔍 Searching for mock data in:', srcDir);
console.log('');

const results = findMockData(srcDir);

console.log(`Found ${results.length} potential mock data locations:\n`);

// Group by file
const byFile = {};
results.forEach(result => {
  if (!byFile[result.file]) {
    byFile[result.file] = [];
  }
  byFile[result.file].push(result);
});

// Print results
Object.keys(byFile).sort().forEach(file => {
  const relativePath = path.relative(srcDir, file);
  console.log(`📄 ${relativePath}`);
  byFile[file].forEach(result => {
    console.log(`   Line ${result.line}: ${result.content.substring(0, 80)}${result.content.length > 80 ? '...' : ''}`);
  });
  console.log('');
});

console.log(`\n✅ Total: ${results.length} mock data references found`);
console.log('\n💡 Tip: Make sure all these use the centralized mockDataService!');

