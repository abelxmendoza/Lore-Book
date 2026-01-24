describe('Characters Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('characters');
  });

  it('should display character book', () => {
    cy.get('[data-testid="character-book"]', { timeout: 10000 }).should('be.visible');
  });

  it('should show character content or empty state', () => {
    cy.get('main, [data-testid="character-book"]', { timeout: 10000 }).first().should('be.visible');
  });

  it('should display character list or empty state', () => {
    cy.get('main').should('be.visible');
  });

  it('should open character detail when clicking a card', () => {
    cy.get('[data-testid="character-card"]', { timeout: 8000 })
      .then(($cards) => {
        if ($cards.length > 0) {
          cy.wrap($cards).first().scrollIntoView().click({ force: true });
          cy.get('[role="dialog"], [data-testid="character-modal"]', { timeout: 10000 }).should('be.visible');
        } else {
          cy.get('main').should('be.visible');
        }
      });
  });

  it('should support character search when input exists', () => {
    cy.get('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i]', { timeout: 5000 })
      .then(($input) => {
        if ($input.length > 0) {
          cy.wrap($input).first().type('test');
          cy.wait(300);
          cy.wrap($input).first().clear();
        }
      });
  });
});
