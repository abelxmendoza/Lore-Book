import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EventTimelineSwimlanes } from './EventTimelineSwimlanes';

describe('EventTimelineSwimlanes — viewport year', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a centered year above the timeline that updates on horizontal scroll', () => {
    render(
      <EventTimelineSwimlanes
        lanes={[
          { key: 'with_you', label: 'With you', accent: 'emerald' },
          { key: 'group_only', label: 'Group only', accent: 'sky' },
        ]}
        events={[
          {
            id: 'e1',
            title: 'Old milestone',
            date: '2020-06-15',
            laneKey: 'with_you',
          },
          {
            id: 'e2',
            title: 'Recent moment',
            date: new Date().toISOString().slice(0, 10),
            laneKey: 'group_only',
          },
        ]}
      />,
    );

    const yearEl = screen.getByTestId('event-swimlanes-viewport-year');
    expect(yearEl).toBeInTheDocument();
    expect(yearEl).toHaveClass('justify-center');
    expect(yearEl.textContent).toMatch(/^\d{4}$/);

    const scroll = screen.getByTestId('event-swimlanes-scroll');
    Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(scroll, 'scrollWidth', { configurable: true, value: 8000 });

    act(() => {
      Object.defineProperty(scroll, 'scrollLeft', { configurable: true, value: 0, writable: true });
      fireEvent.scroll(scroll);
    });
    const yearAtStart = Number(yearEl.textContent);

    act(() => {
      Object.defineProperty(scroll, 'scrollLeft', { configurable: true, value: 6000, writable: true });
      fireEvent.scroll(scroll);
    });
    const yearNearEnd = Number(yearEl.textContent);

    expect(yearAtStart).toBeLessThanOrEqual(yearNearEnd);
    expect(yearNearEnd).toBe(new Date().getFullYear());
  });
});
