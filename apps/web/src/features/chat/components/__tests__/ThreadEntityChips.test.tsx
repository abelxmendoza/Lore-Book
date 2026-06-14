import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThreadEntityChips } from '../ThreadEntityChips';
import type { Message } from '../../message/ChatMessage';

function makeMessage(id: string, mentionedEntities: Message['mentionedEntities']): Message {
  return { id, role: 'assistant', content: 'x', timestamp: new Date(), mentionedEntities };
}

const maya = { id: 'c1', name: 'Maya', type: 'character' as const };
const sanDiego = { id: 'l1', name: 'San Diego', type: 'location' as const };

function renderChips(messages: Message[]) {
  return render(
    <MemoryRouter>
      <ThreadEntityChips messages={messages} />
    </MemoryRouter>
  );
}

describe('ThreadEntityChips', () => {
  it('renders nothing when no message has entities', () => {
    const { container } = renderChips([makeMessage('m1', undefined), makeMessage('m2', [])]);
    expect(container.innerHTML).toBe('');
  });

  it('dedupes entities across messages and renders one chip each', () => {
    renderChips([
      makeMessage('m1', [maya]),
      makeMessage('m2', [maya, sanDiego]),
    ]);
    expect(screen.getAllByText('Maya')).toHaveLength(1);
    expect(screen.getAllByText('San Diego')).toHaveLength(1);
    expect(screen.getByText('this thread knows:')).toBeInTheDocument();
  });

  it('orders chips by mention count, most mentioned first', () => {
    renderChips([
      makeMessage('m1', [sanDiego]),
      makeMessage('m2', [maya, sanDiego]),
      makeMessage('m3', [sanDiego]),
    ]);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('San Diego');
    expect(buttons[1]).toHaveTextContent('Maya');
  });

  it('composer variant uses building-on label and focus mode', () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ThreadEntityChips
          messages={[makeMessage('m1', [maya])]}
          variant="composer"
          selectedEntityId="c1"
          onSelectEntity={onSelect}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('building on:')).toBeInTheDocument();
    expect(screen.getByText(/focuses on/i)).toBeInTheDocument();
    expect(screen.getAllByText('Maya').length).toBeGreaterThanOrEqual(1);
  });
});
