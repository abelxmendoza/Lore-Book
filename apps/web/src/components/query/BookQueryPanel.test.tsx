import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { BookQueryPanel } from './BookQueryPanel';

describe('BookQueryPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a Places query into focused main chat instead of searching on the page', () => {
    const handler = vi.fn();
    window.addEventListener('lorebook:open-chat-focus', handler);

    render(<BookQueryPanel domains={['location']} compact />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask in chat' }), {
      target: { value: 'places I visited with Marcus' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask in chat' }));

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.entityId).toBe('book:location');
    expect(detail.sourceSurface).toBe('locations');
    expect(detail.initialPrompt).toBe('places I visited with Marcus');
    expect(screen.queryByTestId('book-query-results')).not.toBeInTheDocument();
  });

  it('sends a Dating & Romance query into focused main chat', () => {
    const handler = vi.fn();
    window.addEventListener('lorebook:open-chat-focus', handler);

    render(<BookQueryPanel domains={['romance']} compact />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask in chat' }), {
      target: { value: 'show my past relationships' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask in chat' }));

    const detail = handler.mock.calls[0][0].detail;
    expect(detail.entityId).toBe('book:romance');
    expect(detail.sourceSurface).toBe('love');
    expect(detail.entityName).toBe('Dating & Romance');
    expect(detail.initialPrompt).toBe('show my past relationships');
  });
});
