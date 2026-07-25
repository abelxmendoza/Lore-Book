import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LorebookTierModal } from './LorebookTierModal';
import { evaluateTimelineTierOffer } from '../../lib/lorebookTiers';

describe('LorebookTierModal', () => {
  it('shows tier details and lets the user compile an unlocked form', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const offer = evaluateTimelineTierOffer({
      eventCount: 3,
      uniqueDays: 2,
      wordCount: 90,
      subjectLabel: 'career',
    });

    render(
      <LorebookTierModal
        isOpen
        onClose={onClose}
        tierOffer={offer}
        onSelectForm={onSelect}
        subjectLabel="career"
      />,
    );

    expect(screen.getByText(/Compile a LoreBook/i)).toBeInTheDocument();
    expect(screen.getByText(/“career”/)).toBeInTheDocument();
    expect(screen.getByTestId('lorebook-tier-modal-card-vignette')).toBeInTheDocument();
    expect(screen.getByText(/^Best$/i)).toBeInTheDocument();

    await user.click(screen.getByTestId('lorebook-tier-modal-select-chapter'));
    expect(onSelect).toHaveBeenCalledWith('chapter');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps locked forms disabled', () => {
    const offer = evaluateTimelineTierOffer({
      eventCount: 2,
      uniqueDays: 1,
      wordCount: 40,
    });

    render(
      <LorebookTierModal
        isOpen
        onClose={() => {}}
        tierOffer={offer}
        onSelectForm={() => {}}
      />,
    );

    expect(screen.getByTestId('lorebook-tier-modal-select-epic')).toBeDisabled();
    expect(screen.getByTestId('lorebook-tier-modal-select-vignette')).not.toBeDisabled();
  });

  it('explains forms even when nothing is unlocked yet', () => {
    const offer = evaluateTimelineTierOffer({
      eventCount: 0,
      uniqueDays: 0,
      wordCount: 0,
      subjectLabel: 'robotics',
    });

    render(
      <LorebookTierModal
        isOpen
        onClose={() => {}}
        tierOffer={offer}
        onSelectForm={() => {}}
        subjectLabel="robotics"
      />,
    );

    expect(screen.getByText(/see what unlocks as you gather moments/i)).toBeInTheDocument();
    expect(screen.getByText(/Next: Vignette/i)).toBeInTheDocument();
    expect(screen.getByTestId('lorebook-tier-modal-select-vignette')).toBeDisabled();
    expect(screen.getByTestId('lorebook-tier-modal-card-epic')).toBeInTheDocument();
    expect(screen.getAllByText(/^Locked$/i).length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/^Unlocked$/i)).not.toBeInTheDocument();
  });

  it('does not paint locked forms as Unlocked when forceEnable is set', () => {
    const offer = evaluateTimelineTierOffer({
      eventCount: 0,
      uniqueDays: 0,
      wordCount: 0,
      subjectLabel: 'Amazon',
    });

    render(
      <LorebookTierModal
        isOpen
        onClose={() => {}}
        tierOffer={offer}
        onSelectForm={() => {}}
        subjectLabel="Amazon"
        forceEnable
      />,
    );

    expect(screen.getAllByText(/^Locked$/i).length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/^Unlocked$/i)).not.toBeInTheDocument();
    // forceEnable only enables compile actions — badges stay honest.
    expect(screen.getByTestId('lorebook-tier-modal-select-vignette')).not.toBeDisabled();
  });
});
