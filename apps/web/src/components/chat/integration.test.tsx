import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChatFirstInterface } from '../../features/chat/components/ChatFirstInterface';

describe('Chat Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render chat interface', async () => {
    render(
      <BrowserRouter>
        <ChatFirstInterface />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /message/i })).toBeInTheDocument();
    });
  });

  it('should handle message submission', async () => {
    const { user } = await import('@testing-library/user-event');
    const userEvent = user.setup();

    render(
      <BrowserRouter>
        <ChatFirstInterface />
      </BrowserRouter>
    );

    const input = await screen.findByRole('textbox', { name: /message/i });
    await userEvent.type(input, 'Test message');
    
    const submitButton = screen.getByRole('button', { name: /send/i });
    await userEvent.click(submitButton);

    // Wait for message to appear
    await waitFor(() => {
      expect(screen.getByText('Test message')).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
