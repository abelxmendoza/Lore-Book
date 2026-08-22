import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PerceptionEntry } from '../../types/perception';

import { PerceptionEntryCard } from './PerceptionEntryCard';

const perception: PerceptionEntry = {
  id: 'perception-1',
  user_id: 'synthetic-user',
  subject_alias: 'Jamie',
  content: 'I believed Jamie wanted more distance after our last conversation.',
  source: 'told_by',
  source_detail: 'Told by Marcus after the meetup',
  confidence_level: 0.6,
  timestamp_heard: '2026-08-01T12:00:00.000Z',
  related_memory_id: 'memory-1',
  impact_on_me: 'I waited before reaching out again.',
  status: 'unverified',
  retracted: false,
  evolution_notes: ['Later context made this feel less certain.'],
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-02T12:00:00.000Z',
};

const longBelief =
  'I was told that I should ask for Vexadoll, one of my managers who interviewed me.';
const longImpact =
  'It likely guided me on how to navigate the workplace or who to contact, and may have made me more prepared to speak with him.';

function makePerception(overrides: Partial<PerceptionEntry> = {}): PerceptionEntry {
  return {
    id: 'perception-long',
    user_id: 'user-1',
    subject_person_id: 'person-1',
    subject_alias: 'Vexadoll',
    content: longBelief,
    source: 'told_by',
    source_detail: 'Colleague recommendation',
    confidence_level: 0.6,
    sentiment: 'neutral',
    timestamp_heard: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: longImpact,
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: null,
    evolution_notes: [],
    created_in_high_emotion: false,
    review_reminder_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('PerceptionEntryCard', () => {
  it('keeps trust context and useful details visible on the card', () => {
    render(<PerceptionEntryCard perception={perception} />);

    expect(screen.getByText('told by')).toBeInTheDocument();
    expect(screen.getByText('60% certain')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('Impact on me')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wanted more distance after our last' })).toBeInTheDocument();
    expect(screen.getByText('I waited before reaching out again.')).toBeInTheDocument();
    expect(screen.getByText('Linked memory')).toBeInTheDocument();
    expect(screen.getByText('Changed 1×')).toBeInTheDocument();
    expect(screen.getByText('Belief at the time — not verified fact')).toBeInTheDocument();
  });

  it('opens from the keyboard when the card is interactive', () => {
    const onClick = vi.fn();
    render(<PerceptionEntryCard perception={perception} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: /a perception about Jamie/i }), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith(perception);
  });

  it('shows the full belief and impact text without clamping or ellipsis', () => {
    render(<PerceptionEntryCard perception={makePerception()} />);

    const beliefText = screen.getByText(longBelief);
    const impactText = screen.getByText(longImpact);
    expect(beliefText).toBeInTheDocument();
    expect(impactText).toBeInTheDocument();
    expect(screen.getByText('Impact on me')).toBeInTheDocument();
    expect(screen.getByText(/told by/i)).toBeInTheDocument();
    expect(screen.getByText('60% certain')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('Vexadoll')).toBeInTheDocument();

    expect(beliefText).not.toHaveClass('truncate', 'line-clamp-2');
    expect(impactText).not.toHaveClass('truncate', 'line-clamp-2');
  });

  it('keeps long subject names fully visible instead of truncating', () => {
    const longName = 'Vexadoll Venkataramanan-Subramanian';
    render(
      <PerceptionEntryCard
        perception={makePerception({ subject_alias: longName })}
      />,
    );

    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  it('uses an explicit stored short title on cards when one exists', () => {
    render(
      <PerceptionEntryCard
        perception={makePerception({ metadata: { short_title: 'Manager recommendation' } })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Manager recommendation' })).toBeInTheDocument();
  });
});
