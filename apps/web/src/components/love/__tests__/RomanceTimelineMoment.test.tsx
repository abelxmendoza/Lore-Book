import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  buildRomanceTimelineMoment,
  buildRomanceTimelineMomentChatPrompt,
} from '../../../mocks/romanceTimelineMoment';
import { RomanceTimelineMomentPanel } from '../RomanceTimelineMomentPanel';
import { RelationshipTimeline } from '../RelationshipTimeline';

vi.mock('../../../lib/openChatWithFocus', () => ({
  openChatWithFocus: vi.fn(),
}));

vi.mock('../../../lib/openCharacterBookModal', () => ({
  openCharacterBookModal: vi.fn(),
}));

import { openChatWithFocus } from '../../../lib/openChatWithFocus';

describe('romance timeline moment', () => {
  beforeEach(() => {
    vi.mocked(openChatWithFocus).mockClear();
  });

  it('builds a paragraph summary and related lore links', () => {
    const moment = buildRomanceTimelineMoment({
      event: {
        id: 'date-001',
        date_type: 'first_date',
        date_time: '2024-01-01T00:00:00.000Z',
        location: 'Coffee shop downtown',
        description: 'First date - we talked for 4 hours',
        sentiment: 0.9,
        was_positive: true,
      },
      personName: 'Alex',
      relationshipId: 'rel-001',
      characterId: 'char-001',
      allEvents: [
        {
          id: 'date-001',
          date_type: 'first_date',
          date_time: '2024-01-01T00:00:00.000Z',
          description: 'First date - we talked for 4 hours',
          sentiment: 0.9,
          was_positive: true,
        },
        {
          id: 'date-002',
          date_type: 'first_kiss',
          date_time: '2024-01-10T00:00:00.000Z',
          description: 'First kiss',
          sentiment: 0.95,
          was_positive: true,
        },
      ],
    });

    expect(moment.summary.length).toBeGreaterThan(80);
    expect(moment.related.some((r) => r.label === 'Alex')).toBe(true);
    expect(moment.related.some((r) => r.kind === 'moment')).toBe(true);
    expect(buildRomanceTimelineMomentChatPrompt(moment, 'Alex')).toMatch(/first date/i);
  });

  it('opens moment panel from timeline click and continues to chat', () => {
    const onCloseParent = vi.fn();
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[
          {
            id: 'date-001',
            date_type: 'first_date',
            date_time: '2024-01-01T00:00:00.000Z',
            location: 'Coffee shop downtown',
            description: 'First date - we talked for 4 hours',
            sentiment: 0.9,
            was_positive: true,
          },
        ]}
        relationship={{
          id: 'rel-001',
          person_id: 'char-001',
          person_type: 'character',
          person_name: 'Alex',
          status: 'active',
        }}
        onCloseParentModal={onCloseParent}
      />,
    );

    fireEvent.click(screen.getByTestId('romance-timeline-moment-date-001'));
    expect(screen.getByTestId('romance-timeline-moment-panel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connected lore' })).toBeInTheDocument();
    expect(screen.getByTestId('romance-moment-continue-chat')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('romance-moment-continue-chat'));
    expect(onCloseParent).toHaveBeenCalled();
    expect(openChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        relationshipId: 'rel-001',
        entityName: 'Alex',
        sourceSurface: 'love',
      }),
    );
  });

  it('fires follow-up prompt into chat', () => {
    const moment = buildRomanceTimelineMoment({
      event: {
        id: 'date-001',
        date_type: 'first_date',
        date_time: '2024-01-01T00:00:00.000Z',
        description: 'First date',
        sentiment: 0.9,
        was_positive: true,
      },
      personName: 'Alex',
      relationshipId: 'rel-001',
      characterId: 'char-001',
      allEvents: [],
    });

    const onContinue = vi.fn();
    render(
      <RomanceTimelineMomentPanel
        moment={moment}
        personName="Alex"
        onClose={() => {}}
        onContinueInChat={onContinue}
      />,
    );

    fireEvent.click(screen.getAllByTestId('romance-moment-followup')[0]);
    expect(onContinue).toHaveBeenCalledWith(expect.stringMatching(/remember/i));
  });
});
