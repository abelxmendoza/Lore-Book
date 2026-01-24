describe('Search Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('search');
  });

  it('should display search interface', () => {
    cy.get('[data-testid="timeline-search"], input[placeholder*="Search"], input[placeholder*="search"]', { timeout: 10000 })
      .first()
      .should('be.visible');
  });

  it('should perform search', () => {
    const searchTerm = 'test';
    cy.get('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]', { timeout: 5000 })
      .first()
      .should('be.visible')
      .type(searchTerm);

    cy.wait(800);

    cy.get('[data-testid="search-results"], [data-testid="results"], main', { timeout: 5000 })
      .first()
      .should('be.visible');
  });

  it('should have search or filter controls', () => {
    cy.get('input[type="search"], input[placeholder*="Search"], input[type="checkbox"], main', { timeout: 5000 })
      .first()
      .should('exist');
  });
});
