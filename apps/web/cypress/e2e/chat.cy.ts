describe('Chat Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('chat');
  });

  it('should display chat interface', () => {
    cy.get('textarea[placeholder*="Message"], textarea[placeholder*="Lore"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should send a chat message', () => {
    const testMessage = `Test message ${Date.now()}`;

    cy.get('textarea[placeholder*="Message"], textarea[placeholder*="Lore"]', { timeout: 5000 })
      .should('be.visible')
      .type(testMessage);

    cy.get('button[type="submit"]').scrollIntoView().click({ force: true }); // force: bypass overlay (e.g. "Using mock data")

    cy.contains(testMessage, { timeout: 10000 }).should('be.visible');
  });

  it('should display chat history or composer', () => {
    cy.get('textarea[placeholder*="Message"], textarea[placeholder*="Lore"], form', { timeout: 5000 })
      .should('exist');
  });

  it('should support file upload', () => {
    cy.get('button[aria-label*="Upload"], button[aria-label*="documents"]', { timeout: 5000 })
      .then(($btn) => {
        if ($btn.length > 0) cy.wrap($btn).first().should('be.visible');
      });
  });

  it('should have composer for keyboard input', () => {
    cy.get('textarea[placeholder*="Message"], textarea[placeholder*="Lore"]', { timeout: 5000 })
      .first()
      .should('be.visible');
  });
});
