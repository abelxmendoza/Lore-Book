import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OmniTimelineErrorBanner } from './OmniTimelineErrorBanner';

describe('OmniTimelineErrorBanner', () => {
  it('renders alert with message', () => {
    render(<OmniTimelineErrorBanner message="Failed to load life arcs" />);
    expect(screen.getByTestId('omni-timeline-error')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load life arcs');
  });

  it('calls onRetry when retry is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<OmniTimelineErrorBanner message="Network error" onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides retry when no handler', () => {
    render(<OmniTimelineErrorBanner message="Error" />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
