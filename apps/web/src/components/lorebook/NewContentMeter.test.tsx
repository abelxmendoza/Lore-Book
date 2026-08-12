import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewContentMeter } from './NewContentMeter';

describe('NewContentMeter', () => {
  it('renders the new-content count and growth percentage', () => {
    render(<NewContentMeter newCount={5} priorCount={10} sinceVersion={2} unitLabel="memories" />);
    expect(screen.getByText(/\+5 new memories since v2/i)).toBeInTheDocument();
    expect(screen.getByText(/\+50% growth/i)).toBeInTheDocument();
  });

  it('caps the visual fill at 100% when growth exceeds the prior count', () => {
    render(<NewContentMeter newCount={40} priorCount={10} sinceVersion={1} unitLabel="turns" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('treats a zero prior count as full growth rather than dividing by zero', () => {
    render(<NewContentMeter newCount={3} priorCount={0} sinceVersion={1} unitLabel="turns" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText(/\+100% growth/i)).toBeInTheDocument();
  });

  it('keeps a minimum visible fill for very small growth', () => {
    render(<NewContentMeter newCount={1} priorCount={500} sinceVersion={4} unitLabel="memories" />);
    const bar = screen.getByRole('progressbar');
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(8);
  });
});
