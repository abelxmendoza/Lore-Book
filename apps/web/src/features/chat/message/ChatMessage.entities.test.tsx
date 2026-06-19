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

    expect(screen.getByText('detected')).toBeInTheDocument();
    expect(screen.getByText('Tía Maria')).toBeInTheDocument();
    expect(screen.getByText('San Diego')).toBeInTheDocument();
  });

  it('renders inline entity pills in user message text when thread entities are known', () => {
    renderMessage({
      id: 'u1',
      role: 'user',
      content: 'I visited Tía Maria in San Diego.',
      timestamp: new Date(),
      mentionedEntities: [{ id: 'c1', name: 'Tía Maria', type: 'character' }],
    });

    expect(screen.queryByText('detected:')).not.toBeInTheDocument();
    expect(screen.getByTestId('entity-mention-pill-character-c1')).toHaveTextContent('Tía Maria');
  });

  it('highlights entity names inside assistant message prose', () => {
    renderMessage({
      ...base,
      content: 'Your visit with Tía Maria in San Diego sounds meaningful.',
      mentionedEntities: [
        { id: 'c1', name: 'Tía Maria', type: 'character' },
        { id: 'l1', name: 'San Diego', type: 'location' },
      ],
    });

    expect(screen.getByTestId('entity-mention-pill-character-c1')).toHaveTextContent('Tía Maria');
    expect(screen.getByTestId('entity-mention-pill-location-l1')).toHaveTextContent('San Diego');
  });

  it('hides chips when assistant message has no mentionedEntities', () => {
    renderMessage(base);
    expect(screen.queryByText('detected:')).not.toBeInTheDocument();
  });

  it('shows relationship groups on user messages from ontology metadata', () => {
    renderMessage({
      id: 'u2',
      role: 'user',
      content: 'My cousin Marcus works at Armstrong Robotics.',
      timestamp: new Date(),
      metadata: {
        ontology_enrichment: {
          relationship_groups: [
            { scope: 'FAMILY', entityNames: ['Marcus'] },
            { scope: 'PROFESSIONAL', entityNames: ['Armstrong Robotics'] },
          ],
        },
      },
    });

    expect(screen.getByText('relationships')).toBeInTheDocument();
    expect(screen.getByText('family')).toBeInTheDocument();
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
    expect(screen.getByText('Armstrong Robotics')).toBeInTheDocument();
  });
});
