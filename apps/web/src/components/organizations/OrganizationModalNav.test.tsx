import { describe, it, expect } from 'vitest';
import { normalizeOrgModalTab, ORG_MODAL_BASE_TABS } from './OrganizationModalNav';

describe('OrganizationModalNav — Timeline tab', () => {
  it('exposes a single Timeline tab instead of Events + Activity', () => {
    const keys = ORG_MODAL_BASE_TABS.map((t) => t.key);
    expect(keys).toContain('timeline');
    expect(keys).not.toContain('events');
    expect(keys).not.toContain('activity');
    expect(ORG_MODAL_BASE_TABS.find((t) => t.key === 'timeline')?.label).toBe('Timeline');
  });

  it('labels the chat tab as Chat (main-chat redirect)', () => {
    const chat = ORG_MODAL_BASE_TABS.find((t) => t.key === 'chat');
    expect(chat?.label).toBe('Chat');
  });

  it('aliases legacy Events / Activity keys to Timeline', () => {
    expect(normalizeOrgModalTab('events')).toBe('timeline');
    expect(normalizeOrgModalTab('activity')).toBe('timeline');
    expect(normalizeOrgModalTab('timeline')).toBe('timeline');
    expect(normalizeOrgModalTab('members')).toBe('members');
  });
});
