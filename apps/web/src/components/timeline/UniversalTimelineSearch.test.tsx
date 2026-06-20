import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UniversalTimelineSearch } from './UniversalTimelineSearch';

const SUGGESTIONS = ['Everything with Alex', '2024 career'] as const;

describe('UniversalTimelineSearch', () => {
  it('renders desktop search and submits query', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onInputChange = vi.fn();

    render(
      <UniversalTimelineSearch
        genInput="nightlife"
        genQuery=""
        suggestions={SUGGESTIONS}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        onSuggestionClick={vi.fn()}
        variant="desktop"
      />,
    );

    expect(screen.getByTestId('universal-timeline-search-desktop')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /generate/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows suggestion chips when idle', async () => {
    const user = userEvent.setup();
    const onSuggestionClick = vi.fn();

    render(
      <UniversalTimelineSearch
        genInput=""
        genQuery=""
        suggestions={SUGGESTIONS}
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        onSuggestionClick={onSuggestionClick}
        variant="desktop"
      />,
    );

    await user.click(screen.getByRole('button', { name: /everything with alex/i }));
    expect(onSuggestionClick).toHaveBeenCalledWith('Everything with Alex');
  });

  it('hides suggestions while a generated query is active', () => {
    render(
      <UniversalTimelineSearch
        genInput="2024 career"
        genQuery="2024 career"
        suggestions={SUGGESTIONS}
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        onClear={vi.fn()}
        onSuggestionClick={vi.fn()}
        variant="mobile"
      />,
    );

    expect(screen.getByTestId('universal-timeline-search-mobile')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /everything with alex/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });
});
