import { describe, it, expect, beforeEach } from 'vitest';

import { mockDataService } from './mockDataService';
import { MOCK_QUESTS } from '../mocks/quests';
import type { Quest } from '../types/quest';

describe('mockDataService.mutate', () => {
  beforeEach(() => {
    mockDataService.register.quests([]);
    mockDataService.register.questSuggestions([]);
    mockDataService.register.characters([]);
    mockDataService.register.skills([]);
    mockDataService.register.skillSuggestions([]);
  });

  it('creates quests and rebuilds the board with lk:quests-updated', () => {
    const events: string[] = [];
    const onEvent = (event: Event) => events.push(event.type);
    window.addEventListener('lk:quests-updated', onEvent);

    const created = mockDataService.mutate.quests.create({
      id: 'quest-demo-1',
      title: 'Demo quest',
      quest_type: 'side',
      priority: 5,
      importance: 5,
      impact: 5,
      status: 'active',
      progress_percentage: 0,
      source: 'manual',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies Quest);

    expect(created.title).toBe('Demo quest');
    expect(mockDataService.get.quests()).toHaveLength(MOCK_QUESTS.length + 1);
    expect(mockDataService.get.questBoard()?.side_quests.some((q) => q.id === 'quest-demo-1')).toBe(true);
    expect(events).toContain('lk:quests-updated');

    window.removeEventListener('lk:quests-updated', onEvent);
  });

  it('patches quest status for complete/pause flows', () => {
    const seed = MOCK_QUESTS[0];
    mockDataService.register.quests([seed]);

    const completed = mockDataService.mutate.quests.setStatus(seed.id, 'completed', {
      progress_percentage: 100,
      completed_at: new Date().toISOString(),
    });

    expect(completed.status).toBe('completed');
    expect(completed.progress_percentage).toBe(100);
    expect(mockDataService.get.questBoard()?.completed_quests.some((q) => q.id === seed.id)).toBe(true);
  });

  it('upserts characters and emits lk:characters-updated', () => {
    const events: string[] = [];
    const onEvent = (event: Event) => events.push(event.type);
    window.addEventListener('lk:characters-updated', onEvent);

    mockDataService.mutate.characters.upsert({
      id: 'char-1',
      name: 'Alex',
      user_id: 'demo',
      alias: [],
      pronouns: null,
      archetype: null,
      role: 'Friend',
      status: 'active',
      first_appearance: null,
      summary: 'Updated in demo',
      tags: [],
      metadata: {},
    });

    expect(mockDataService.get.characters()).toHaveLength(1);
    expect(mockDataService.get.characters()[0]?.summary).toBe('Updated in demo');
    expect(events).toContain('lk:characters-updated');

    window.removeEventListener('lk:characters-updated', onEvent);
  });

  it('creates skills from suggestions and emits lk:skills-updated', () => {
    const events: string[] = [];
    const onEvent = (event: Event) => events.push(event.type);
    window.addEventListener('lk:skills-updated', onEvent);

    const created = mockDataService.mutate.skills.createFromSuggestion({
      id: 'sug-react',
      skill_name: 'React',
      skill_category: 'technical',
      skill_type: 'technical',
      monetization: 'paid',
      proficiency: 72,
      confidence: 0.86,
      enjoyment: 78,
      usage_frequency: 'daily',
      trajectory: 'improving',
      description: 'Building the Atlas Notes app',
      evidence: ['Working on React frontend'],
      source: 'chat',
    });

    expect(created.skill_name).toBe('React');
    expect(created.metadata?.skill_profile?.proficiency).toBe(72);
    expect(mockDataService.get.skills()).toHaveLength(1);
    expect(events).toContain('lk:skills-updated');

    mockDataService.mutate.skills.removeSuggestion({ id: 'sug-react', skill_name: 'React' });
    expect(mockDataService.get.skillSuggestions()).toHaveLength(0);

    window.removeEventListener('lk:skills-updated', onEvent);
  });

  it('updates value priority in demo goals data', () => {
    mockDataService.mutate.goalsValues.ensureSeed();
    const before = mockDataService.get.goalsValues()?.values[0]?.priority;
    const valueId = mockDataService.get.goalsValues()?.values[0]?.id;
    expect(valueId).toBeTruthy();

    mockDataService.mutate.goalsValues.updateValuePriority(valueId!, 0.42);

    const after = mockDataService.get.goalsValues()?.values.find((v) => v.id === valueId)?.priority;
    expect(after).toBe(0.42);
    expect(after).not.toBe(before);
  });

  it('creates locations and removes pending suggestions', () => {
    mockDataService.register.locationSuggestions([
      {
        id: 'sug-1',
        name: 'River Café',
        type: 'restaurant',
        mentionCount: 2,
        confidence: 0.8,
        source: 'chat_detect',
      },
    ]);

    const created = mockDataService.mutate.locations.create({
      name: 'River Café',
      type: 'restaurant',
      context: 'Weekend brunch spot',
    });

    expect(created.name).toBe('River Café');
    expect(mockDataService.get.locations()).toHaveLength(1);
    mockDataService.mutate.locations.removeSuggestion({ id: 'sug-1', name: 'River Café' });
    expect(mockDataService.get.locationSuggestions()).toHaveLength(0);
  });

  it('resolves memory proposals out of the pending queue', () => {
    mockDataService.register.memoryProposals([
      {
        id: 'proposal-demo',
        user_id: 'demo',
        entity_id: 'entity-1',
        claim_text: 'Demo memory claim',
        confidence: 0.9,
        affected_claim_ids: [],
        risk_level: 'LOW',
        status: 'PENDING',
        created_at: new Date().toISOString(),
      },
    ]);

    expect(mockDataService.get.memoryProposals()).toHaveLength(1);
    mockDataService.mutate.memoryProposals.approve('proposal-demo');
    expect(mockDataService.get.memoryProposals()).toHaveLength(0);
  });
});
