import { describe, expect, it } from 'vitest';
import {
  createPendingLifecycle,
  describeMessageLifecycle,
  withLifecyclePatch,
} from './messageLifecycle';

describe('messageLifecycle', () => {
  it('never recommends reload when only device vault exists', () => {
    const state = withLifecyclePatch(createPendingLifecycle(), {
      localPersistence: 'saved',
      cloudPersistence: 'failed',
      processing: 'failed',
    });
    const desc = describeMessageLifecycle(state);
    expect(desc.allowReloadAdvice).toBe(false);
    expect(desc.primaryAction).toBe('retry_sync');
    expect(desc.title.toLowerCase()).toContain('cloud');
  });

  it('separates cloud-saved generation failure from sync failure', () => {
    const state = withLifecyclePatch(createPendingLifecycle(), {
      localPersistence: 'saved',
      cloudPersistence: 'saved',
      processing: 'failed',
    });
    const desc = describeMessageLifecycle(state);
    expect(desc.tone).toBe('warn');
    expect(desc.allowReloadAdvice).toBe(true);
    expect(desc.title.toLowerCase()).toContain('reply failed');
  });

  it('keeps summary failures independent of message save state', () => {
    const state = withLifecyclePatch(createPendingLifecycle(), {
      localPersistence: 'saved',
      cloudPersistence: 'saved',
      processing: 'completed',
      summary: 'failed',
    });
    expect(state.summary).toBe('failed');
    expect(state.cloudPersistence).toBe('saved');
    const desc = describeMessageLifecycle(state);
    expect(desc.title.toLowerCase()).toContain('saved to cloud');
  });
});
