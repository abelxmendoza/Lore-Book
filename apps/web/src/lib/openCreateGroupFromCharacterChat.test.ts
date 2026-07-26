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

  it('builds a prompt that seeds classification, membership, and knowledge-base setup', () => {
    const classification = {
      groupType: 'company' as const,
      label: 'Company',
      confidence: 0.8,
      reasons: ['company/workplace language'],
    };
    const prompt = buildCreateGroupFromCharacterPrompt(
      {
        groupName: 'Vanguard Robotics',
        details: 'Workplace engineering team in Hollywood.',
        character: { id: 'char-1', name: 'Marcus', role: 'colleague' },
        memberRole: 'coworker',
      },
      classification,
    );

    expect(prompt).toContain('Vanguard Robotics');
    expect(prompt).toContain('Marcus');
    expect(prompt).toContain('coworker');
    expect(prompt).toContain('Company');
    expect(prompt).toContain('`company`');
    expect(prompt).toContain('Workplace engineering team');
    expect(prompt).toContain('knowledge base');
    expect(prompt).toMatch(/classify/i);
  });

  it('plans a pending organization focus id', () => {
    const plan = planCreateGroupFromCharacter({
      groupName: 'Antler cohort',
      details: 'startup investor community',
      character: { id: 'char-2', name: 'Jamie' },
    });
    expect(plan.pendingEntityId).toBe('pending:organization:antler-cohort');
    expect(plan.groupName).toBe('Antler cohort');
    expect(plan.initialPrompt.length).toBeGreaterThan(40);
  });

  it('respects an explicit group type override', () => {
    const plan = planCreateGroupFromCharacter({
      groupName: 'Northwind Labs',
      details: 'just a label for now',
      character: { id: 'char-3', name: 'Alex' },
      groupTypeOverride: 'brand',
    });
    expect(plan.classification.groupType).toBe('brand');
    expect(plan.classification.reasons).toContain('user-selected type');
  });

  it('dispatches lorebook:open-chat-focus with pending organization context', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('lorebook:open-chat-focus', handler);

    openCreateGroupFromCharacterChat({
      groupName: 'MemoVault crew',
      details: 'friend group working on MemoVault',
      character: { id: 'char-4', name: 'Taylor', role: 'friend' },
      memberRole: 'member',
      isSelf: false,
    });

    window.removeEventListener('lorebook:open-chat-focus', handler);

    expect(events).toHaveLength(1);
    const detail = events[0].detail as Record<string, unknown>;
    expect(detail.entityId).toBe('pending:organization:memovault-crew');
    expect(detail.entityName).toBe('MemoVault crew');
    expect(detail.entityType).toBe('memory');
    expect(detail.sourceSurface).toBe('organizations');
    expect(String(detail.initialPrompt)).toContain('MemoVault crew');
    expect(String(detail.initialPrompt)).toContain('Taylor');
  });
});
