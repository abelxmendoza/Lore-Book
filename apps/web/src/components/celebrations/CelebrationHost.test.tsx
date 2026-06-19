import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AddCelebrationOverlay } from './AddCelebrationOverlay';
import { CelebrationHost } from './CelebrationHost';
import { triggerCelebration } from '../../lib/celebrations';

describe('AddCelebrationOverlay', () => {
  it('renders skill celebration with label and xp', () => {
    render(
      <AddCelebrationOverlay
        variant="skill"
        label="Cello added to Skills"
        xp={35}
        durationMs={400}
      />
    );
    expect(screen.getByTestId('celebration-overlay-skill')).toBeInTheDocument();
    expect(screen.getByText('Cello added to Skills')).toBeInTheDocument();
    expect(screen.getByText('+35 XP')).toBeInTheDocument();
  });
});

describe('CelebrationHost', () => {
  it('shows overlay when celebration event fires', async () => {
    render(<CelebrationHost />);
    triggerCelebration({ variant: 'quest', label: 'Quest complete!', xp: 120, durationMs: 800 });
    await waitFor(() => {
      expect(screen.getByTestId('celebration-overlay-quest')).toBeInTheDocument();
    });
    expect(screen.getByText('Quest complete!')).toBeInTheDocument();
  });
});
