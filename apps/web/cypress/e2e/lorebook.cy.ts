describe('Lorebook Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('lorebook');
  });

  it('should display lorebook interface', () => {
    cy.get('[data-testid="lorebook"], [data-testid="biography"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should show search bar', () => {
    cy.get('input[type="search"], input[placeholder*="search" i]', { timeout: 5000 })
      .should('be.visible');
  });

  it('should display chapter navigation', () => {
    cy.get('[data-testid="chapter-nav"], [data-testid="chapters"]', { timeout: 5000 })
      .then(($nav) => {
        if ($nav.length > 0) {
          cy.wrap($nav).should('be.visible');
        }
      });
  });

  it('should support PDF download', () => {
    cy.get('button:contains("Download"), button:contains("PDF")', { timeout: 5000 })
      .then(($btn) => {
        if ($btn.length > 0) {
          cy.wrap($btn).should('be.visible');
        }
      });
  });
});
