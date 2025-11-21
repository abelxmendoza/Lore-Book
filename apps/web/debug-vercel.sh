#!/bin/bash
# Debug script to simulate Vercel's build environment

set -e

echo "=== VERCEL BUILD SIMULATION ==="
echo ""

# Simulate Vercel's environment
cd "$(dirname "$0")"
echo "1. Current directory: $(pwd)"
echo ""

echo "2. Checking package.json:"
if [ -f "package.json" ]; then
  echo "   ✅ package.json exists"
  echo "   Dependencies count: $(grep -A 100 '"dependencies"' package.json | grep -c '":' || echo "0")"
  echo "   Has vite: $(grep -q '"vite"' package.json && echo "✅ YES" || echo "❌ NO")"
else
  echo "   ❌ package.json missing"
  exit 1
fi
echo ""

echo "3. Checking package-lock.json:"
if [ -f "package-lock.json" ]; then
  echo "   ✅ package-lock.json exists"
  echo "   Lines: $(wc -l < package-lock.json)"
  echo "   Contains vite: $(grep -q '"vite"' package-lock.json && echo "✅ YES" || echo "❌ NO")"
else
  echo "   ❌ package-lock.json missing"
fi
echo ""

echo "4. Testing npm install (dry-run):"
npm install --legacy-peer-deps --dry-run 2>&1 | grep -E "(added|removed|packages|vite)" | head -5 || echo "   (dry-run output suppressed)"
echo ""

echo "5. Checking if vite would be installed:"
npm install --legacy-peer-deps --dry-run 2>&1 | grep -q "vite" && echo "   ✅ vite would be installed" || echo "   ❌ vite would NOT be installed"
echo ""

echo "6. Testing actual install (this will modify node_modules):"
echo "   Running: npm install --legacy-peer-deps"
npm install --legacy-peer-deps 2>&1 | tail -3
echo ""

echo "7. Verifying vite binary:"
if [ -f "node_modules/.bin/vite" ]; then
  echo "   ✅ vite binary exists at: node_modules/.bin/vite"
  echo "   Version: $(node_modules/.bin/vite --version 2>&1 || echo "unknown")"
else
  echo "   ❌ vite binary missing"
fi
echo ""

echo "8. Testing build command:"
echo "   Running: npm run build"
if npm run build 2>&1 | grep -q "built in"; then
  echo "   ✅ Build successful"
else
  echo "   ❌ Build failed"
  npm run build 2>&1 | tail -10
fi
echo ""

echo "=== DIAGNOSIS COMPLETE ==="

