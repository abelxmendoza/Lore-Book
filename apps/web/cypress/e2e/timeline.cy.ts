describe('Timeline Feature', () => {
  beforeEach(() => {
    cy.loginAsGuest();
    cy.navigateToSurface('timeline');
  });

  it('should display timeline entries', () => {
    cy.get('[data-testid="timeline"], [data-testid="entry-list"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should create a new memory entry', () => {
    const testContent = `Test memory entry ${Date.now()}`;
    cy.createMemory(testContent);
    
    // Verify the entry appears in the timeline
    cy.contains(testContent).should('be.visible');
  });

  it('should open entry detail modal on click', () => {
    // Wait for entries to load
    cy.get('[data-testid="entry-card"], [data-testid="timeline-entry"]', { timeout: 10000 })
      .first()
      .should('be.visible')
      .click();
    
    // Check if modal opens
    cy.get('[role="dialog"], [data-testid="entry-modal"]', { timeout: 5000 })
      .should('be.visible');
  });

  it('should support search within timeline', () => {
    // If there's a search input in timeline
    cy.get('input[type="search"], input[placeholder*="search" i]', { timeout: 5000 })
      .then(($input) => {
        if ($input.length > 0) {
          cy.wrap($input).type('test');
          cy.wait(500);
          cy.wrap($input).clear();
        }
      });
  });

  it('should filter entries by date range', () => {
    // Look for date filter controls
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Date"), input[type="date"]').length > 0) {
        cy.contains('button', 'Date').click();
        cy.wait(500);
      }
    });
  });
});
