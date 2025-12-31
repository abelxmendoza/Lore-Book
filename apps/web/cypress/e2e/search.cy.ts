describe('Search Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('search');
  });

  it('should display search interface', () => {
    cy.get('[data-testid="search"], [data-testid="timeline-search"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should perform search', () => {
    const searchTerm = 'test';
    cy.get('input[type="search"]', { timeout: 5000 })
      .should('be.visible')
      .type(searchTerm);
    
    // Wait for results
    cy.wait(1000);
    
    // Check if results appear
    cy.get('[data-testid="search-results"], [data-testid="results"]', { timeout: 5000 })
      .then(($results) => {
        if ($results.length > 0) {
          cy.wrap($results).should('be.visible');
        }
      });
  });

  it('should support semantic search toggle', () => {
    cy.get('input[type="checkbox"], button:contains("semantic")', { timeout: 5000 })
      .then(($toggle) => {
        if ($toggle.length > 0) {
          cy.wrap($toggle).should('be.visible');
        }
      });
  });
});
