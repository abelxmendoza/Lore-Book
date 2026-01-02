// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Hide fetch/XHR requests from command log
Cypress.on('uncaught:exception', (err) => {
  // Prevent Cypress from failing on known non-critical errors
  if (
    err.message.includes('ResizeObserver loop limit exceeded') ||
    err.message.includes('Non-Error promise rejection') ||
    err.message.includes('ChunkLoadError')
  ) {
    return false;
  }
  return true;
});

// Set up global test configuration
beforeEach(() => {
  // Clear localStorage and sessionStorage
  cy.clearLocalStorage();
  cy.clearCookies();
  
  // Mock Supabase if needed
  cy.window().then((win) => {
    // Set mock data flag
    win.localStorage.setItem('VITE_USE_MOCK_DATA', 'true');
  });
});
