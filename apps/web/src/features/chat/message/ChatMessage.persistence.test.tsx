import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage, type Message } from './ChatMessage';

vi.mock('../../../components/chat/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

function baseMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'asst-1',
    role: 'assistant',
    content: 'Saved reply',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('ChatMessage persistence UI', () => {
  it('shows not-backed-up warning when persistStatus is failed', () => {
    render(<ChatMessage message={baseMessage({ persistStatus: 'failed' })} />);
    expect(screen.getByTestId('message-persist-failed')).toBeInTheDocument();
  });

  it('shows saving indicator when persistStatus is pending', () => {
    render(<ChatMessage message={baseMessage({ persistStatus: 'pending' })} />);
    expect(screen.getByTestId('message-persist-pending')).toBeInTheDocument();
  });

  it('hides persistence indicators when saved', () => {
    render(<ChatMessage message={baseMessage({ persistStatus: 'saved' })} />);
    expect(screen.queryByTestId('message-persist-failed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-persist-pending')).not.toBeInTheDocument();
  });
});
