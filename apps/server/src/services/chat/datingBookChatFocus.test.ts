import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../supabaseClient';
import {
  applyDatingBookFocus,
  enrichChatFocusWithDatingBook,
  isDatingRomanceChatFocus,
  DATING_ROMANCE_KNOWLEDGE_SCOPE,
  type ChatFocusLike,
} from './datingBookChatFocus';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function chain(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return obj;
}

const characterFocus: ChatFocusLike = {
  entityId: 'char-jamie',
  entityName: 'Jamie',
  entityType: 'character',
  sourceSurface: 'characters',
  sourceLabel: 'Character Book',
  knowledgeScope: 'who they are, how you know them, and what matters in your shared story',
};

describe('datingBookChatFocus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats love surface, relationship id, or romantic scope as dating focus', () => {
    expect(isDatingRomanceChatFocus({ sourceSurface: 'love' })).toBe(true);
    expect(isDatingRomanceChatFocus({ sourceSurface: 'characters', relationshipId: 'rel-1' })).toBe(true);
    expect(isDatingRomanceChatFocus({ sourceSurface: 'characters', knowledgeScope: 'romantic interest' })).toBe(true);
    expect(isDatingRomanceChatFocus({ sourceSurface: 'characters' })).toBe(false);
  });

  it('upgrades a Character Book focus once the person is in Dating & Romance', () => {
    const next = applyDatingBookFocus(characterFocus, {
      relationshipId: 'rel-1',
      personName: 'Jamie',
      affectionScore: 0.4,
      healthScore: 0.5,
      connectionScore: 0.3,
    });
    expect(next.sourceSurface).toBe('love');
    expect(next.sourceLabel).toBe('Dating & Romance');
    expect(next.relationshipId).toBe('rel-1');
    expect(next.knowledgeScope).toBe(DATING_ROMANCE_KNOWLEDGE_SCOPE);
    expect(next.baseline?.affectionScore).toBe(40);
  });

  it('enriches chat focus from the dating book row', async () => {
    mockFrom.mockReturnValue(
      chain({
        id: 'rel-1',
        person_name: 'Jamie',
        affection_score: 0.4,
        relationship_health: 0.5,
        emotional_intensity: 0.3,
        is_current: true,
      }),
    );

    const next = await enrichChatFocusWithDatingBook('user-1', characterFocus);
    expect(next?.sourceSurface).toBe('love');
    expect(next?.relationshipId).toBe('rel-1');
    expect(mockFrom).toHaveBeenCalledWith('romantic_relationships');
  });

  it('leaves ordinary Character Book focus unchanged when they are not in Dating & Romance', async () => {
    mockFrom.mockReturnValue(chain(null));
    const next = await enrichChatFocusWithDatingBook('user-1', characterFocus);
    expect(next).toEqual(characterFocus);
  });
});
