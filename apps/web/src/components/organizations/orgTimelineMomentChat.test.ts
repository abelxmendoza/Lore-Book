import { describe, it, expect } from 'vitest';
import {
  buildOrgTimelineMomentChatPrompt,
  isOpenableLifeLogTimelineEvent,
} from './orgTimelineMomentChat';
import type { OrgDerivedEvent } from '../../mocks/organizationTimeline';

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
  it('asks for a full grounded recount and invites corrections', () => {
    const prompt = buildOrgTimelineMomentChatPrompt(moment({}), 'Northwind Collective');
    expect(prompt).toMatch(/full story of “House Show” with Northwind Collective/i);
    expect(prompt).toMatch(/Stay focused on that time period/i);
    expect(prompt).toMatch(/Marcus, Jamie/);
    expect(prompt).toMatch(/Backyard set then coffee/);
    expect(prompt).toMatch(/don’t invent|do not invent/i);
    expect(prompt).toMatch(/knowledge base/i);
  });
});

describe('isOpenableLifeLogTimelineEvent', () => {
  it('flags user-posted events', () => {
    expect(isOpenableLifeLogTimelineEvent(moment({ source: 'user_posted' }))).toBe(true);
    expect(isOpenableLifeLogTimelineEvent(moment({ source: 'conversation' }))).toBe(false);
  });
});
