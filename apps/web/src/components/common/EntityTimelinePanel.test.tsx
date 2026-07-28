import { Clock } from 'lucide-react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../timeline/EventTimelineSwimlanes', () => ({
  EventTimelineSwimlanes: ({
    lanes,
    events,
  }: {
    lanes: Array<{ key: string; label: string }>;
    events: Array<{ laneKey: string }>;
  }) => (
    <div data-testid="swimlanes-mock">
      {lanes.map((lane) => (
        <div key={lane.key} data-testid={`lane-${lane.key}`}>
          {lane.label}:{events.filter((e) => e.laneKey === lane.key).length}
        </div>
      ))}
    </div>
  ),
}));

import { EntityTimelinePanel, type TimelinePanelEvent } from './EntityTimelinePanel';

const lanes = [
  { key: 'with', label: 'With you', accent: 'emerald' as const },
  { key: 'without', label: 'Without you', accent: 'sky' as const },
];

const events: TimelinePanelEvent[] = [
  { id: '1', title: 'First event', date: '2026-01-01', laneKey: 'with', summary: 'Summary one' },
  { id: '2', title: 'Second event', date: '2026-01-02', laneKey: 'without', summary: 'Summary two' },
];

function renderPanel(overrides: Partial<Parameters<typeof EntityTimelinePanel>[0]> = {}) {
  return render(
    <EntityTimelinePanel
      icon={Clock}
      title="Test timeline"
      lanes={lanes}
      events={events}
      emptyTitle="Nothing here"
      emptyHint="Nothing to show yet."
      {...overrides}
    />,
  );
}

describe('EntityTimelinePanel', () => {
  it('renders List view by default (matchMedia mocked to non-matching in tests)', () => {
    renderPanel();

    expect(screen.getByText('First event')).toBeInTheDocument();
    expect(screen.getByText('Second event')).toBeInTheDocument();
    expect(screen.queryByTestId('swimlanes-mock')).not.toBeInTheDocument();
  });

  it('renders Swimlanes view when defaultView is set explicitly', () => {
    renderPanel({ defaultView: 'swimlanes' });

    expect(screen.getByTestId('swimlanes-mock')).toBeInTheDocument();
    expect(screen.getByTestId('lane-with')).toHaveTextContent('With you:1');
    expect(screen.getByTestId('lane-without')).toHaveTextContent('Without you:1');
  });

  it('puts the Swimlanes toggle button before the List button', () => {
    renderPanel();

    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.textContent);
    const swimIdx = labels.findIndex((t) => t?.includes('Swimlanes'));
    const listIdx = labels.findIndex((t) => t === 'List');

    expect(swimIdx).toBeGreaterThanOrEqual(0);
    expect(listIdx).toBeGreaterThanOrEqual(0);
    expect(swimIdx).toBeLessThan(listIdx);
  });

  it('switches between List and Swimlanes when the toggle buttons are clicked', () => {
    renderPanel();

    expect(screen.queryByTestId('swimlanes-mock')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /swimlanes/i }));
    expect(screen.getByTestId('swimlanes-mock')).toBeInTheDocument();
    expect(screen.queryByText('First event')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^list$/i }));
    expect(screen.queryByTestId('swimlanes-mock')).not.toBeInTheDocument();
    expect(screen.getByText('First event')).toBeInTheDocument();
  });

  it('renders emptyTitle/emptyHint when there are no events', () => {
    renderPanel({ events: [] });

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument();
  });

  it('fires onEventSelect with the clicked event from the default List renderer', () => {
    const onEventSelect = vi.fn();
    renderPanel({ onEventSelect });

    fireEvent.click(screen.getByText('First event'));

    expect(onEventSelect).toHaveBeenCalledTimes(1);
    expect(onEventSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1', title: 'First event' }));
  });

  it('supports a listItems override distinct from the swimlane events', () => {
    type ListItem = { id: string; date: string; label: string };
    const listItems: ListItem[] = [
      { id: 'l1', date: '2026-01-03', label: 'Custom list item' },
    ];

    render(
      <EntityTimelinePanel<TimelinePanelEvent, ListItem>
        icon={Clock}
        title="Test timeline"
        lanes={lanes}
        events={events}
        listItems={listItems}
        emptyTitle="Nothing here"
        emptyHint="Nothing to show yet."
        renderListItem={(item) => <div data-testid="custom-item">{item.label}</div>}
      />,
    );

    expect(screen.getByTestId('custom-item')).toHaveTextContent('Custom list item');
    expect(screen.queryByText('First event')).not.toBeInTheDocument();
  });
});
