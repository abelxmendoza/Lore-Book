import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LifeArcProposalAwakening } from './LifeArcProposalAwakening';

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  refresh: vi.fn(),
  update: vi.fn(),
  act: vi.fn(),
}));

let proposals: Array<Record<string, unknown>> = [];

vi.mock('../../hooks/useLifeArcProposals', () => ({
  useLifeArcProposals: () => ({
    proposals,
    audit: null,
    loading: false,
    building: false,
    error: null,
    ...mocks,
  }),
}));

describe('LifeArcProposalAwakening', () => {
  beforeEach(() => {
    proposals = [];
    vi.clearAllMocks();
  });

  it('offers a review-first build when canonical lore exists', async () => {
    render(
      <LifeArcProposalAwakening
        enabled
        canonicalItemCount={12}
        arcs={[]}
        onArcsChanged={vi.fn()}
      />,
    );

    expect(screen.getByText('We found lore and can build your life arcs')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Build from my lore' }));
    expect(mocks.build).toHaveBeenCalledOnce();
  });

  it('shows evidence before independent create and dismiss actions', async () => {
    proposals = [{
      id: 'proposal-1',
      fingerprint: 'abc',
      title: 'Career chapter · 2025–2026',
      arc_type: 'work',
      track: 'career',
      start_date: '2025-01-01',
      end_date: '2026-01-01',
      confidence: 0.9,
      explanation: 'Two dated milestones connect this chapter.',
      source_record_ids: ['resolved_event:one', 'resolved_event:two'],
      evidence: [
        { sourceKind: 'resolved_event', sourceId: 'one', sourceIds: ['one'], title: 'Joined Vanguard Robotics', occurredAt: '2025-01-01T00:00:00.000Z', confidence: 0.9 },
        { sourceKind: 'resolved_event', sourceId: 'two', sourceIds: ['two'], title: 'Shipped MemoVault', occurredAt: '2026-01-01T00:00:00.000Z', confidence: 0.9 },
      ],
      status: 'pending',
    }];

    render(
      <LifeArcProposalAwakening
        enabled
        canonicalItemCount={12}
        arcs={[]}
        onArcsChanged={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Review suggestions/i }));
    await userEvent.click(screen.getByText('2 supporting moments'));
    expect(screen.getByText('Joined Vanguard Robotics')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create arc' }));
    expect(mocks.act).toHaveBeenCalledWith('proposal-1', 'create', {});

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mocks.act).toHaveBeenCalledWith('proposal-1', 'dismiss', { reason: 'user_dismissed' });
  });
});
