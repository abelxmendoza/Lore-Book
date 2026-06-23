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
  matchKind: 'full',
};

describe('ComposerEntityChips', () => {
  it('renders nothing when there are no entities', () => {
    const { container } = render(<ComposerEntityChips entities={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders compact confirm strip with confirmed and suggestion chips', () => {
    render(<ComposerEntityChips entities={[confirmed, suggested]} onConfirm={vi.fn()} />);

    expect(screen.getByTestId('composer-entity-chips')).toBeInTheDocument();
    expect(screen.getByText('Tap chip or ✓ to include')).toBeInTheDocument();
    expect(screen.getByTestId('composer-entity-chip-character-uuid-abel')).toHaveTextContent('Abel');
    expect(screen.getByTestId('composer-entity-chip-character-sug:character:kelly')).toHaveTextContent('Kelly');
  });

  it('calls onConfirm when a suggestion chip is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<ComposerEntityChips entities={[suggested]} onConfirm={onConfirm} />);
    await user.click(screen.getByTestId('composer-entity-chip-character-sug:character:kelly-confirm'));

    expect(onConfirm).toHaveBeenCalledWith(suggested);
  });

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(<ComposerEntityChips entities={[confirmed]} onDismiss={onDismiss} />);
    await user.click(screen.getByTestId('composer-entity-dismiss-character-uuid-abel'));

    expect(onDismiss).toHaveBeenCalledWith(confirmed);
  });

  it('only surfaces allowed kinds — hides skills/events from the strip', () => {
    const skill: CertifiedEntityMatch = {
      id: 'uuid-piano',
      name: 'Piano',
      type: 'skill',
      aliases: [],
      mentionKeys: ['piano'],
      status: 'confirmed',
      matchedLabel: 'Piano',
      matchKind: 'full',
    };
    render(<ComposerEntityChips entities={[confirmed, skill]} onDismiss={vi.fn()} />);
    // person/character shows, skill is filtered out
    expect(screen.getByTestId('composer-entity-chip-character-uuid-abel')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-entity-chip-skill-uuid-piano')).not.toBeInTheDocument();
  });

  it('dismisses a lexical preview chip with one tap', async () => {
    const user = userEvent.setup();
    const onDismissPreviewSpan = vi.fn();
    const span = {
      text: 'Coding Club',
      start: 9,
      end: 20,
      type: 'GROUP',
      colorKey: 'group',
      confidence: 0.8,
      temporary: true,
    } as const;

    render(
      <ComposerEntityChips
        entities={[]}
        text="I joined Coding Club"
        previewSpans={[span]}
        onDismissPreviewSpan={onDismissPreviewSpan}
      />,
    );
    await user.click(screen.getByTestId('lexical-preview-dismiss-GROUP-9'));
    expect(onDismissPreviewSpan).toHaveBeenCalledWith(span);
  });
});
