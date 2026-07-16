import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useMemoryReviewQueue,
  type MemoryProposal,
  type MemoryReviewQueueState,
} from '../../hooks/useMemoryReviewQueue';
import { MemoryReviewQueuePanel } from './MemoryReviewQueuePanel';

vi.mock('../../hooks/useMemoryReviewQueue', () => ({ useMemoryReviewQueue: vi.fn() }));

const refetch = vi.fn().mockResolvedValue(undefined);
const approve = vi.fn().mockResolvedValue(undefined);
const reject = vi.fn().mockResolvedValue(undefined);
const edit = vi.fn().mockResolvedValue(undefined);
const defer = vi.fn().mockResolvedValue(undefined);

const proposal = (overrides: Partial<MemoryProposal> = {}): MemoryProposal => ({
  id: 'proposal-1',
  user_id: 'user-1',
  entity_id: 'amazon',
  claim_text: 'Abel works as a Quality Assurance Technician at Amazon through an agency.',
  confidence: 0.92,
  affected_claim_ids: [],
  risk_level: 'MEDIUM',
  status: 'PENDING',
  created_at: '2026-07-01T00:00:00.000Z',
  source_excerpt: 'I am currently working at Amazon as a Quality Assurance Technician through an agency.',
  metadata: {
    proposal_kind: 'occupation',
    normalized_summary: 'Abel works as a Quality Assurance Technician at Amazon through an agency.',
    proposed_mutation: 'Add the current occupation while preserving the agency arrangement.',
    group_key: 'starting-at-amazon-ring',
    group_label: 'Starting at Amazon/Ring',
    risk_reason: 'Affects current work context',
    sensitivity: 'NORMAL',
    evidence_count: 2,
  },
  ...overrides,
});

const state = (overrides: Partial<MemoryReviewQueueState> = {}): MemoryReviewQueueState => ({
  proposals: [proposal()],
  loading: false,
  error: null,
  refetch,
  approveProposal: approve,
  rejectProposal: reject,
  editProposal: edit,
  deferProposal: defer,
  ...overrides,
});

describe('MemoryReviewQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approve.mockResolvedValue(undefined);
    reject.mockResolvedValue(undefined);
    defer.mockResolvedValue(undefined);
  });

  it('groups related beliefs and merges their displayed evidence count', () => {
    vi.mocked(useMemoryReviewQueue).mockReturnValue(state({
      proposals: [
        proposal(),
        proposal({
          id: 'proposal-2',
          claim_text: 'Abel started at the Ring building.',
          confidence: 0.88,
          risk_level: 'LOW',
          metadata: {
            proposal_kind: 'event',
            group_key: 'starting-at-amazon-ring',
            group_label: 'Starting at Amazon/Ring',
            evidence_count: 1,
          },
        }),
      ],
    }));

    render(<MemoryReviewQueuePanel />);

    expect(screen.getByText('Starting at Amazon/Ring')).toBeInTheDocument();
    expect(screen.getByText('2 beliefs')).toBeInTheDocument();
    expect(screen.getByText('1 story groups')).toBeInTheDocument();
    expect(screen.getByText('3 evidence passages')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Approve belief' })).toHaveLength(2);
  });

  it('approves with the keyboard and announces completion', async () => {
    vi.mocked(useMemoryReviewQueue).mockReturnValue(state());
    const user = userEvent.setup();
    render(<MemoryReviewQueuePanel />);

    const button = screen.getByRole('button', { name: 'Approve belief' });
    button.focus();
    await user.keyboard('{Enter}');

    expect(approve).toHaveBeenCalledWith('proposal-1');
    expect(await screen.findByRole('status')).toHaveTextContent('Belief approved.');
  });

  it('rejects without prompting and records a clear reason', async () => {
    vi.mocked(useMemoryReviewQueue).mockReturnValue(state());
    const user = userEvent.setup();
    render(<MemoryReviewQueuePanel />);

    await user.click(screen.getByRole('button', { name: 'Not accurate' }));

    expect(reject).toHaveBeenCalledWith('proposal-1', 'User rejected the proposed belief');
    expect(await screen.findByRole('status')).toHaveTextContent('Belief rejected.');
  });

  it('shows correction impact, sensitivity, affected beliefs, mutation, and long evidence', async () => {
    const longEvidence = `I need to correct this carefully. ${'This source passage remains available as evidence. '.repeat(12)}`;
    vi.mocked(useMemoryReviewQueue).mockReturnValue(state({
      proposals: [proposal({
        claim_text: 'Abel is not a DJ.',
        confidence: 0.81,
        risk_level: 'HIGH',
        affected_claim_ids: ['dj-claim'],
        source_excerpt: longEvidence,
        metadata: {
          proposal_kind: 'retraction',
          normalized_summary: 'Abel is not a DJ.',
          proposed_mutation: 'Supersede the existing DJ belief; do not add a contradictory negative fact.',
          group_key: 'identity-correction',
          group_label: 'Identity correction',
          risk_reason: 'Changes an existing identity belief',
          sensitivity: 'PRIVATE',
          evidence_count: 1,
        },
      })],
    }));
    const user = userEvent.setup();
    render(<MemoryReviewQueuePanel />);

    expect(screen.getByText('high impact')).toBeInTheDocument();
    expect(screen.getByText('private')).toBeInTheDocument();
    expect(screen.getByText('81% certain')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show proposal evidence' }));
    expect(screen.getByText(/Supersede the existing DJ belief/)).toBeInTheDocument();
    expect(screen.getByText('Changes 1 existing belief')).toBeInTheDocument();
    expect(screen.getByText(longEvidence, { exact: false })).toBeInTheDocument();
  });

  it('keeps the proposal visible and announces an action failure', async () => {
    approve.mockRejectedValueOnce(new Error('Approval could not be saved'));
    vi.mocked(useMemoryReviewQueue).mockReturnValue(state());
    const user = userEvent.setup();
    render(<MemoryReviewQueuePanel />);

    await user.click(screen.getByRole('button', { name: 'Approve belief' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Approval could not be saved');
    expect(screen.getByText('Abel works as a Quality Assurance Technician at Amazon through an agency.')).toBeInTheDocument();
  });

  it('renders API failure and retries accessibly', async () => {
    vi.mocked(useMemoryReviewQueue).mockReturnValue(state({ proposals: [], error: 'Request failed' }));
    const user = userEvent.setup();
    render(<MemoryReviewQueuePanel />);

    expect(screen.getByText('The review queue could not be verified')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows the empty state and filters explicitly invalid proposals defensively', () => {
    vi.mocked(useMemoryReviewQueue).mockReturnValue(state({
      proposals: [proposal({
        claim_text: 'show me the new chat bubble styling',
        metadata: { proposal_integrity: { valid: false, rejection_reason: 'command_or_metaconversation' } },
      })],
    }));
    render(<MemoryReviewQueuePanel />);

    expect(screen.getByText('Nothing needs your review')).toBeInTheDocument();
    expect(screen.queryByText('show me the new chat bubble styling')).not.toBeInTheDocument();
  });

  it('renders a bounded loading state', () => {
    vi.mocked(useMemoryReviewQueue).mockReturnValue(state({ proposals: [], loading: true }));
    render(<MemoryReviewQueuePanel />);
    expect(screen.getByText('Checking proposed beliefs…')).toBeInTheDocument();
  });
});
