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
    // Desktop aside is first; assert nav buttons only (avoid mobile header h1 with lg:hidden)
    cy.get('aside').first().should('be.visible');
    cy.get('aside').first().within(() => {
      cy.get('button').contains('Chat').should('be.visible');
      cy.get('button').contains('Timeline').should('be.visible'); // "Omni Timeline"
      cy.get('button').contains('Characters').should('be.visible');
    });
  });

  it('should navigate between surfaces', () => {
    // Navigate to Timeline (sidebar label is "Omni Timeline")
    cy.contains('Omni Timeline').click();
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
    // Cmd/Ctrl + K should open search — dispatch keydown on document (main/body aren’t typeable)
    cy.window().then((win) => {
      const isMac = win.navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      win.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: isMac,
        ctrlKey: !isMac,
        code: 'KeyK',
        bubbles: true,
      }));
    });
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
