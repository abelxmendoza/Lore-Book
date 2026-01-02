/**
 * Developer Console Commands for Lore Keeper
 * Copy and paste these into the browser console (F12 or Cmd+Option+I)
 */

// ============================================
// API Health Check
// ============================================
async function checkAPIHealth() {
  try {
    const response = await fetch('http://localhost:4000/api/health');
    const data = await response.json();
    console.log('✅ API Health:', data);
    return data;
  } catch (error) {
    console.error('❌ API Health Check Failed:', error);
    return null;
  }
}

// ============================================
// Test Authentication
// ============================================
async function testAuth() {
  try {
    // Get current user from Supabase (if logged in)
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:4000';
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    if (!supabaseKey) {
      console.warn('⚠️ Supabase keys not configured');
      return null;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('❌ Auth Error:', error);
      return null;
    }
    
    console.log('✅ Current User:', user);
    return user;
  } catch (error) {
    console.error('❌ Auth Test Failed:', error);
    return null;
  }
}

// ============================================
// Test API Endpoints
// ============================================
async function testEndpoints() {
  const endpoints = [
    '/api/health',
    '/api/chronology',
    '/api/continuity',
    '/api/identity/pulse',
    '/api/relationships',
    '/api/recommendations',
    '/api/wisdom',
    '/api/learning',
    '/api/context',
    '/api/memory-consolidation',
    '/api/prediction',
    '/api/narrative',
    '/api/relationship-dynamics',
    '/api/intervention',
    '/api/goals',
    '/api/habits',
    '/api/decisions',
    '/api/resilience',
    '/api/influence',
    '/api/growth',
    '/api/legacy',
    '/api/values',
    '/api/dreams',
    '/api/emotion/eq/analyze',
    '/api/health/analyze',
    '/api/financial/analyze',
  ];
  
  console.log('🧪 Testing API Endpoints...');
  const results = {};
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`http://localhost:4000${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      results[endpoint] = {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      };
      
      if (response.ok) {
        console.log(`✅ ${endpoint}: ${response.status}`);
      } else {
        console.warn(`⚠️ ${endpoint}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      results[endpoint] = { error: error.message };
      console.error(`❌ ${endpoint}:`, error.message);
    }
  }
  
  console.table(results);
  return results;
}

// ============================================
// Check Server Status
// ============================================
async function checkServers() {
  console.log('🔍 Checking Server Status...');
  
  const servers = [
    { name: 'Backend API', url: 'http://localhost:4000/api/health' },
    { name: 'Frontend', url: 'http://localhost:5173' },
  ];
  
  for (const server of servers) {
    try {
      const response = await fetch(server.url);
      console.log(`✅ ${server.name}: Running (${response.status})`);
    } catch (error) {
      console.error(`❌ ${server.name}: Not accessible -`, error.message);
    }
  }
}

// ============================================
// View Local Storage
// ============================================
function viewLocalStorage() {
  console.log('📦 Local Storage:');
  console.table(localStorage);
  return Object.keys(localStorage).reduce((acc, key) => {
    try {
      acc[key] = JSON.parse(localStorage.getItem(key) || '');
    } catch {
      acc[key] = localStorage.getItem(key);
    }
    return acc;
  }, {});
}

// ============================================
// View Session Storage
// ============================================
function viewSessionStorage() {
  console.log('📦 Session Storage:');
  console.table(sessionStorage);
  return Object.keys(sessionStorage).reduce((acc, key) => {
    try {
      acc[key] = JSON.parse(sessionStorage.getItem(key) || '');
    } catch {
      acc[key] = sessionStorage.getItem(key);
    }
    return acc;
  }, {});
}

// ============================================
// Clear All Storage
// ============================================
function clearAllStorage() {
  localStorage.clear();
  sessionStorage.clear();
  console.log('🧹 Cleared all storage');
}

// ============================================
// Monitor Network Requests
// ============================================
function monitorNetwork() {
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    console.log(`🌐 Fetch: ${options.method || 'GET'} ${url}`, options);
    
    return originalFetch.apply(this, args)
      .then(response => {
        console.log(`✅ Response: ${url}`, response.status, response.statusText);
        return response;
      })
      .catch(error => {
        console.error(`❌ Error: ${url}`, error);
        throw error;
      });
  };
  
  console.log('👀 Network monitoring enabled');
}

// ============================================
// Quick Test Commands
// ============================================
console.log(`
🚀 Lore Keeper Developer Console Commands
==========================================

Available Functions:
  • checkAPIHealth()      - Check API health status
  • testAuth()            - Test authentication
  • testEndpoints()       - Test all API endpoints
  • checkServers()        - Check server status
  • viewLocalStorage()    - View local storage
  • viewSessionStorage()  - View session storage
  • clearAllStorage()     - Clear all storage
  • monitorNetwork()      - Monitor network requests

Quick Start:
  checkServers()
  checkAPIHealth()
`);

// Auto-run server check
checkServers();

