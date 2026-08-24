import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetectedCharacterSuggestions } from './DetectedCharacterSuggestions';
import { characterSuggestionsApi } from '../../api/entitySuggestions';
import { characterTitleApi } from '../../api/characterTitle';
import { getMockCharacterSuggestionBookNames } from '../../mocks/characterSuggestions';
import { copyTextToClipboard } from '../../lib/listClipboard';

vi.mock('../../lib/listClipboard', async (orig) => {
  const actual = await orig<typeof import('../../lib/listClipboard')>();
  return {
    ...actual,
    copyTextToClipboard: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('../../api/entitySuggestions', () => ({
  characterSuggestionsApi: {
    list: vi.fn(),
    add: vi.fn(),
  },
}));

vi.mock('../../api/characterTitle', () => ({
  characterTitleApi: {
    addAlias: vi.fn(),
  },
}));

vi.mock('../../store/api/entitiesApi', () => ({
  useGetCharactersBookQuery: vi.fn(() => ({ dataUpdatedAt: 0, refetch: vi.fn() })),
}));

vi.mock('../../store/invalidateEntityCache', () => ({
  invalidateEntityTags: vi.fn(),
}));

describe('DetectedCharacterSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
  });

  it('shows demo suggestions on Character Book when not already in the book', () => {
    render(
      <DetectedCharacterSuggestions
        demoMode
        variant="general"
        existingCharacterNames={getMockCharacterSuggestionBookNames('general')}
      />
    );

    expect(screen.getByText(/People detected in your chats/i)).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('Iris Vance')).toBeInTheDocument();
    expect(screen.getByText('DJ Cassian')).toBeInTheDocument();
    expect(screen.getByText(/fictional sample conversations/i)).toBeInTheDocument();
  });

  it('shows romantic demo suggestions for Love view variant', () => {
    render(
      <DetectedCharacterSuggestions
        demoMode
        variant="romantic"
        existingCharacterNames={getMockCharacterSuggestionBookNames('romantic')}
      />
    );

    const title = screen.getByRole('heading', {
      name: 'Romantic interests detected in your chats',
    });
    expect(title).toBeInTheDocument();
    expect(title.className).not.toMatch(/\btruncate\b/);
    expect(title.className).toMatch(/break-words/);
    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy all suggested romantic interests' })).toBeInTheDocument();
  });

  it('copies all romantic suggestions as plain text', async () => {
    const user = userEvent.setup();

    render(
      <DetectedCharacterSuggestions
        demoMode
        variant="romantic"
        existingCharacterNames={getMockCharacterSuggestionBookNames('romantic')}
      />
    );

    await user.click(screen.getByTestId('character-suggestions-copy-all'));

    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledTimes(1));
    const payload = String(vi.mocked(copyTextToClipboard).mock.calls[0]?.[0] ?? '');
    expect(payload).toContain('Romantic interests detected in your chats');
    expect(payload).toContain('Priya');
    expect(payload).toContain('Daniel');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('opens a suggestion modal with the full card contents', async () => {
    const user = userEvent.setup();
    render(
      <DetectedCharacterSuggestions
        demoMode
        variant="romantic"
        existingCharacterNames={getMockCharacterSuggestionBookNames('romantic')}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Open Priya suggestion' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Priya' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Romantic interest suggestion/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Coffee with Priya turned into a four-hour talk/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/4 mentions/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Priya' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close suggestion' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets you merge a suggestion onto an existing character from the modal', async () => {
    const user = userEvent.setup();
    vi.mocked(characterSuggestionsApi.list).mockResolvedValue({
      success: true,
      suggestions: [{
        id: 'sug:character:boo',
        name: 'Boo',
        mentionCount: 2,
        confidence: 0.7,
        source: 'chat_extract',
        context: 'Pet name used in chats',
      }],
      count: 1,
    });
    vi.mocked(characterTitleApi.addAlias).mockResolvedValue({ displayTitle: {} } as never);

    render(
      <DetectedCharacterSuggestions
        existingBookEntries={[{
          id: '3c89d5ba-4929-4903-a8b0-ceef5b9be178',
          name: 'Kiley Tafur',
          aliases: ['Kiley'],
        }]}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Open Boo suggestion' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Merge with someone already in your book/i)).toBeInTheDocument();

    await user.type(within(dialog).getByPlaceholderText(/search people to merge with/i), 'kiley');
    await user.click(within(dialog).getByRole('button', { name: /Kiley Tafur/i }));

    await waitFor(() => {
      expect(characterTitleApi.addAlias).toHaveBeenCalledWith(
        '3c89d5ba-4929-4903-a8b0-ceef5b9be178',
        { value: 'Boo', aliasType: 'nickname' },
      );
    });
    expect(characterSuggestionsApi.add).not.toHaveBeenCalled();
    expect(await screen.findByText(/saved as a nickname for Kiley Tafur/i)).toBeInTheDocument();
  });

  it('simulates adding a romantic suggestion with effects in demo mode', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onAdded = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <DetectedCharacterSuggestions
        demoMode
        variant="romantic"
        existingCharacterNames={getMockCharacterSuggestionBookNames('romantic')}
        onCharacterAdded={onAdded}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add Priya' }));
    expect(screen.getByText(/Adding/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1100);

    expect(onAdded).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Priya', archetype: 'romantic' })
    );
    expect(screen.queryByText('Priya')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('attaches a nickname suggestion to the matched character instead of creating a second person', async () => {
    const user = userEvent.setup();
    vi.mocked(characterSuggestionsApi.list).mockResolvedValue({
      success: true,
      suggestions: [{
        id: 'sug:character:killa',
        name: 'Killa',
        mentionCount: 2,
        confidence: 0.72,
        source: 'chat_extract',
        archetype: 'romantic',
        relationship: 'romantic',
        context: 'Mentioned near romantic language in your chats',
      }],
      count: 1,
    });
    vi.mocked(characterTitleApi.addAlias).mockResolvedValue({ displayTitle: {} } as never);

    render(
      <DetectedCharacterSuggestions
        existingBookEntries={[{
          id: '3c89d5ba-4929-4903-a8b0-ceef5b9be178',
          name: 'Kiley Tafur',
          aliases: ['Kiley'],
        }]}
      />
    );

    expect(await screen.findByText('Killa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Killa' }));

    await waitFor(() => {
      expect(characterTitleApi.addAlias).toHaveBeenCalledWith(
        '3c89d5ba-4929-4903-a8b0-ceef5b9be178',
        { value: 'Killa', aliasType: 'nickname' },
      );
    });
    expect(characterSuggestionsApi.add).not.toHaveBeenCalled();
    expect(await screen.findByText(/saved as a nickname for Kiley/i)).toBeInTheDocument();
  });

  it('keeps rescan controls visible when there are no live suggestions', async () => {
    vi.mocked(characterSuggestionsApi.list).mockResolvedValue({
      success: true,
      suggestions: [],
      count: 0,
    });

    render(<DetectedCharacterSuggestions existingCharacterNames={[]} />);

    expect(await screen.findByText(/No new people to add right now/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Rescan conversations/i }).length).toBeGreaterThan(0);
  });
});
