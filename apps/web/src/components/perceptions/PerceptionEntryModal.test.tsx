import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PerceptionEntryModal } from './PerceptionEntryModal';

vi.mock('../../api/perceptions', () => ({
  perceptionApi: {
    createPerception: vi.fn(),
    updatePerception: vi.fn(),
  },
}));

describe('PerceptionEntryModal terminology', () => {
  it('asks how certain the user was instead of using confidence language', () => {
    render(
      <PerceptionEntryModal
        personName="Jamie"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Certainty')).toBeInTheDocument();
    expect(screen.getByText('30% certain')).toBeInTheDocument();
    expect(screen.queryByText(/confidence level/i)).not.toBeInTheDocument();
  });
});
