import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { parseChatGPTExport } from '../../src/services/chatgptImport/chatGPTExportParser';

const syntheticConversation = {
  id: 'conversation-1',
  title: 'Planning Vanguard Robotics',
  create_time: 1_700_000_000,
  update_time: 1_700_000_100,
  current_node: 'assistant-1',
  mapping: {
    root: { id: 'root', parent: null, children: ['user-1'], message: null },
    'user-1': {
      id: 'user-1',
      parent: 'root',
      children: ['assistant-1', 'discarded-branch'],
      message: {
        id: 'message-user-1',
        author: { role: 'user' },
        create_time: 1_700_000_010,
        content: { parts: ['I am building Vanguard Robotics with Jamie.'] },
      },
    },
    'assistant-1': {
      id: 'assistant-1',
      parent: 'user-1',
      children: [],
      message: {
        id: 'message-assistant-1',
        author: { role: 'assistant' },
        create_time: 1_700_000_020,
        content: { parts: ['That sounds like an important project.'] },
      },
    },
    'discarded-branch': {
      id: 'discarded-branch',
      parent: 'user-1',
      children: [],
      message: {
        id: 'message-discarded',
        author: { role: 'assistant' },
        create_time: 1_700_000_030,
        content: { parts: ['Alternate response that should not be imported.'] },
      },
    },
  },
};

describe('parseChatGPTExport', () => {
  it('parses the active ChatGPT conversation branch and inventories message authority', async () => {
    const result = await parseChatGPTExport(
      Buffer.from(JSON.stringify([syntheticConversation])),
      'conversations.json',
    );

    expect(result.inventory).toMatchObject({
      conversationCount: 1,
      messageCount: 2,
      userMessageCount: 1,
      assistantMessageCount: 1,
    });
    expect(result.conversations[0].messages.map((message) => message.id)).toEqual([
      'message-user-1',
      'message-assistant-1',
    ]);
  });

  it('parses and deduplicates numbered conversation files inside an export ZIP', async () => {
    const zip = new JSZip();
    zip.file('conversations-1.json', JSON.stringify([syntheticConversation]));
    zip.file('conversations-2.json', JSON.stringify([syntheticConversation]));
    zip.file('chat.html', '<html></html>');

    const result = await parseChatGPTExport(
      await zip.generateAsync({ type: 'nodebuffer' }),
      'chatgpt-export.zip',
    );

    expect(result.inventory.sourceFiles).toEqual([
      'conversations-1.json',
      'conversations-2.json',
    ]);
    expect(result.inventory.conversationCount).toBe(1);
  });
});
