import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineSwimlanes } from './TimelineSwimlanes';
import { copyTextToClipboard } from '../../lib/listClipboard';
import type { LifeArc } from '../../hooks/useLifeArcs';
import type { ChronologyEntry } from '../../types/timelineV2';

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('../../contexts/EntityModalContext', () => ({
  useEntityModal: vi.fn(() => ({ openMemory: vi.fn() })),
}));

vi.mock('../../lib/listClipboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/listClipboard')>()),
  copyTextToClipboard: vi.fn(async () => true),
}));

function makeArc(overrides: Partial<LifeArc> = {}): LifeArc {
  return {
    id: 'arc-1',
    title: 'Career chapter',
    arc_type: 'work',
    track: 'career',
    dominant_emotion: null,
    emotional_arc: null,
    parent_id: null,
    start_date: '2023-01-01',
    end_date: '2025-06-01',
    is_active: true,
    summary: null,
    confidence: 0.9,
    source: 'inferred',
    tags: [],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ChronologyEntry> = {}): ChronologyEntry {
  return {
    id: 'entry-1',
    user_id: 'user-1',
    journal_entry_id: 'je-1',
    start_time: '2024-06-15T12:00:00.000Z',
    time_precision: 'day',
    time_confidence: 0.9,
    content: 'A memory',
    timeline_memberships: [],
    ...overrides,
  };
}

describe('TimelineSwimlanes zoom scales', () => {
  beforeEach(() => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 860,
    });
  });

  const arc = makeArc();
  const entry = makeEntry();
  const eras = [
    {
      id: 'era-college',
      label: 'College years',
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    },
  ];

  it('opens on a density-based scale with an active chip', () => {
    render(
      <TimelineSwimlanes
        arcs={[arc]}
        arcsByTrack={{ career: [arc] }}
        activeArcs={[arc]}
        entries={[entry]}
        loading={false}
        lifeEras={eras}
      />,
    );

    const chrome = screen.getByTestId('timeline-zoom-chrome');
    const checked = within(chrome).getAllByRole('radio').filter(
      (el) => el.getAttribute('aria-checked') === 'true',
    );
    expect(checked).toHaveLength(1);
  });

  it('switches scale chip and hides era bands on Month', async () => {
    const user = userEvent.setup();
    render(
      <TimelineSwimlanes
        arcs={[arc]}
        arcsByTrack={{ career: [arc] }}
        activeArcs={[arc]}
        entries={[entry]}
        loading={false}
        lifeEras={eras}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Month' }));
    expect(screen.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('swimlane-era-band')).not.toBeInTheDocument();
  });

  it('keeps era bands at 5 years', async () => {
    const user = userEvent.setup();
    render(
      <TimelineSwimlanes
        arcs={[arc]}
        arcsByTrack={{ career: [arc] }}
        activeArcs={[arc]}
        entries={[entry]}
        loading={false}
        lifeEras={eras}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '5 years' }));
    expect(screen.getByRole('radio', { name: '5 years' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('swimlane-era-band')).toBeInTheDocument();
  });

  it('exposes a Go to present control', () => {
    render(
      <TimelineSwimlanes
        arcs={[arc]}
        arcsByTrack={{ career: [arc] }}
        activeArcs={[arc]}
        entries={[entry]}
        loading={false}
        lifeEras={eras}
      />,
    );

    const btn = screen.getByTestId('swimlanes-go-to-present');
    expect(btn).toHaveAttribute('aria-label', 'Go to present');
  });

  it('exposes Copy all for the canvas dump', () => {
    render(
      <TimelineSwimlanes
        arcs={[arc]}
        arcsByTrack={{ career: [arc] }}
        activeArcs={[arc]}
        entries={[entry]}
        loading={false}
        lifeEras={eras}
      />,
    );

    expect(screen.getByTestId('swimlanes-copy-all')).toHaveAttribute(
      'aria-label',
      'Copy all swimlanes timeline',
    );
  });

  it('copies the diagnostic dump and confirms success', async () => {
    const user = userEvent.setup();
    render(
      <TimelineSwimlanes
        arcs={[arc]}
        arcsByTrack={{ career: [arc] }}
        activeArcs={[arc]}
        entries={[entry]}
        loading={false}
        lifeEras={eras}
      />,
    );

    await user.click(screen.getByTestId('swimlanes-copy-all'));

    expect(copyTextToClipboard).toHaveBeenCalledWith(expect.stringContaining('## Diagnostics'));
    expect(screen.getByText('Diagnostics copied')).toBeInTheDocument();
  });

  it('keeps the arc title pinned to the visible part of a bar while scrolling', () => {
    render(
      <TimelineSwimlanes
        arcs={[arc]}
        arcsByTrack={{ career: [arc] }}
        activeArcs={[arc]}
        entries={[entry]}
        loading={false}
        lifeEras={eras}
      />,
    );

    const title = screen.getByTestId('swimlane-arc-title');
    const canvas = screen.getByTestId('swimlane-scroll-viewport');
    expect(title).toHaveTextContent('Career chapter');
    const initialLeft = Number.parseFloat(title.style.left);

    Object.defineProperty(canvas, 'scrollLeft', {
      configurable: true,
      value: 500,
    });
    fireEvent.scroll(canvas);

    expect(Number.parseFloat(title.style.left)).toBeGreaterThan(initialLeft);
    expect(title).toHaveClass('absolute');
  });
});
