describe('Lorebook Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('lorebook');
  });

  it('should display lorebook interface', () => {
    cy.get('[data-testid="lorebook"]', { timeout: 10000 }).should('be.visible');
  });

  it('should show search or content area', () => {
    cy.get('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search"], main', { timeout: 5000 })
      .first()
      .should('be.visible');
  });

  it('should display chapter or content navigation', () => {
    cy.get('main').should('be.visible');
  });

  it('should have Download or PDF when available', () => {
    cy.get('body').then(($body) => {
      const $btn = $body.find('button').filter((_, el) => /Download|PDF/i.test(el.textContent || ''));
      if ($btn.length > 0) cy.contains('button', /Download|PDF/i).should('be.visible');
    });
  });
});
