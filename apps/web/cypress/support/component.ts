// ***********************************************************
// This example support/component.ts is processed and
// loaded automatically before your component test files.
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

import './commands';
import '@testing-library/cypress/add-commands';

// Hide fetch/XHR requests from command log
Cypress.on('uncaught:exception', (err) => {
  // Prevent Cypress from failing on known non-critical errors
  if (
    err.message.includes('ResizeObserver loop limit exceeded') ||
    err.message.includes('Non-Error promise rejection')
  ) {
    return false;
  }
  return true;
});
