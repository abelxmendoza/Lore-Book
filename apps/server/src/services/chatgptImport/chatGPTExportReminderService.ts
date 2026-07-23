import { supabaseAdmin } from '../../lib/supabase';

export type ChatGPTExportReminderStatus =
  | 'not_requested'
  | 'requested'
  | 'uploaded'
  | 'imported'
  | 'dismissed';

export type ChatGPTExportReminderState = {
  status: ChatGPTExportReminderStatus;
  requestedAt: string | null;
  remindAt: string | null;
  lastRemindedAt: string | null;
  reminderCount: number;
  sourceFileId: string | null;
  completedAt: string | null;
  shouldRemind: boolean;
};

type StoredReminderState = {
  status?: ChatGPTExportReminderStatus;
  requested_at?: string | null;
  remind_at?: string | null;
  last_reminded_at?: string | null;
  reminder_count?: number;
  source_file_id?: string | null;
  completed_at?: string | null;
};

const METADATA_KEY = 'chatgpt_lore_import';
const DAY_MS = 86_400_000;

function toPublicState(value: StoredReminderState = {}): ChatGPTExportReminderState {
  const status = value.status ?? 'not_requested';
  const remindAt = value.remind_at ?? null;
  return {
    status,
    requestedAt: value.requested_at ?? null,
    remindAt,
    lastRemindedAt: value.last_reminded_at ?? null,
    reminderCount: Math.max(0, Number(value.reminder_count ?? 0)),
    sourceFileId: value.source_file_id ?? null,
    completedAt: value.completed_at ?? null,
    shouldRemind:
      status === 'requested' &&
      Boolean(remindAt) &&
      new Date(remindAt!).getTime() <= Date.now(),
  };
}

async function readUser(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user;
}

async function writeState(
  userId: string,
  currentMetadata: Record<string, unknown>,
  state: StoredReminderState,
): Promise<ChatGPTExportReminderState> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMetadata,
      [METADATA_KEY]: state,
    },
  });
  if (error) throw error;
  return toPublicState(state);
}

export const chatGPTExportReminderService = {
  async get(userId: string): Promise<ChatGPTExportReminderState> {
    const user = await readUser(userId);
    const stored = (user?.user_metadata?.[METADATA_KEY] ?? {}) as StoredReminderState;
    return toPublicState(stored);
  },

  async markRequested(userId: string, days = 3): Promise<ChatGPTExportReminderState> {
    const user = await readUser(userId);
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const prior = (metadata[METADATA_KEY] ?? {}) as StoredReminderState;
    const now = new Date();
    return writeState(userId, metadata, {
      ...prior,
      status: 'requested',
      requested_at: prior.requested_at ?? now.toISOString(),
      remind_at: new Date(now.getTime() + days * DAY_MS).toISOString(),
      completed_at: null,
    });
  },

  async remindLater(userId: string, days = 3): Promise<ChatGPTExportReminderState> {
    const user = await readUser(userId);
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const prior = (metadata[METADATA_KEY] ?? {}) as StoredReminderState;
    const now = new Date();
    return writeState(userId, metadata, {
      ...prior,
      status: 'requested',
      requested_at: prior.requested_at ?? now.toISOString(),
      remind_at: new Date(now.getTime() + days * DAY_MS).toISOString(),
      last_reminded_at: now.toISOString(),
      reminder_count: Math.max(0, Number(prior.reminder_count ?? 0)) + 1,
    });
  },

  async dismiss(userId: string): Promise<ChatGPTExportReminderState> {
    const user = await readUser(userId);
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const prior = (metadata[METADATA_KEY] ?? {}) as StoredReminderState;
    return writeState(userId, metadata, {
      ...prior,
      status: 'dismissed',
      remind_at: null,
    });
  },

  async markUploaded(userId: string, sourceFileId: string): Promise<ChatGPTExportReminderState> {
    const user = await readUser(userId);
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const prior = (metadata[METADATA_KEY] ?? {}) as StoredReminderState;
    return writeState(userId, metadata, {
      ...prior,
      status: 'uploaded',
      remind_at: null,
      source_file_id: sourceFileId,
    });
  },

  async markImported(userId: string, sourceFileId: string): Promise<ChatGPTExportReminderState> {
    const user = await readUser(userId);
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const prior = (metadata[METADATA_KEY] ?? {}) as StoredReminderState;
    return writeState(userId, metadata, {
      ...prior,
      status: 'imported',
      remind_at: null,
      source_file_id: sourceFileId,
      completed_at: new Date().toISOString(),
    });
  },
};
