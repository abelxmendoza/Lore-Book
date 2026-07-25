import { describe, expect, it } from 'vitest';
import { buildGeneratedTimelineClipboardText } from './generatedTimelineClipboard';

describe('buildGeneratedTimelineClipboardText', () => {
  it('formats chronological output with query title and filters', () => {
    const text = buildGeneratedTimelineClipboardText(
      'my nightlife',
      [
        {
          id: '2',
          start_time: '2024-08-10T00:00:00Z',
          content: 'Late set at the depot.',
          timeline_names: ['Social'],
        },
        {
          id: '1',
          start_time: '2023-11-20T00:00:00Z',
          content: 'First night out with the crew.',
          timeline_names: ['Social', 'Friends'],
          stateChange: 'Inner circle',
        },
      ],
      { isMock: true },
    );

    expect(text).toContain('Universal Timeline Search — my nightlife (2 items)');
    expect(text).toContain('Filters: simulated preview');
    // Older first
    expect(text.indexOf('First night out')).toBeLessThan(text.indexOf('Late set'));
    expect(text).toContain('Lanes: Social, Friends');
    expect(text).toContain('State change: Inner circle');
  });

  it('returns empty marker when there are no moments', () => {
    const text = buildGeneratedTimelineClipboardText('empty query', []);
    expect(text).toContain('(0 items)');
    expect(text).toContain('(empty)');
  });
});
