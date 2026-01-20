#!/usr/bin/env node

/**
 * Security Headers Check
 * Validates that production builds have proper security headers configured
 */

import https from 'https';
import http from 'http';

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://lore-keeper-web.vercel.app';
const REQUIRED_HEADERS = [
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'strict-transport-security',
];

const RECOMMENDED_HEADERS = [
  'x-xss-protection',
  'referrer-policy',
  'permissions-policy',
];

function checkSecurityHeaders(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, { timeout: 10000 }, (res) => {
      const headers = res.headers;
      const issues = [];
      const warnings = [];

      // Check required headers
      for (const header of REQUIRED_HEADERS) {
        if (!headers[header]) {
          issues.push(`❌ Missing required header: ${header}`);
        } else {
          console.log(`✅ ${header}: ${headers[header]}`);
        }
      }

      // Check recommended headers
      for (const header of RECOMMENDED_HEADERS) {
        if (!headers[header]) {
          warnings.push(`⚠️  Missing recommended header: ${header}`);
        } else {
          console.log(`✅ ${header}: ${headers[header]}`);
        }
      }

      // Validate CSP
      if (headers['content-security-policy']) {
        const csp = headers['content-security-policy'];
        if (csp.includes("'unsafe-inline'") && !csp.includes('nonce-')) {
          warnings.push('⚠️  CSP allows unsafe-inline without nonce (security risk)');
        }
        if (csp.includes("'unsafe-eval'")) {
          warnings.push('⚠️  CSP allows unsafe-eval (security risk)');
        }
      }

      resolve({ issues, warnings, statusCode: res.statusCode });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log('🔒 Security Headers Check');
  console.log('='.repeat(50));
  console.log(`Checking: ${PRODUCTION_URL}\n`);

  try {
    const { issues, warnings, statusCode } = await checkSecurityHeaders(PRODUCTION_URL);

    if (statusCode !== 200) {
      console.error(`❌ HTTP Status: ${statusCode}`);
      process.exit(1);
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      warnings.forEach(w => console.log(`   ${w}`));
    }

    if (issues.length > 0) {
      console.log('\n❌ Security Issues:');
      issues.forEach(i => console.log(`   ${i}`));
      console.log('\n❌ Security headers check FAILED!');
      process.exit(1);
    } else {
      console.log('\n✅ Security headers check PASSED!');
    }
  } catch (error) {
    console.error(`❌ Failed to check security headers: ${error.message}`);
    console.error('   This check requires network access to production URL.');
    process.exit(1);
  }
}

// Only run if explicitly requested (not in CI by default)
if (process.env.CHECK_SECURITY_HEADERS === 'true') {
  main();
} else {
  console.log('ℹ️  Security headers check skipped (set CHECK_SECURITY_HEADERS=true to enable)');
}
