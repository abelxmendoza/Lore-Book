import { describe, expect, it } from 'vitest';

import { loreImportPackageSchema } from './loreContentClassification';
import { intakeChannelFromSourceType, extractLoreSourcesFromMetadata } from './loreSourceRef';

describe('loreContentClassification contracts', () => {
  it('parses a minimal external conversation import package', () => {
    const parsed = loreImportPackageSchema.parse({
      source: { type: 'external_conversation', provider: 'chatgpt', conversationId: 'conv-1' },
      items: [{ role: 'user', text: 'I started training kickboxing again in July.' }],
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.source.provider).toBe('chatgpt');
  });
});

describe('loreSourceRef external conversation', () => {
  it('maps external conversation source types to intake channel', () => {
    expect(intakeChannelFromSourceType('chatgpt_export')).toBe('external_conversation');
    expect(intakeChannelFromSourceType('external_conversation')).toBe('external_conversation');
  });

  it('extracts external conversation refs from metadata', () => {
    const sources = extractLoreSourcesFromMetadata({
      external_conversation_id: 'conv-1',
      external_message_id: 'conv-1:msg-3',
      external_provider: 'chatgpt',
    });
    expect(sources.some((s) => s.kind === 'external_conversation' && s.id === 'conv-1')).toBe(true);
    expect(sources.some((s) => s.kind === 'external_conversation_message')).toBe(true);
  });
});
