import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { highlightTextTerms } from './highlightTextTerms';

describe('highlightTextTerms', () => {
  it('wraps word-boundary matches in a mark', () => {
    const { getByTestId, container } = render(
      <span>{highlightTextTerms('Had lunch with Jamie yesterday', ['Jamie'])}</span>,
    );
    expect(getByTestId('chat-name-highlight')).toHaveTextContent('Jamie');
    expect(container.textContent).toBe('Had lunch with Jamie yesterday');
  });

  it('does not match short names inside longer words', () => {
    const { queryByTestId } = render(
      <span>{highlightTextTerms('Annual review went well', ['Ann'])}</span>,
    );
    expect(queryByTestId('chat-name-highlight')).toBeNull();
  });

  it('prefers longer aliases when overlapping', () => {
    const { getAllByTestId } = render(
      <span>{highlightTextTerms('Saw Jamie Lee at the cafe', ['Jamie', 'Jamie Lee'])}</span>,
    );
    const marks = getAllByTestId('chat-name-highlight');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('Jamie Lee');
  });
});
