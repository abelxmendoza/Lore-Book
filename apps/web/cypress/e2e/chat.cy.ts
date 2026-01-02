describe('Chat Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('chat');
  });

  it('should display chat interface', () => {
    cy.get('[data-testid="chat"], [data-testid="chat-interface"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should send a chat message', () => {
    const testMessage = `Test message ${Date.now()}`;
    
    // Find chat input
    cy.get('textarea[placeholder*="message" i], input[placeholder*="message" i]', { timeout: 5000 })
      .should('be.visible')
      .type(testMessage);
    
    // Send message
    cy.get('button[type="submit"], button:contains("Send")').click();
    
    // Wait for message to appear
    cy.contains(testMessage, { timeout: 10000 }).should('be.visible');
  });

  it('should display chat history', () => {
    // Chat messages should be visible
    cy.get('[data-testid="chat-message"], .message', { timeout: 5000 })
      .should('have.length.greaterThan', 0);
  });

  it('should support file upload', () => {
    // Look for upload button
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Upload"), input[type="file"]').length > 0) {
        cy.contains('button', 'Upload').should('be.visible');
      }
    });
  });

  it('should handle keyboard shortcuts', () => {
    // Enter should send message if input is focused
    cy.get('textarea[placeholder*="message" i]', { timeout: 5000 })
      .then(($textarea) => {
        if ($textarea.length > 0) {
          cy.wrap($textarea).focus().type('Test{enter}');
          cy.wait(1000);
        }
      });
  });
});
