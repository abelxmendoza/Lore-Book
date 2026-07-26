import { describe, expect, it } from 'vitest';

import { buildWhatLoreKnowsClipboardText } from './whatLoreKnowsClipboard';

describe('buildWhatLoreKnowsClipboardText', () => {
  it('exports facts, patterns, and prior wording for self profile', () => {
    const text = buildWhatLoreKnowsClipboardText({
      title: 'What Lore Knows About You',
      characterName: 'Alex',
      learningScore: 42,
      knowledgeBase: {
        aliases: ['AJ'],
        identityMentions: [],
        summary: 'Builder and musician.',
        facts: [
          {
            id: 'f1',
            category: 'appearance',
            fact: 'Had pink hair in the past',
            confidence: 0.95,
            status: 'corrected',
            previous_value: 'Has pink hair',
            mention_count: 3,
            first_seen_at: '2024-01-15T00:00:00.000Z',
            last_confirmed_at: '2026-07-01T00:00:00.000Z',
          },
          {
            id: 'f2',
            category: 'career',
            fact: 'Works at Vanguard Robotics',
            confidence: 0.9,
            status: 'active',
          },
        ],
        knowledgeClaims: [
          {
            id: 'c1',
            human_readable_claim: 'Music is a recurring creative outlet',
            confidence: 0.8,
            knowledge_type: 'pattern',
          },
        ],
        relatedEntities: [{ id: 'o1', name: 'Vanguard Robotics', type: 'organization' }],
        conversationLinks: [],
        profile: {
          relationshipToUser: null,
          memoryCount: 4,
          timelineEventCount: 0,
          timelineEvents: [],
        },
      },
      chatMentions: [
        {
          messageId: 'm1',
          sessionId: 's1',
          content: 'I used to dye my hair pink.',
          createdAt: '2026-01-02T00:00:00.000Z',
          sessionTitle: 'Appearance chat',
        },
      ],
    });

    expect(text).toContain('What Lore Knows About You');
    expect(text).toContain('Subject: Alex');
    expect(text).toContain('#### Current');
    expect(text).toContain('#### History');
    expect(text).toContain('Had pink hair in the past (95%, corrected, 3× confirmed)');
    expect(text).toContain('was: Has pink hair');
    expect(text).toContain('dates:');
    expect(text).toContain('first noted');
    expect(text).toContain('last confirmed');
    expect(text).toContain('Works at Vanguard Robotics');
    expect(text).toContain('Music is a recurring creative outlet');
    expect(text).toContain('Vanguard Robotics');
    expect(text).toContain('I used to dye my hair pink.');
  });

  it('still produces a header when the knowledge base is empty', () => {
    const text = buildWhatLoreKnowsClipboardText({
      title: 'What Lore Knows About You',
      characterName: 'Alex',
      knowledgeBase: null,
    });
    expect(text).toContain('What Lore Knows About You');
    expect(text).toContain('(none yet)');
  });
});
