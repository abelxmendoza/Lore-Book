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

describe('ChatMessage — entity chips on assistant replies', () => {
  const base: Message = {
    id: 'a1',
    role: 'assistant',
    content: 'It sounds like that visit meant a lot to you.',
    timestamp: new Date(),
  };

  it('shows entity chips below assistant messages when mentionedEntities are present', () => {
    renderMessage({
      ...base,
      mentionedEntities: [
        { id: 'c1', name: 'Tía Maria', type: 'character' },
        { id: 'l1', name: 'San Diego', type: 'location' },
      ],
    });

    expect(screen.getByText('detected:')).toBeInTheDocument();
    expect(screen.getByText('Tía Maria')).toBeInTheDocument();
    expect(screen.getByText('San Diego')).toBeInTheDocument();
  });

  it('does not show entity chips on user messages', () => {
    renderMessage({
      id: 'u1',
      role: 'user',
      content: 'I visited Tía Maria in San Diego.',
      timestamp: new Date(),
      mentionedEntities: [{ id: 'c1', name: 'Tía Maria', type: 'character' }],
    });

    expect(screen.queryByText('detected:')).not.toBeInTheDocument();
    expect(screen.queryByText('Tía Maria')).not.toBeInTheDocument();
  });

  it('hides chips when assistant message has no mentionedEntities', () => {
    renderMessage(base);
    expect(screen.queryByText('detected:')).not.toBeInTheDocument();
  });
});
