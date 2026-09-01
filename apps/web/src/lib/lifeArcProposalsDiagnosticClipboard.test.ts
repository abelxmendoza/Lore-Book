import { describe, expect, it } from 'vitest';

import type { LifeArcProposal } from '../hooks/useLifeArcProposals';
import {
  buildLifeArcProposalsClipboardText,
  buildLifeArcProposalsDiagnosticClipboardText,
} from './lifeArcProposalsDiagnosticClipboard';

const sampleProposal: LifeArcProposal = {
  id: 'proposal-1',
  fingerprint: 'abc123',
  title: 'Career chapter · 2025–2026',
  arc_type: 'work',
  track: 'career',
  start_date: '2025-01-01',
  end_date: '2026-01-01',
  confidence: 0.9,
  explanation: 'Two dated milestones connect this chapter.',
  source_record_ids: ['resolved_event:one', 'resolved_event:two'],
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

describe('buildLifeArcProposalsClipboardText', () => {
  it('exports user-facing proposal summaries without diagnostic ids', () => {
    const text = buildLifeArcProposalsClipboardText([sampleProposal]);

    expect(text).toContain('Life arc suggestions (1 item)');
    expect(text).toContain('Career chapter · 2025–2026');
    expect(text).toContain('Swimlane: Career');
    expect(text).toContain('Joined Vanguard Robotics (2025-01-01)');
    expect(text).not.toContain('fingerprint:');
    expect(text).not.toContain('sourceKind:');
  });
});

describe('buildLifeArcProposalsDiagnosticClipboardText', () => {
  it('includes admin diagnostic fields for proposals and audit context', () => {
    const text = buildLifeArcProposalsDiagnosticClipboardText({
      proposals: [sampleProposal],
      canonicalItemCount: 12,
      audit: {
        canonicalItems: 12,
        datedItems: 10,
        eligibleItems: 8,
        unresolvedItems: 2,
        existingArcs: 1,
        drawableArcs: 1,
        suppressedArcs: { single_day_span: 1 },
        proposedArcs: 1,
        dataErrors: [{ source: 'resolved_event:three', message: 'Missing occurred_at' }],
      },
      arcs: [{
        id: 'arc-1',
        title: 'Existing career arc',
        track: 'career',
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      } as never],
      suppressedArcs: { single_day_span: 1 },
    });

    expect(text).toContain('# Life arc suggestions — admin diagnostic dump');
    expect(text).toContain('Pending proposals: 1');
    expect(text).toContain('canonicalItems: 12');
    expect(text).toContain('resolved_event:three: Missing occurred_at');
    expect(text).toContain('id: proposal-1');
    expect(text).toContain('fingerprint: abc123');
    expect(text).toContain('source_record_ids: resolved_event:one, resolved_event:two');
    expect(text).toContain('sourceKind: resolved_event');
    expect(text).toContain('Joined Vanguard Robotics');
    expect(text).toContain('Existing career arc');
  });
});
