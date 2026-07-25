import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CreationOutcomePanel } from './CreationOutcomePanel';

vi.mock('../message/EntityClarificationChip', () => ({
  EntityClarificationChip: ({
    ambiguity,
    onResolved,
  }: {
    ambiguity: { surface_text: string };
    onResolved?: () => void;
  }) => (
    <button type="button" onClick={onResolved}>
      Clarify {ambiguity.surface_text}
    </button>
  ),
}));

describe('CreationOutcomePanel', () => {
  it('renders actionable defer clarification', async () => {
    const user = userEvent.setup();
    const onPrefill = vi.fn();

    render(
      <MemoryRouter>
        <CreationOutcomePanel
          messageId="msg-1"
          summary="needs clarification on Maria"
          onPrefill={onPrefill}
          outcomes={[
            {
              mention: 'Maria',
              action: 'defer',
              candidates: [{ character_id: 'c1', name: 'Maria Lopez' }],
              authority: 'core',
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Clarify Maria/i)).toBeInTheDocument();
    await user.click(screen.getByText(/Clarify Maria/i));
    expect(screen.queryByText(/Clarify Maria/i)).not.toBeInTheDocument();
  });

  it('labels an unconfirmed create outcome as a person candidate', () => {
    render(
      <MemoryRouter>
        <CreationOutcomePanel
          messageId="msg-1"
          outcomes={[
            { mention: 'Juan', action: 'create', entityId: 'char-1', authority: 'core' },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Person candidate: Juan/i })).toBeInTheDocument();
    expect(screen.queryByText(/Started a record/i)).not.toBeInTheDocument();
  });

  it('shows non-person mentions as routed domain candidates', () => {
    render(
      <MemoryRouter>
        <CreationOutcomePanel
          messageId="msg-1"
          outcomes={[
            {
              mention: 'Ska Horizon',
              action: 'route',
              entityType: 'event',
              persistence: 'candidate',
              authority: 'core',
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Routed Ska Horizon to event detection/i)).toBeInTheDocument();
  });

  it('labels existing-record resolution separately from an identity merge', () => {
    render(
      <MemoryRouter>
        <CreationOutcomePanel
          messageId="msg-1"
          outcomes={[
            { mention: 'Prima', action: 'merge', entityId: 'tool-1', entityName: 'Prima AI', authority: 'core' },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Resolved Prima as Prima AI/i })).toBeInTheDocument();
    expect(screen.queryByText(/Linked Prima/i)).not.toBeInTheDocument();
  });

  it('hides reject-only outcomes', () => {
    const { container } = render(
      <MemoryRouter>
        <CreationOutcomePanel
          messageId="msg-1"
          outcomes={[{ mention: 'the', action: 'reject', reason: 'junk' }]}
        />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
  });
});
