import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '../../test/utils';
import {
  getChatGPTExportReminder,
  updateChatGPTExportReminder,
} from '../../api/chatGPTExportReminder';
import { ChatGPTExportReminder } from './ChatGPTExportReminder';

vi.mock('../../api/chatGPTExportReminder', () => ({
  getChatGPTExportReminder: vi.fn(),
  updateChatGPTExportReminder: vi.fn(),
}));

vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>();
  return {
    ...actual,
    useAuth: () => ({ user: { id: 'synthetic-user' } }),
  };
});

describe('ChatGPTExportReminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getChatGPTExportReminder).mockResolvedValue({
      status: 'requested',
      requestedAt: '2026-07-20T00:00:00.000Z',
      remindAt: '2026-07-23T00:00:00.000Z',
      lastRemindedAt: null,
      reminderCount: 0,
      sourceFileId: null,
      completedAt: null,
      shouldRemind: true,
    });
    vi.mocked(updateChatGPTExportReminder).mockResolvedValue({
      status: 'requested',
      requestedAt: '2026-07-20T00:00:00.000Z',
      remindAt: '2026-07-26T00:00:00.000Z',
      lastRemindedAt: '2026-07-23T00:00:00.000Z',
      reminderCount: 1,
      sourceFileId: null,
      completedAt: null,
      shouldRemind: false,
    });
  });

  it('shows only when due and can be snoozed for three days', async () => {
    const user = userEvent.setup();
    render(<ChatGPTExportReminder />);

    expect(await screen.findByText(/your chatgpt export may be ready/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remind in 3 days/i }));

    await waitFor(() => {
      expect(updateChatGPTExportReminder).toHaveBeenCalledWith('remind_later', 3);
    });
    expect(screen.queryByText(/your chatgpt export may be ready/i)).not.toBeInTheDocument();
  });
});
