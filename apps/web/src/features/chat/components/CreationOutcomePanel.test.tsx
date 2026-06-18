import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CreationOutcomePanel } from './CreationOutcomePanel';

describe('CreationOutcomePanel', () => {
  it('renders create and defer outcomes', () => {
    render(
      <CreationOutcomePanel
        summary="started a record for Juan; needs clarification on Maria"
        outcomes={[
          { mention: 'Juan', action: 'create', authority: 'core' },
          {
            mention: 'Maria',
            action: 'defer',
            candidates: [{ character_id: 'c1', name: 'Maria Lopez' }],
            authority: 'core',
          },
        ]}
      />
    );

    expect(screen.getByTestId('creation-outcome-panel')).toBeInTheDocument();
    expect(screen.getByText(/Started a record for Juan/)).toBeInTheDocument();
    expect(screen.getByText(/Maria could match 1 existing person/)).toBeInTheDocument();
  });

  it('hides reject-only outcomes', () => {
    const { container } = render(
      <CreationOutcomePanel
        outcomes={[{ mention: 'the', action: 'reject', reason: 'junk' }]}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
