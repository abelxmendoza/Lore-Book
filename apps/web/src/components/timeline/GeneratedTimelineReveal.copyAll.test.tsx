import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GeneratedTimelineReveal } from './GeneratedTimelineReveal';

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

describe('GeneratedTimelineReveal — Copy all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies the output timeline as plain text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <GeneratedTimelineReveal
        query="my nightlife"
        events={[
          {
            id: 'mock-gen-1',
            start_time: '2024-08-10T00:00:00Z',
            content: 'Late set at the depot.',
            timeline_names: ['Social'],
            stateChange: 'Night out',
          },
        ]}
        isMock
      />,
    );

    fireEvent.click(screen.getByTestId('generated-timeline-copy-all'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = String(writeText.mock.calls[0]?.[0] ?? '');
    expect(text).toContain('Universal Timeline Search — my nightlife');
    expect(text).toContain('Late set at the depot.');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('hides Copy all when there are no moments', () => {
    render(<GeneratedTimelineReveal query="empty" events={[]} />);
    expect(screen.queryByTestId('generated-timeline-copy-all')).not.toBeInTheDocument();
  });

  it('opens the current timeline context in main chat', () => {
    const onOpenChat = vi.fn();
    render(<GeneratedTimelineReveal query="Everything with Marcus" events={[]} onOpenChat={onOpenChat} />);

    fireEvent.click(screen.getByTestId('generated-timeline-open-chat'));

    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Talk about this in chat')).toBeInTheDocument();
  });
});
