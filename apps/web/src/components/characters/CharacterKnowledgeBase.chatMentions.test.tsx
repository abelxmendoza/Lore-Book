import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { CharacterKnowledgeBase, type CharacterKnowledgeBaseData } from './CharacterKnowledgeBase';

const fullInitialData: CharacterKnowledgeBaseData = {
  characterId: 'char-1',
  name: 'Jamie',
  aliases: [],
  summary: null,
  identityMentions: [],
  profile: { relationshipToUser: null, memoryCount: 0, timelineEventCount: 0, timelineEvents: [] },
  facts: [],
  knowledgeClaims: [],
  sceneCandidates: [],
  relatedEntities: [],
  conversationLinks: [],
  intelligence: { totalEvidenceItems: 0, lastUpdated: null, learningScore: 0 },
};

const mentions = [
  {
    messageId: 'msg-1',
    sessionId: 'session-1',
    content: 'Talked about Jamie at the gym',
    createdAt: '2026-07-01T12:00:00.000Z',
    sessionTitle: 'Gym thread',
  },
];

describe('CharacterKnowledgeBase — From your chats', () => {
  it('calls onOpenThread with the mention sessionId/messageId when a mention card is clicked', async () => {
    const onOpenThread = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CharacterKnowledgeBase
          characterId="char-1"
          characterName="Jamie"
          skipFetch
          initialData={fullInitialData}
          chatMentions={mentions}
          onOpenThread={onOpenThread}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('chat-mention-msg-1'));

    expect(onOpenThread).toHaveBeenCalledWith('session-1', 'msg-1');
    expect(screen.getByTestId('chat-mention-name-highlight')).toHaveTextContent('Jamie');
  });

  it('still shows the "no chat mentions yet" empty state when chatMentions is empty', () => {
    render(
      <MemoryRouter>
        <CharacterKnowledgeBase
          characterId="char-1"
          characterName="Jamie"
          skipFetch
          initialData={fullInitialData}
          chatMentions={[]}
          onOpenThread={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('No chat mentions yet')).toBeInTheDocument();
  });

  it('renders mentions as plain (non-interactive) cards when onOpenThread is not provided', () => {
    render(
      <MemoryRouter>
        <CharacterKnowledgeBase
          characterId="char-1"
          characterName="Jamie"
          skipFetch
          initialData={fullInitialData}
          chatMentions={mentions}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('chat-mention-msg-1')).toHaveTextContent('Talked about Jamie at the gym');
    expect(screen.getByTestId('chat-mentions-by-thread')).toBeInTheDocument();
    expect(screen.getByTestId('chat-mention-msg-1').tagName).not.toBe('BUTTON');
    expect(screen.getByTestId('chat-mention-name-highlight')).toHaveTextContent('Jamie');
  });

  it('groups mentions by conversation thread', () => {
    render(
      <MemoryRouter>
        <CharacterKnowledgeBase
          characterId="char-1"
          characterName="Jamie"
          skipFetch
          initialData={fullInitialData}
          chatMentions={[
            ...mentions,
            {
              messageId: 'msg-2',
              sessionId: 'session-2',
              content: 'Jamie called later',
              createdAt: '2026-07-02T12:00:00.000Z',
              sessionTitle: 'Phone catch-up',
            },
          ]}
          onOpenThread={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/2 mentions across 2 conversations/i)).toBeInTheDocument();
    expect(screen.getByTestId('chat-mention-thread-session-1')).toBeInTheDocument();
    expect(screen.getByTestId('chat-mention-thread-session-2')).toBeInTheDocument();
  });
});
