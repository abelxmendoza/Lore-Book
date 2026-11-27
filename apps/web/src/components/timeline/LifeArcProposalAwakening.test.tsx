import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerAccountAuthority } from '../../lib/accountAuthority';
import { buildLifeArcProposalsClipboardText } from '../../lib/lifeArcProposalsDiagnosticClipboard';
import { LifeArcProposalAwakening } from './LifeArcProposalAwakening';

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  createReady: vi.fn(),
  refresh: vi.fn(),
  update: vi.fn(),
  act: vi.fn(),
}));

let proposals: Array<Record<string, unknown>> = [];
let authority: ServerAccountAuthority | null = null;

const sampleProposal = {
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
};

vi.mock('../../hooks/useLifeArcProposals', () => ({
  useLifeArcProposals: () => ({
    proposals,
    audit: null,
    loading: false,
    building: false,
    creatingReady: false,
    error: null,
    ...mocks,
  }),
}));

vi.mock('../../hooks/useAccountAuthority', () => ({
  useAccountAuthority: () => ({ authority, loading: false, error: null, refresh: vi.fn() }),
}));

describe('LifeArcProposalAwakening', () => {
  beforeEach(() => {
    proposals = [];
    authority = null;
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
    expect(mocks.build).toHaveBeenCalledWith({ autoCreateReady: false });
  });

  it('offers one-click creation for high-confidence proposals', async () => {
    proposals = [sampleProposal];

    render(
      <LifeArcProposalAwakening
        enabled
        canonicalItemCount={12}
        arcs={[]}
        onArcsChanged={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId('life-arc-create-ready'));
    expect(mocks.createReady).toHaveBeenCalledOnce();
  });

  it('opens a modal with evidence before create and dismiss actions', async () => {
    proposals = [sampleProposal];

    render(
      <LifeArcProposalAwakening
        enabled
        canonicalItemCount={12}
        arcs={[]}
        onArcsChanged={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Review suggestions/i }));
    await userEvent.click(screen.getByRole('button', { name: /Open Career chapter/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Joined Vanguard Robotics')).toBeInTheDocument();
    expect(screen.getByText('Shipped MemoVault')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create arc' }));
    expect(mocks.update).toHaveBeenCalledWith('proposal-1', {
      title: 'Career chapter · 2025–2026',
      track: 'career',
      start_date: '2025-01-01',
      end_date: '2026-01-01',
    });
    expect(mocks.act).toHaveBeenCalledWith('proposal-1', 'create', {});

    await userEvent.click(screen.getByRole('button', { name: /Open Career chapter/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mocks.act).toHaveBeenCalledWith('proposal-1', 'dismiss', { reason: 'user_dismissed' });
  });

  it('shows plain copy all but hides diagnostics for standard users', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    proposals = [sampleProposal];
    authority = {
      role: 'user',
      roleLabel: 'User',
      isFounderAccount: false,
      isPrivileged: false,
      privilegeSource: 'free_tier',
      effectivePlanType: 'free',
      canBeBilled: true,
      canCancelSubscription: true,
      canLoseAccess: true,
      canAccessAdmin: false,
      canAccessDevConsole: false,
    };

    render(
      <LifeArcProposalAwakening
        enabled
        canonicalItemCount={12}
        arcs={[]}
        onArcsChanged={vi.fn()}
      />,
    );

    expect(screen.getByTestId('life-arc-copy-all')).toBeInTheDocument();
    expect(screen.queryByTestId('life-arc-copy-diagnostics')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Copy all arc suggestions' }));
    expect(writeText).toHaveBeenCalledWith(buildLifeArcProposalsClipboardText(proposals as never));
    expect(screen.getByTestId('life-arc-copy-all')).toHaveTextContent('Copied');
  });

  it('offers both plain copy and diagnostics for privileged users', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    proposals = [sampleProposal];
    authority = {
      role: 'developer',
      roleLabel: 'Developer',
      isFounderAccount: false,
      isPrivileged: true,
      privilegeSource: 'development_privilege',
      effectivePlanType: 'premium',
      canBeBilled: false,
      canCancelSubscription: false,
      canLoseAccess: false,
      canAccessAdmin: true,
      canAccessDevConsole: true,
    };

    render(
      <LifeArcProposalAwakening
        enabled
        canonicalItemCount={12}
        arcs={[]}
        onArcsChanged={vi.fn()}
      />,
    );

    expect(screen.getByTestId('life-arc-copy-all')).toBeInTheDocument();
    expect(screen.getByTestId('life-arc-copy-diagnostics')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Copy all arc suggestions' }));
    expect(writeText.mock.calls[0]?.[0]).toContain('Life arc suggestions (1 item)');

    await userEvent.click(screen.getByRole('button', { name: 'Copy arc suggestion diagnostics' }));
    const diagnosticCopy = String(writeText.mock.calls[1]?.[0] ?? '');
    expect(diagnosticCopy).toContain('# Life arc suggestions — admin diagnostic dump');
    expect(diagnosticCopy).toContain('id: proposal-1');
    expect(diagnosticCopy).toContain('fingerprint: abc');
    expect(screen.getByTestId('life-arc-copy-diagnostics')).toHaveTextContent('Copied');
  });

  it('lets the user resolve active arcs that still have an end date', async () => {
    const onUpdateArc = vi.fn().mockResolvedValue({});
    render(
      <LifeArcProposalAwakening
        enabled
        canonicalItemCount={12}
        arcs={[
          {
            id: 'arc-active-ended',
            title: 'Vanguard Robotics chapter',
            arc_type: 'work',
            track: 'career',
            dominant_emotion: null,
            emotional_arc: null,
            parent_id: null,
            start_date: '2025-01-01',
            end_date: '2025-06-01',
            is_active: true,
            summary: null,
            confidence: 0.9,
            source: 'inferred',
            tags: [],
          },
        ]}
        onArcsChanged={vi.fn()}
        onUpdateArc={onUpdateArc}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Review repairs/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep active' }));
    expect(onUpdateArc).toHaveBeenCalledWith('arc-active-ended', { end_date: null });

    await userEvent.click(screen.getByRole('button', { name: 'Mark ended' }));
    expect(onUpdateArc).toHaveBeenCalledWith('arc-active-ended', { is_active: false });
  });

  it('lets the user promote a multi-day occasion into a drawable arc', async () => {
    const onUpdateArc = vi.fn().mockResolvedValue({});
    render(
      <LifeArcProposalAwakening
        enabled
        canonicalItemCount={12}
        arcs={[
          {
            id: 'occ-1',
            title: 'Vanguard Robotics chapter',
            arc_type: 'occasion',
            track: 'career',
            dominant_emotion: null,
            emotional_arc: null,
            parent_id: null,
            start_date: '2025-01-01',
            end_date: '2025-06-01',
            is_active: false,
            summary: null,
            confidence: 0.8,
            source: 'inferred',
            tags: [],
          },
        ]}
        onArcsChanged={vi.fn()}
        onUpdateArc={onUpdateArc}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Review repairs/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Promote to arc' }));
    expect(onUpdateArc).toHaveBeenCalledWith('occ-1', { arc_type: 'work', track: 'career' });
  });
});
