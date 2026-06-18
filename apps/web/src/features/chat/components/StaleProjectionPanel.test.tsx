import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { StaleProjectionPanel } from './StaleProjectionPanel';

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ refreshed: 1, results: [{ refreshed: true, artifactId: 'bio-1' }] }),
}));

describe('StaleProjectionPanel', () => {
  it('renders stale summary nudge with actions', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <StaleProjectionPanel
          summary="your life summary may be outdated — review or refresh in What AI Knows"
          hints={[{ id: 'bio-1', type: 'biography_snapshot', title: 'Biography snapshot' }]}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('stale-projection-panel')).toBeInTheDocument();
    expect(screen.getByText(/life summary may be outdated/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open What AI Knows/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Refresh summaries/i }));
    expect(await screen.findByText(/Refreshed 1 summar/i)).toBeInTheDocument();
  });
});
