#!/usr/bin/env node
/**
 * Find Unused Code Script
 * Identifies potentially unused routes, services, and exports
 * 
 * Usage: node scripts/find-unused-code.js
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../');

// Read all TypeScript files recursively
function getAllTsFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, dist, and test directories
      if (!['node_modules', 'dist', '.git', 'tests'].includes(file)) {
        getAllTsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

// Extract exports from a file
function getExports(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const exports = [];
    
    // Find export class/function/const
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push({
        name: match[1],
        type: 'named',
        file: filePath
      });
    }
    
    // Find export { ... } statements
    const exportBlockRegex = /export\s*\{([^}]+)\}/g;
    while ((match = exportBlockRegex.exec(content)) !== null) {
      const block = match[1];
      const names = block.split(',').map(n => {
        const trimmed = n.trim();
        // Handle "name as alias"
        return trimmed.split(/\s+as\s+/)[0];
      });
      
      names.forEach(name => {
        if (name && name !== 'type' && name !== 'interface') {
          exports.push({
            name: name.trim(),
            type: 'named',
            file: filePath
          });
        }
      });
    }
    
    // Find default exports
    const defaultExportRegex = /export\s+default\s+(?:class|function|const|let|var)\s+(\w+)/g;
    while ((match = defaultExportRegex.exec(content)) !== null) {
      exports.push({
        name: match[1],
        type: 'default',
        file: filePath
      });
    }
    
    return exports;
  } catch (error) {
    console.warn(`Error reading ${filePath}:`, error.message);
    return [];
  }
}

// Check if an export is used
function isExportUsed(exportName, exportFile, allFiles) {
  for (const file of allFiles) {
    if (file === exportFile) continue;
    
    try {
      const content = readFileSync(file, 'utf-8');
      
      // Check for import statements
      const importRegex = new RegExp(`import\\s+(?:.*\\s+from\\s+)?['"].*${exportName}.*['"]|import.*\\b${exportName}\\b`, 's');
      if (importRegex.test(content)) {
        return true;
      }
      
      // Check for require statements
      const requireRegex = new RegExp(`require\\(['"].*${exportName}.*['"]\\)`, 's');
      if (requireRegex.test(content)) {
        return true;
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }
  
  return false;
}

// Main analysis
function analyze() {
  console.log('🔍 Analyzing codebase for unused code...\n');
  
  const srcDir = join(projectRoot, 'src');
  const allFiles = getAllTsFiles(srcDir);
  
  console.log(`📊 Found ${allFiles.length} TypeScript files\n`);
  
  // Collect all exports
  const allExports = [];
  for (const file of allFiles) {
    const exports = getExports(file);
    allExports.push(...exports);
  }
  
  console.log(`📦 Found ${allExports.length} exports\n`);
  
  // Check which exports are unused
  const unusedExports = [];
  for (const exp of allExports) {
    if (!isExportUsed(exp.name, exp.file, allFiles)) {
      unusedExports.push(exp);
    }
  }
  
  if (unusedExports.length > 0) {
    console.log('⚠️  Potentially unused exports:\n');
    unusedExports.forEach(({ name, file }) => {
      const relativePath = relative(projectRoot, file);
      console.log(`   ${name} in ${relativePath}`);
    });
    console.log(`\n   Total: ${unusedExports.length} potentially unused exports`);
  } else {
    console.log('✅ No unused exports found');
  }
  
  console.log('\n📝 Note: This is a basic analysis.');
  console.log('   Some exports may be used dynamically or in tests.');
  console.log('   Always verify manually before removing code.');
}

analyze();

