import { fetchJson } from '../lib/api';

export type ChatGPTExportReminderState = {
  status: 'not_requested' | 'requested' | 'uploaded' | 'imported' | 'dismissed';
  requestedAt: string | null;
  remindAt: string | null;
  lastRemindedAt: string | null;
  reminderCount: number;
  sourceFileId: string | null;
  completedAt: string | null;
  shouldRemind: boolean;
};

export function getChatGPTExportReminder(): Promise<ChatGPTExportReminderState> {
  return fetchJson(`/api/onboarding/chatgpt-export-reminder?fresh=${Date.now()}`);
}

export function updateChatGPTExportReminder(
  action: 'requested' | 'remind_later' | 'dismiss',
  days = 3,
): Promise<ChatGPTExportReminderState> {
  return fetchJson('/api/onboarding/chatgpt-export-reminder', {
    method: 'PATCH',
    body: JSON.stringify(action === 'dismiss' ? { action } : { action, days }),
  });
}
