import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: vi.fn(),
}));

import {
  buildOrgTimelineMomentChatPrompt,
  isOpenableLifeLogTimelineEvent,
  openOrgTimelineMomentChat,
} from './orgTimelineMomentChat';
import type { OrgDerivedEvent } from '../../mocks/organizationTimeline';
import { openChatWithFocus } from '../../lib/openChatWithFocus';

function moment(partial: Partial<OrgDerivedEvent>): OrgDerivedEvent {
  return {
    id: 'x',
    title: 'House Show',
    date: '2024-06-01T20:00:00.000Z',
    type: 'social',
    involved: ['Marcus', 'Jamie'],
    summary: 'Backyard set then coffee.',
    source: 'conversation',
    ...partial,
  };
}

describe('buildOrgTimelineMomentChatPrompt', () => {
  beforeEach(() => {
    vi.mocked(openChatWithFocus).mockClear();
  });

  it('asks for a full grounded recount and invites corrections', () => {
    const prompt = buildOrgTimelineMomentChatPrompt(moment({}), 'Northwind Collective');
    expect(prompt).toMatch(/full story of “House Show” with Northwind Collective/i);
    expect(prompt).toMatch(/Stay focused on that time period/i);
    expect(prompt).toMatch(/Marcus, Jamie/);
    expect(prompt).toMatch(/Backyard set then coffee/);
    expect(prompt).toMatch(/don’t invent|do not invent/i);
    expect(prompt).toMatch(/knowledge base/i);
  });

  it('auto-submits the selected moment so LoreBook answers before follow-ups', () => {
    openOrgTimelineMomentChat({
      event: moment({}),
      organizationId: 'org-northwind',
      organizationName: 'Northwind Collective',
    });

    expect(openChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'org-northwind',
        entityName: 'Northwind Collective',
        sourceSurface: 'organizations',
        initialPrompt: expect.stringMatching(/full story of “House Show”/i),
        autoSubmit: true,
        startNewThread: true,
      }),
    );
  });
});

describe('isOpenableLifeLogTimelineEvent', () => {
  it('flags user-posted events', () => {
    expect(isOpenableLifeLogTimelineEvent(moment({ source: 'user_posted' }))).toBe(true);
    expect(isOpenableLifeLogTimelineEvent(moment({ source: 'conversation' }))).toBe(false);
  });
});
