describe('Characters Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('characters');
  });

  it('should display character book', () => {
    cy.get('[data-testid="character-book"], [data-testid="characters"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should show main character', () => {
    cy.contains('Main Character', { timeout: 5000 }).should('be.visible');
  });

  it('should display character list', () => {
    // Characters should be listed
    cy.get('[data-testid="character-card"], [data-testid="character-item"]', { timeout: 5000 })
      .should('have.length.greaterThan', 0);
  });

  it('should open character detail modal', () => {
    cy.get('[data-testid="character-card"]', { timeout: 5000 })
      .first()
      .click();
    
    // Modal should open
    cy.get('[role="dialog"], [data-testid="character-modal"]', { timeout: 5000 })
      .should('be.visible');
  });

  it('should support character search', () => {
    cy.get('input[type="search"], input[placeholder*="search" i]', { timeout: 5000 })
      .then(($input) => {
        if ($input.length > 0) {
          cy.wrap($input).type('test');
          cy.wait(500);
          cy.wrap($input).clear();
        }
      });
  });
});
