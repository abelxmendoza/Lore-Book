import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
}));

vi.mock('../../src/lib/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: authState.getUserById,
        updateUserById: authState.updateUserById,
      },
    },
  },
}));

import { chatGPTExportReminderService } from '../../src/services/chatgptImport/chatGPTExportReminderService';

describe('chatGPTExportReminderService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    authState.metadata = { onboarding_completed: true };
    authState.getUserById.mockReset().mockImplementation(async () => ({
      data: { user: { user_metadata: authState.metadata } },
      error: null,
    }));
    authState.updateUserById.mockReset().mockImplementation(async (_userId, input) => {
      authState.metadata = input.user_metadata;
      return { data: { user: { user_metadata: authState.metadata } }, error: null };
    });
  });

  it('preserves existing metadata and schedules a reminder three days later', async () => {
    const result = await chatGPTExportReminderService.markRequested('synthetic-user', 3);

    expect(result.status).toBe('requested');
    expect(result.remindAt).toBe('2026-07-26T12:00:00.000Z');
    expect(result.shouldRemind).toBe(false);
    expect(authState.metadata.onboarding_completed).toBe(true);
  });

  it('marks a due reminder and retires it after upload', async () => {
    authState.metadata = {
      chatgpt_lore_import: {
        status: 'requested',
        requested_at: '2026-07-20T12:00:00.000Z',
        remind_at: '2026-07-23T11:00:00.000Z',
      },
    };

    expect((await chatGPTExportReminderService.get('synthetic-user')).shouldRemind).toBe(true);

    const uploaded = await chatGPTExportReminderService.markUploaded('synthetic-user', 'source-1');
    expect(uploaded).toMatchObject({
      status: 'uploaded',
      sourceFileId: 'source-1',
      remindAt: null,
      shouldRemind: false,
    });
  });
});
