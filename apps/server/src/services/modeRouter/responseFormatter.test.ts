import { describe, expect, it } from 'vitest';

import { formatModeResponse } from './responseFormatter';

describe('formatModeResponse grounded recall contract', () => {
  it('does not report focused recall when no supporting source exists', () => {
    const response = formatModeResponse({
      content: 'A projection-only answer.',
      response_mode: 'FOCUSED_RECALL',
      metadata: {},
    }, 'FOUNDATION_RECALL');

    expect(response.metadata.response_mode).toBe('PROJECTION_SYNTHESIS');
  });

  it('preserves focused recall when supporting sources exist', () => {
    const response = formatModeResponse({
      content: 'A grounded answer.',
      response_mode: 'FOCUSED_RECALL',
      metadata: {
        sources: [{ type: 'knowledge', id: 'source-1', title: 'Supporting record' }],
      },
    }, 'FOUNDATION_RECALL');

    expect(response.metadata.response_mode).toBe('FOCUSED_RECALL');
  });
});
