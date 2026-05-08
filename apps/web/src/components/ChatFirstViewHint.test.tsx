import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import { ChatFirstViewHint } from './ChatFirstViewHint';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ChatFirstViewHint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chat-first messaging', () => {
    render(<ChatFirstViewHint />);
    expect(screen.getByText(/This view is built from your conversations/i)).toBeInTheDocument();
    expect(screen.getByText(/To add or change things here, bring it up in Chat/i)).toBeInTheDocument();
  });

  it('renders Go to Chat button', () => {
    render(<ChatFirstViewHint />);
    expect(screen.getByRole('button', { name: /Go to Chat/i })).toBeInTheDocument();
  });

  it('navigates to /chat when Go to Chat is clicked', async () => {
    const user = userEvent.setup();
    render(<ChatFirstViewHint />);
    const button = screen.getByRole('button', { name: /Go to Chat/i });
    await user.click(button);
    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });
});
