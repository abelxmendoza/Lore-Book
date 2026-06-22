import { describe, expect, it } from 'vitest';

import { buildLoreAvatarPrompt } from '../../../src/services/characters/characterLoreAvatarService';

describe('buildLoreAvatarPrompt', () => {
  it('returns null when lore is empty', () => {
    expect(
      buildLoreAvatarPrompt({
        name: 'Maria',
        facts: [],
        loreSnippets: [],
      })
    ).toBeNull();
  });

  it('builds prompt from appearance and personality facts', () => {
    const prompt = buildLoreAvatarPrompt({
      name: 'Zephyrine Quillborne',
      role: 'marine biologist friend',
      summary: 'Nervous about her first deep-sea dive next month.',
      facts: [
        {
          id: '1',
          user_id: 'u',
          entity_id: 'c',
          entity_type: 'character',
          fact: 'Has curly auburn hair and sea-green eyes',
          category: 'appearance',
          confidence: 0.9,
          mention_count: 2,
          status: 'active',
          previous_value: null,
          first_seen_at: '',
          last_confirmed_at: '',
          created_at: '',
          updated_at: '',
        },
        {
          id: '2',
          user_id: 'u',
          entity_id: 'c',
          entity_type: 'character',
          fact: 'Warm, curious, and a little anxious before big moments',
          category: 'personality',
          confidence: 0.85,
          mention_count: 1,
          status: 'active',
          previous_value: null,
          first_seen_at: '',
          last_confirmed_at: '',
          created_at: '',
          updated_at: '',
        },
      ],
      loreSnippets: ['scuba diving', 'research vessel'],
    });

    expect(prompt).toContain('Zephyrine Quillborne');
    expect(prompt).toContain('auburn hair');
    expect(prompt).toContain('marine biologist');
    expect(prompt).toContain('scuba diving');
    expect(prompt).toContain('No text');
  });
});
