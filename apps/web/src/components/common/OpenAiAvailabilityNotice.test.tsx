import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  OpenAiAvailabilityLoginNote,
  OpenAiAvailabilitySessionBar,
  resetOpenAiAvailabilityNoticeDismissed,
} from './OpenAiAvailabilityNotice';

describe('OpenAiAvailabilityNotice', () => {
  beforeEach(() => {
    resetOpenAiAvailabilityNoticeDismissed();
  });

  it('renders login note with Google and sim messaging', () => {
    render(<OpenAiAvailabilityLoginNote />);
    expect(screen.getByText(/Live AI chat/i)).toBeInTheDocument();
    expect(screen.getByText(/Google sign-in/i)).toBeInTheDocument();
    expect(screen.getByText(/built-in chat sim/i)).toBeInTheDocument();
  });

  it('renders session bar and dismisses for the session', async () => {
    const user = userEvent.setup();
    render(<OpenAiAvailabilitySessionBar />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    await user.click(screen.getByTestId('openai-availability-notice-dismiss'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
