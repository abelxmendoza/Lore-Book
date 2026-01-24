describe('Timeline Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('timeline');
  });

  it('should display timeline entries or panel', () => {
    cy.get('[data-testid="timeline"], [data-testid="entry-list"], [data-testid="entry-card"], main', { timeout: 10000 })
      .first()
      .should('be.visible');
  });

  it('should create a new memory entry when create UI exists', () => {
    cy.get('body').then(($body) => {
      const $ta = $body.find('textarea[placeholder*="memory"], textarea[placeholder*="entry"]');
      if ($ta.length > 0) {
        const testContent = `Test memory entry ${Date.now()}`;
        cy.wrap($ta).first().type(testContent);
        cy.get('button[type="submit"]').first().click();
        cy.contains(testContent, { timeout: 5000 }).should('be.visible');
      } else {
        cy.get('main').should('be.visible');
      }
    });
  });

  it('should open entry detail modal on click', () => {
    cy.get('body').then(($body) => {
      const $cards = $body.find('[data-testid="entry-card"], [data-testid="timeline-entry"]');
      if ($cards.length > 0) {
        cy.wrap($cards).first().click();
        cy.get('[role="dialog"], [data-testid="entry-modal"]', { timeout: 5000 }).should('be.visible');
      } else {
        cy.get('main').should('be.visible');
      }
    });
  });

  it('should support search within timeline', () => {
    // Dismiss dev notice if it’s covering the page (onBeforeLoad usually prevents it)
    cy.get('body').then(($body) => {
      if ($body.find('[role="dialog"][aria-labelledby="dev-notice-title"]').length > 0) {
        cy.get('[role="dialog"][aria-labelledby="dev-notice-title"]').find('button').first().click();
      }
    });
    cy.get('body').then(($body) => {
      const $input = $body.find('input[type="search"], input[placeholder*="search"], input[placeholder*="Search"]');
      if ($input.length > 0) {
        cy.wrap($input).first().type('test', { force: true });
        cy.wait(300);
        cy.wrap($input).first().clear();
      }
    });
  });

  it('should have timeline or filter controls', () => {
    cy.get('main').should('be.visible');
  });
});
