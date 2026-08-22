import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BookCoverPage } from './BookCoverPage';

describe('BookCoverPage', () => {
  it('returns to LoreBook Library without opening the book', () => {
    const onOpen = vi.fn();
    const onBackToLibrary = vi.fn();

    render(
      <BookCoverPage
        title="The Keeper of Marrowvale"
        onOpen={onOpen}
        onBackToLibrary={onBackToLibrary}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to LoreBook Library' }));

    expect(onBackToLibrary).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
