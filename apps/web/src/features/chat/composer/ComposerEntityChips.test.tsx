import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ComposerEntityChips } from './ComposerEntityChips';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';

const confirmed: CertifiedEntityMatch = {
  id: 'uuid-abel',
  name: 'Abel',
  type: 'character',
  aliases: [],
  mentionKeys: ['abel'],
  status: 'confirmed',
  matchedLabel: 'Abel',
  matchKind: 'full',
};

const suggested: CertifiedEntityMatch = {
  id: 'sug:character:kelly',
  name: 'Kelly',
  type: 'character',
  aliases: [],
  mentionKeys: ['kelly'],
  status: 'suggestion',
  matchedLabel: 'Kelly',
  matchKind: 'prefix',
};

describe('ComposerEntityChips', () => {
  it('renders nothing when there are no entities', () => {
    const { container } = render(<ComposerEntityChips entities={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders confirmed and suggestion sections with test ids', () => {
    render(<ComposerEntityChips entities={[confirmed, suggested]} />);

    expect(screen.getByTestId('composer-entity-chips')).toBeInTheDocument();
    expect(screen.getByText(/Knowledge base loading/)).toBeInTheDocument();
    expect(screen.getByText(/pending review/)).toBeInTheDocument();
    expect(screen.getByTestId('composer-entity-chip-character-uuid-abel')).toHaveTextContent('Abel');
    expect(screen.getByTestId('composer-entity-chip-character-sug:character:kelly')).toHaveTextContent('Kelly');
    expect(screen.getByTestId('composer-entity-chip-character-sug:character:kelly')).toHaveTextContent('…');
  });

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(<ComposerEntityChips entities={[confirmed]} onDismiss={onDismiss} />);
    await user.click(screen.getByTestId('composer-entity-dismiss-character-uuid-abel'));

    expect(onDismiss).toHaveBeenCalledWith(confirmed);
  });
});
