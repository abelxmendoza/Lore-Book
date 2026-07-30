import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { BookQueryPanel } from './BookQueryPanel';

describe('BookQueryPanel', () => {
  it('runs a grounded demo query and exposes cross-book matches', async () => {
    render(
      <MemoryRouter>
        <BookQueryPanel demoMode compact />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask LoreBook' }), {
      target: { value: 'MemoVault skills and quests' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText(/grounded records across/i)).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Launch the MemoVault beta')).toBeInTheDocument();
    expect(screen.getByText('Grounded connections')).toBeInTheDocument();
  });

  it('reports empty grounded results without inventing a match', async () => {
    const onResponse = vi.fn();
    render(
      <MemoryRouter>
        <BookQueryPanel
          demoMode
          domains={['document']}
          title="Ask Documents"
          onResponse={onResponse}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask Documents' }), {
      target: { value: 'a source that does not exist' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(onResponse).toHaveBeenCalled());
    expect(screen.getByText('No grounded records matched this query.')).toBeInTheDocument();
  });

  it('lets users copy grounded results as plain text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <MemoryRouter>
        <BookQueryPanel demoMode compact />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask LoreBook' }), {
      target: { value: 'MemoVault skills and quests' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByTestId('book-query-results')).toBeInTheDocument();
    const resultsText = screen.getByTestId('book-query-results-text') as HTMLTextAreaElement;
    expect(resultsText.value).toMatch(/TypeScript|MemoVault/i);
    fireEvent.click(screen.getByTestId('book-query-copy-results'));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toMatch(/TypeScript|MemoVault/i);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});
