import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { LifeArcProposal } from '../../hooks/useLifeArcProposals';
import { LifeArcProposalDetailModal } from './LifeArcProposalDetailModal';

const proposal: LifeArcProposal = {
  id: 'proposal-1',
  fingerprint: 'abc',
  title: 'Career chapter · 2025–2026',
  arc_type: 'work',
  track: 'career',
  start_date: '2025-01-01',
  end_date: '2026-01-01',
  confidence: 0.9,
  explanation: 'Two dated milestones connect this chapter.',
  source_record_ids: ['resolved_event:one'],
  evidence: [
    {
      sourceKind: 'resolved_event',
      sourceId: 'one',
      sourceIds: ['one'],
      title: 'Joined Vanguard Robotics',
      occurredAt: '2025-01-01T00:00:00.000Z',
      confidence: 0.9,
    },
  ],
  status: 'pending',
};

describe('LifeArcProposalDetailModal', () => {
  it('supports create, merge, and dismiss actions', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onMerge = vi.fn();
    const onDismiss = vi.fn();
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <LifeArcProposalDetailModal
        proposal={proposal}
        arcs={[{ id: 'arc-1', title: 'Existing career arc' } as never]}
        onClose={() => {}}
        onUpdate={onUpdate}
        onCreate={onCreate}
        onMerge={onMerge}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText('Two dated milestones connect this chapter.')).toBeInTheDocument();
    expect(screen.getByText('Joined Vanguard Robotics')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create arc' }));
    expect(onUpdate).toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ id: 'proposal-1' }));

    await user.click(screen.getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenCalledWith(expect.objectContaining({ id: 'proposal-1' }), 'arc-1');

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 'proposal-1' }));
  });
});
