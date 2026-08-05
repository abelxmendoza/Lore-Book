import { describe, expect, it } from 'vitest';

import { buildPostedEventIngestPrompt } from './postEventChatHandoff';

describe('buildPostedEventIngestPrompt', () => {
  it('asks to enrich an already-saved event without duplicating', () => {
    const prompt = buildPostedEventIngestPrompt({
      eventId: 'evt-1',
      title: 'Backyard Flyer Show',
      date: '2024-06-01',
      placeName: 'Northwind Depot',
      organizationName: 'Eastside Collective',
      story: 'Marcus brought the PA.',
      photoCount: 2,
    });

    expect(prompt).toContain('already saved');
    expect(prompt).toContain('evt-1');
    expect(prompt).toContain('Backyard Flyer Show');
    expect(prompt).toContain('Northwind Depot');
    expect(prompt).toContain('Eastside Collective');
    expect(prompt).toContain('Marcus brought the PA.');
    expect(prompt).toContain('2 flyer/photos');
    expect(prompt).toContain('EVENT ENRICHMENT MODE');
    expect(prompt).toContain('TARGET EVENT');
    expect(prompt).toMatch(/canonical ingestion object/i);
    expect(prompt).toMatch(/unresolved participant/i);
    expect(prompt).toMatch(/organizations\/groups/i);
    expect(prompt).toMatch(/Do not create a duplicate event/i);
    expect(prompt).not.toMatch(/\bpost an event\b/i);
  });

  it('supports story-only dumps', () => {
    const prompt = buildPostedEventIngestPrompt({
      eventId: 'evt-2',
      title: 'We crashed a house show',
      date: 'unknown / not specified',
      story: 'We crashed a house show and ended up at Northwind Depot.',
      photoCount: 0,
      storyOnly: true,
    });
    expect(prompt).toMatch(/dumped a Life Log moment/i);
    expect(prompt).toMatch(/Approximate dates/i);
  });
});
