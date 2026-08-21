import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BookCoverPage } from './BookCoverPage';

describe('BookCoverPage', () => {
  it('returns to the LoreBooks Library without opening the book', () => {
    const onBackToLibrary = vi.fn();
    const onOpen = vi.fn();

    render(
      <BookCoverPage
        title="The Keeper of Marrowvale"
        onBackToLibrary={onBackToLibrary}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to LoreBooks Library' }));

    expect(onBackToLibrary).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
