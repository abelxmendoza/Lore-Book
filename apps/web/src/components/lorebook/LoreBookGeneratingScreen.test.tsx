import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoreBookGeneratingScreen } from './LoreBookGeneratingScreen';

describe('LoreBookGeneratingScreen', () => {
  it('renders generating title and query', () => {
    render(<LoreBookGeneratingScreen query="my music journey" />);
    expect(screen.getByTestId('lorebook-generating-screen')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Generating LoreBook');
    expect(screen.getByText(/my music journey/)).toBeInTheDocument();
  });

  it('cycles stage messages', () => {
    render(<LoreBookGeneratingScreen />);
    expect(screen.getByText(/Gathering memories|Connecting people|Weaving chapters|Summoning your story/)).toBeInTheDocument();
  });
});
