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

describe('PerceptionEntryCard', () => {
  it('keeps trust context and useful details visible on the card', () => {
    render(<PerceptionEntryCard perception={perception} />);

    expect(screen.getByText('told by')).toBeInTheDocument();
    expect(screen.getByText('60% certain')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('Impact on me')).toBeInTheDocument();
    expect(screen.getByText('I waited before reaching out again.')).toBeInTheDocument();
    expect(screen.getByText('Linked memory')).toBeInTheDocument();
    expect(screen.getByText('Changed 1×')).toBeInTheDocument();
    expect(screen.getByText('Belief at the time — not verified fact')).toBeInTheDocument();
  });

  it('opens from the keyboard when the card is interactive', () => {
    const onClick = vi.fn();
    render(<PerceptionEntryCard perception={perception} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Open perception about Jamie' }), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith(perception);
  });
});
