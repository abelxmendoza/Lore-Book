import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerceptionEntryCard } from './PerceptionEntryCard';
import type { PerceptionEntry } from '../../types/perception';

const longBelief =
  'I was told that I should ask for Kaustubh, one of my managers who interviewed me.';
const longImpact =
  'It likely guided me on how to navigate the workplace or who to contact, and may have made me more prepared to speak with him.';

function makePerception(overrides: Partial<PerceptionEntry> = {}): PerceptionEntry {
  return {
    id: 'perception-kaustubh',
    user_id: 'user-1',
    subject_person_id: 'person-1',
    subject_alias: 'Kaustubh',
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
  it('shows the full belief and impact text without clamping or ellipsis', () => {
    render(<PerceptionEntryCard perception={makePerception()} />);

    expect(screen.getByText(longBelief)).toBeInTheDocument();
    expect(screen.getByText(longImpact)).toBeInTheDocument();
    expect(screen.getByText('Impact on Me:')).toBeInTheDocument();
    expect(screen.getByText(/told by/i)).toBeInTheDocument();
    expect(screen.getByText('60% certain')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('Kaustubh')).toBeInTheDocument();

    expect(document.body.textContent).not.toMatch(/…|\.\.\./);
  });

  it('keeps long subject names fully visible instead of truncating', () => {
    const longName = 'Kaustubh Venkataramanan-Subramanian';
    render(
      <PerceptionEntryCard
        perception={makePerception({ subject_alias: longName })}
      />,
    );

    expect(screen.getByText(longName)).toBeInTheDocument();
  });
});
