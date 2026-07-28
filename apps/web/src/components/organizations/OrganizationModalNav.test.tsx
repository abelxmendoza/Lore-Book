import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  normalizeOrgModalTab,
  ORG_MODAL_BASE_TABS,
  OrganizationModalNav,
} from './OrganizationModalNav';
import { Trash2, TreePine } from 'lucide-react';

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

describe('OrganizationModalNav — mobile bottom bar', () => {
  it('shows every section tab in a wrap and has no More button', () => {
    const tabs = [
      ...ORG_MODAL_BASE_TABS,
      { key: 'family' as const, label: 'Family Tree', shortLabel: 'Family', icon: TreePine },
      { key: 'danger' as const, label: 'Delete', shortLabel: 'Delete', icon: Trash2 },
    ];
    render(
      <OrganizationModalNav
        placement="bottom"
        tabs={tabs}
        activeTab="info"
        onTabChange={vi.fn()}
      />
    );

    for (const label of ['Overview', 'Chat', 'People', 'Timeline', 'Stories', 'Places', 'Links', 'Sources', 'Family']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('Delete group')).toBeTruthy();
    expect(screen.queryByText('More')).toBeNull();
    expect(screen.queryByText('More sections')).toBeNull();
  });
});
