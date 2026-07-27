import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCreateGroupFromCharacterPrompt,
  openCreateGroupFromCharacterChat,
  planCreateGroupFromCharacter,
} from './openCreateGroupFromCharacterChat';

describe('openCreateGroupFromCharacterChat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a prompt that steers chat toward creating, linking, and routing lore', () => {
    const prompt = buildCreateGroupFromCharacterPrompt({
      character: { id: 'char-1', name: 'Marcus', role: 'colleague' },
    });

    expect(prompt).toContain('Marcus');
    expect(prompt).toContain('Groups & Organizations');
    expect(prompt).toMatch(/classify/i);
    expect(prompt).toMatch(/membership role/i);
    expect(prompt).toMatch(/split any other lore/i);
    expect(prompt).toContain('colleague');
  });

  it('plans focus on the character (composer chip), not a pending org name', () => {
    const plan = planCreateGroupFromCharacter({
      character: { id: 'char-2', name: 'Jamie' },
    });
    expect(plan.entityId).toBe('char-2');
    expect(plan.entityName).toBe('Jamie');
    expect(plan.initialPrompt.length).toBeGreaterThan(40);
  });

  it('dispatches lorebook:open-chat-focus with character + organizations context', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('lorebook:open-chat-focus', handler);

    openCreateGroupFromCharacterChat({
      character: { id: 'char-4', name: 'Taylor', role: 'friend' },
      isSelf: false,
    });

    window.removeEventListener('lorebook:open-chat-focus', handler);

    expect(events).toHaveLength(1);
    const detail = events[0].detail as Record<string, unknown>;
    expect(detail.entityId).toBe('char-4');
    expect(detail.entityName).toBe('Taylor');
    expect(detail.entityType).toBe('character');
    expect(detail.sourceSurface).toBe('organizations');
    expect(String(detail.initialPrompt)).toContain('Taylor');
    expect(String(detail.knowledgeScope)).toMatch(/creating a Groups & Organizations entity/i);
  });
});
