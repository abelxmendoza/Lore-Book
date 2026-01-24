/// <reference types="cypress" />

// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to login as a guest user
       * @example cy.loginAsGuest()
       */
      loginAsGuest(): Chainable<void>;
      
      /**
       * Custom command to wait for app to be ready
       * @example cy.waitForApp()
       */
      waitForApp(): Chainable<void>;
      
      /**
       * Custom command to navigate to a surface
       * @example cy.navigateToSurface('timeline')
       */
      navigateToSurface(surface: string): Chainable<void>;
      
      /**
       * Custom command to create a memory entry
       * @example cy.createMemory('Test memory content')
       */
      createMemory(content: string): Chainable<void>;
    }
  }
}

const visitOptions = {
  onBeforeLoad: (win: Window) => {
    win.localStorage.setItem('dev-notice-dismissed', 'true');
    win.localStorage.setItem('VITE_USE_MOCK_DATA', 'true');
  },
};

Cypress.Commands.add('loginAsGuest', () => {
  cy.visit('/', visitOptions);
  // Wait for auth gate to load
  cy.get('body').should('be.visible');
  // If there's a guest login button, click it
  cy.get('body').then(($body) => {
    if ($body.find('button:contains("Continue as Guest")').length > 0) {
      cy.contains('button', 'Continue as Guest').click();
    }
  });
  cy.waitForApp();
});

Cypress.Commands.add('waitForApp', () => {
  // Wait for the app to be fully loaded
  cy.get('#root').should('be.visible');
  // Wait for main content to be visible
  cy.get('main, [role="main"]', { timeout: 15000 }).should('be.visible');
});

Cypress.Commands.add('navigateToSurface', (surface: string) => {
  // Navigate to a specific surface/page (use visitOptions to pre-dismiss dev notice)
  cy.visit(`/${surface}`, visitOptions);
  cy.waitForApp();
  // Verify we're on the correct surface
  cy.url().should('include', surface);
});

Cypress.Commands.add('createMemory', (content: string) => {
  cy.navigateToSurface('timeline');
  // Find the memory input/composer
  cy.get('textarea[placeholder*="memory" i], textarea[placeholder*="entry" i]', { timeout: 5000 })
    .should('be.visible')
    .first()
    .type(content);
  // Submit
  cy.get('button[type="submit"]').first().click();
  // Wait for the memory to be saved
  cy.contains(content, { timeout: 5000 }).should('be.visible');
});

export {};
