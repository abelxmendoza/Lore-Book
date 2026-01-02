import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage, type Message } from './ChatMessage';

describe('ChatMessage', () => {
  const mockUserMessage: Message = {
    id: '1',
    role: 'user',
    content: 'Hello, world!',
    timestamp: new Date()
  };

  const mockAssistantMessage: Message = {
    id: '2',
    role: 'assistant',
    content: 'Hello! How can I help you?',
    timestamp: new Date()
  };

  it('should render user message', () => {
    render(<ChatMessage message={mockUserMessage} />);
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
  });

  it('should render assistant message', () => {
    render(<ChatMessage message={mockAssistantMessage} />);
    expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
  });

  it('should render sources when available', () => {
    const messageWithSources: Message = {
      ...mockAssistantMessage,
      sources: [
        {
          type: 'entry',
          id: '1',
          title: 'Test Entry',
          snippet: 'Test snippet'
        }
      ]
    };

    render(<ChatMessage message={messageWithSources} />);
    expect(screen.getByText(/Sources/i)).toBeInTheDocument();
  });

  it('should render markdown content for assistant messages', () => {
    const markdownMessage: Message = {
      ...mockAssistantMessage,
      content: '# Heading\n\nThis is **bold** text.'
    };

    render(<ChatMessage message={markdownMessage} />);
    expect(screen.getByText('Heading')).toBeInTheDocument();
  });
});

