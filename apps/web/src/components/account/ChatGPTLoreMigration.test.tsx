import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '../../test/utils';
import {
  analyzeChatGPTExport,
  deleteChatGPTExportSource,
  processChatGPTExport,
} from '../../api/chatGPTLoreMigration';
import {
  getChatGPTExportReminder,
  updateChatGPTExportReminder,
} from '../../api/chatGPTExportReminder';
import { ChatGPTLoreMigration } from './ChatGPTLoreMigration';

vi.mock('../../api/chatGPTLoreMigration', () => ({
  analyzeChatGPTExport: vi.fn(),
  processChatGPTExport: vi.fn(),
  deleteChatGPTExportSource: vi.fn(),
}));
vi.mock('../../api/chatGPTExportReminder', () => ({
  getChatGPTExportReminder: vi.fn(),
  updateChatGPTExportReminder: vi.fn(),
}));

const inventory = {
  conversations: [
    {
      id: 'conversation-1',
      title: 'Vanguard Robotics plans',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
      messageCount: 4,
      userMessageCount: 2,
      assistantMessageCount: 2,
      preview: 'I am building Vanguard Robotics.',
    },
  ],
  conversationCount: 1,
  messageCount: 4,
  userMessageCount: 2,
  assistantMessageCount: 2,
  earliestAt: '2025-01-01T00:00:00.000Z',
  latestAt: '2025-01-02T00:00:00.000Z',
  sourceFiles: ['conversations.json'],
};

describe('ChatGPTLoreMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzeChatGPTExport).mockResolvedValue({
      success: true,
      sourceFileId: 'source-1',
      reused: false,
      inventory,
    });
    vi.mocked(processChatGPTExport).mockResolvedValue({
      success: true,
      sourceFileId: 'source-1',
      completed: true,
      cursor: 1,
      total: 1,
      progress: 100,
      stats: {
        conversationsProcessed: 1,
        userMessagesConsidered: 2,
        assistantMessagesExcluded: 2,
        hypotheticalMessagesExcluded: 0,
        sensitiveClaimsExcluded: 0,
        proposalsCreated: 1,
        proposalsDeduplicated: 0,
        categoryCounts: { projects: 1 },
        examples: { projects: ['I am building Vanguard Robotics.'] },
      },
      profilePreview: {
        categoryCounts: { projects: 1 },
        examples: { projects: ['I am building Vanguard Robotics.'] },
      },
    });
    vi.mocked(deleteChatGPTExportSource).mockResolvedValue();
    vi.mocked(getChatGPTExportReminder).mockResolvedValue({
      status: 'not_requested',
      requestedAt: null,
      remindAt: null,
      lastRemindedAt: null,
      reminderCount: 0,
      sourceFileId: null,
      completedAt: null,
      shouldRemind: false,
    });
    vi.mocked(updateChatGPTExportReminder).mockResolvedValue({
      status: 'requested',
      requestedAt: '2026-07-23T00:00:00.000Z',
      remindAt: '2026-07-26T00:00:00.000Z',
      lastRemindedAt: null,
      reminderCount: 0,
      sourceFileId: null,
      completedAt: null,
      shouldRemind: false,
    });
  });

  it('inventories an export, creates review proposals, and deletes the private archive by default', async () => {
    const user = userEvent.setup();
    const onOpenMemoryReview = vi.fn();
    render(<ChatGPTLoreMigration onOpenMemoryReview={onOpenMemoryReview} />);

    const file = new File(['[]'], 'conversations.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('chatgpt-export-file'), file);

    expect(await screen.findByText('Vanguard Robotics plans')).toBeInTheDocument();
    expect(screen.getByText('Assistant excluded')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create review proposals/i }));

    await waitFor(() => {
      expect(processChatGPTExport).toHaveBeenCalledWith(
        'source-1',
        expect.objectContaining({
          conversationIds: ['conversation-1'],
          includeSensitive: false,
        }),
      );
    });
    expect(deleteChatGPTExportSource).toHaveBeenCalledWith('source-1');
    expect(await screen.findByText(/your lore proposals are ready/i)).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /review before adding/i }));
    expect(onOpenMemoryReview).toHaveBeenCalledTimes(1);
  });

  it('lets a user schedule the export reminder and continue without a file', async () => {
    const user = userEvent.setup();
    render(<ChatGPTLoreMigration onOpenMemoryReview={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /i requested it/i }));

    await waitFor(() => {
      expect(updateChatGPTExportReminder).toHaveBeenCalledWith('requested', 3);
    });
    expect(await screen.findByText(/waiting for your openai export/i)).toBeInTheDocument();
  });
});
