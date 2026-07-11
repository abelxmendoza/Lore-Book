import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatMessage, type Message } from './ChatMessage';

function renderMessage(message: Message) {
  return render(
    <MemoryRouter>
      <ChatMessage message={message} />
    </MemoryRouter>
  );
}

describe('ChatMessage — "Noted." signature', () => {
  const base: Message = {
    id: 'n1',
    role: 'assistant',
    content: 'Noted.',
    timestamp: new Date(),
  };

  it('renders the glowing signature bubble for a bare "Noted." reply', () => {
    renderMessage(base);
    const bubble = screen.getByTestId('chat-message-noted');
    expect(bubble).toBeInTheDocument();
    expect(bubble.querySelector('.chat-bubble-noted')).not.toBeNull();
    expect(screen.getByText('Noted.')).toHaveClass('chat-noted-text');
  });

  it('renders the signature bubble when server metadata marks it, regardless of content', () => {
    renderMessage({
      ...base,
      id: 'n2',
      content: 'Noted.',
      metadata: { signature: 'noted' },
    });
    expect(screen.getByTestId('chat-message-noted')).toBeInTheDocument();
  });

  it('keeps the provenance ref visible under the signature', () => {
    renderMessage({ ...base, id: 'n3', ref: '12.4.1' });
    expect(screen.getByTestId('message-ref')).toHaveTextContent('#12.4.1');
  });

  it('does NOT treat ordinary assistant replies as the signature', () => {
    renderMessage({
      ...base,
      id: 'n4',
      content: 'Noted. I also want to add that this matters because of what you said before.',
    });
    expect(screen.queryByTestId('chat-message-noted')).not.toBeInTheDocument();
  });

  it('does NOT treat a user message saying Noted. as the signature', () => {
    renderMessage({ ...base, id: 'n5', role: 'user' });
    expect(screen.queryByTestId('chat-message-noted')).not.toBeInTheDocument();
  });
});
