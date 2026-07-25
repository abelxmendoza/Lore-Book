import { describe, it, expect } from 'vitest';
import { normalizeOrgModalTab, ORG_MODAL_BASE_TABS } from './OrganizationModalNav';

describe('OrganizationModalNav — Activity merge', () => {
  it('exposes a single Activity tab instead of Events + Timeline', () => {
    const keys = ORG_MODAL_BASE_TABS.map((t) => t.key);
    expect(keys).toContain('activity');
    expect(keys).not.toContain('events');
    expect(keys).not.toContain('timeline');
  });

  it('labels the chat tab as Chat (main-chat redirect)', () => {
    const chat = ORG_MODAL_BASE_TABS.find((t) => t.key === 'chat');
    expect(chat?.label).toBe('Chat');
  });

  it('aliases legacy Events / Timeline keys to Activity', () => {
    expect(normalizeOrgModalTab('events')).toBe('activity');
    expect(normalizeOrgModalTab('timeline')).toBe('activity');
    expect(normalizeOrgModalTab('members')).toBe('members');
  });
});
