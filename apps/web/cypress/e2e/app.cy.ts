describe('Lore Keeper App - Core Functionality', () => {
  beforeEach(() => {
    cy.loginAsGuest();
  });

  it('should load the app successfully', () => {
    cy.waitForApp();
    cy.get('#root').should('be.visible');
    cy.get('main, [role="main"]').should('be.visible');
  });

  it('should display the sidebar navigation', () => {
    cy.get('aside, nav').should('be.visible');
    cy.contains('Chat').should('be.visible');
    cy.contains('Timeline').should('be.visible');
  });

  it('should navigate between surfaces', () => {
    // Navigate to Timeline
    cy.contains('Timeline').click();
    cy.url().should('include', '/timeline');
    cy.waitForApp();

    // Navigate to Chat
    cy.contains('Chat').click();
    cy.url().should('include', '/chat');
    cy.waitForApp();

    // Navigate to Characters
    cy.contains('Characters').click();
    cy.url().should('include', '/characters');
    cy.waitForApp();
  });

  it('should handle keyboard shortcuts', () => {
    // Cmd/Ctrl + K should open search
    cy.get('body').type('{meta}k');
    cy.url().should('include', '/search');
  });

  it('should be responsive', () => {
    // Test mobile viewport
    cy.viewport(375, 667);
    cy.waitForApp();
    cy.get('main, [role="main"]').should('be.visible');

    // Test tablet viewport
    cy.viewport(768, 1024);
    cy.waitForApp();

    // Test desktop viewport
    cy.viewport(1280, 720);
    cy.waitForApp();
  });
});
