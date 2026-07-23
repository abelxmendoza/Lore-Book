import { describe, expect, it } from 'vitest';

import {
  IMAGE_ATTACHED_PLACEHOLDER,
  MAX_CHAT_IMAGES_PER_TURN,
  attachmentMetaFromImages,
  buildUserChatContent,
  chatContentToResponsesContent,
  isValidChatImageDataUrl,
  resolveUserMessageText,
} from './chatImageInput';
import { buildIngestTextFromVision } from './chatVisionSummaryService';

const SAMPLE_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z';

describe('chatImageInput', () => {
  it('validates data URLs', () => {
    expect(isValidChatImageDataUrl(SAMPLE_DATA_URL)).toBe(true);
    expect(isValidChatImageDataUrl('https://example.com/a.jpg')).toBe(false);
    expect(isValidChatImageDataUrl('data:text/plain;base64,abc')).toBe(false);
  });

  it('uses placeholder when image-only', () => {
    expect(resolveUserMessageText('', [{ dataUrl: SAMPLE_DATA_URL }])).toBe(IMAGE_ATTACHED_PLACEHOLDER);
    expect(resolveUserMessageText('', [{ dataUrl: SAMPLE_DATA_URL }, { dataUrl: SAMPLE_DATA_URL }])).toBe(
      '[2 images attached]',
    );
    expect(resolveUserMessageText('  hello  ', [{ dataUrl: SAMPLE_DATA_URL }])).toBe('hello');
  });

  it('builds multimodal chat content for multiple images', () => {
    const content = buildUserChatContent('look', [
      { dataUrl: SAMPLE_DATA_URL, detail: 'high' },
      { dataUrl: SAMPLE_DATA_URL, detail: 'low' },
    ]);
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(3);
    expect(content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: SAMPLE_DATA_URL, detail: 'high' } },
      { type: 'image_url', image_url: { url: SAMPLE_DATA_URL, detail: 'low' } },
    ]);
  });

  it('accepts durable url when dataUrl missing', () => {
    const content = buildUserChatContent('look', [{ url: 'https://cdn.example/p.jpg' }]);
    expect(content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'https://cdn.example/p.jpg', detail: 'high' } },
    ]);
  });

  it('converts to Responses input_image', () => {
    const content = buildUserChatContent('look', [{ dataUrl: SAMPLE_DATA_URL, detail: 'high' }]);
    const responses = chatContentToResponsesContent(content);
    expect(responses).toEqual([
      { type: 'input_text', text: 'look' },
      { type: 'input_image', image_url: SAMPLE_DATA_URL, detail: 'high' },
    ]);
  });

  it('stores attachment metadata with durable url/path', () => {
    expect(
      attachmentMetaFromImages([
        {
          dataUrl: SAMPLE_DATA_URL,
          mimeType: 'image/jpeg',
          url: 'https://cdn.example/a.jpg',
          storagePath: 'user/chat/sess/a.jpg',
          photoId: 'photo-1',
          journalEntryId: 'journal-1',
        },
      ]),
    ).toEqual([
      {
        kind: 'image',
        mimeType: 'image/jpeg',
        detail: 'high',
        url: 'https://cdn.example/a.jpg',
        storagePath: 'user/chat/sess/a.jpg',
        photoId: 'photo-1',
        journalEntryId: 'journal-1',
      },
    ]);
  });

  it('exports multi-image limit', () => {
    expect(MAX_CHAT_IMAGES_PER_TURN).toBe(8);
  });
});

describe('buildIngestTextFromVision', () => {
  it('merges caption and vision summary for ingestion', () => {
    const text = buildIngestTextFromVision('Dinner with Sam', {
      summary: 'Two people at a restaurant table with pasta.',
      perImage: ['Wide shot of dinner'],
      people: ['Sam'],
      places: ['restaurant'],
    });
    expect(text).toContain('Dinner with Sam');
    expect(text).toContain('[Photo description]: Two people at a restaurant table with pasta.');
    expect(text).toContain('People: Sam');
    expect(text).toContain('Places: restaurant');
  });

  it('works without caption', () => {
    const text = buildIngestTextFromVision('[Image attached]', {
      summary: 'A red car parked on a street.',
      perImage: [],
    });
    expect(text).toBe('[Photo description]: A red car parked on a street.');
  });

  it('includes DM/story transcripts and platforms for lore ingest', () => {
    const text = buildIngestTextFromVision('[2 images attached]', {
      summary: 'Instagram DM screenshots about weekend plans.',
      perImage: ['Thread top', 'Thread bottom'],
      mediaKinds: ['message_thread', 'message_thread'],
      platforms: ['instagram'],
      people: ['Jamie'],
      transcripts: ['Me: You free Saturday?\nJamie: Yeah let’s go'],
    });
    expect(text).toContain('[Extracted text / conversation]');
    expect(text).toContain('You free Saturday?');
    expect(text).toContain('Platforms: instagram');
    expect(text).toContain('Media kinds: message_thread');
    expect(text).not.toContain('[2 images attached]');
  });
});
