import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetectedCharacterSuggestions } from './DetectedCharacterSuggestions';
import { characterSuggestionsApi } from '../../api/entitySuggestions';
import { getMockCharacterSuggestionBookNames } from '../../mocks/characterSuggestions';

vi.mock('../../api/entitySuggestions', () => ({
  characterSuggestionsApi: {
    list: vi.fn(),
    add: vi.fn(),
  },
}));

vi.mock('../../api/selfCharacter', () => ({
  selfCharacterApi: {
    rescanConversations: vi.fn(),
  },
}));

describe('DetectedCharacterSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(screen.getByText(/Romantic interests detected/i)).toBeInTheDocument();
    expect(screen.getByText('Priya')).toBeInTheDocument();
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
