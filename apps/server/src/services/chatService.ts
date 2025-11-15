import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type { MemoryEntry } from '../types';
import { memoryService } from './memoryService';
import { extractTags, shouldPersistMessage } from '../utils/keywordDetector';

const openai = new OpenAI({ apiKey: config.openAiKey });

class ChatService {
  async askLoreKeeper(userId: string, message: string) {
    const relatedEntries = await memoryService.searchEntries(userId, { search: message, limit: 12 });
    const context = relatedEntries
      .map((entry) => `Date: ${entry.date}\nSummary: ${entry.summary ?? entry.content}`)
      .join('\n---\n');

    const system = `You are Lore Keeper, an archivist AI that references the user's journaling history. Answer succinctly while citing dates when possible.`;

    const messages = [
      { role: 'system' as const, content: system },
      {
        role: 'user' as const,
        content: `Question: ${message}\n\nRelevant journal entries:\n${context || 'No previous entries yet.'}`
      }
    ];

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.4,
      messages
    });

    const answer = completion.choices[0]?.message?.content ?? 'I am not sure yet.';

    if (shouldPersistMessage(message)) {
      await memoryService.saveEntry({
        userId,
        content: message,
        tags: extractTags(message),
        source: 'chat',
        metadata: { autoCaptured: true }
      });
    }

    return { answer, relatedEntries };
  }

  async summarizeEntries(userId: string, entries: MemoryEntry[]) {
    if (!entries.length) {
      return 'No entries found for that time range yet.';
    }

    const prompt = entries
      .map((entry) => `Date: ${entry.date}\n${entry.summary ?? entry.content}`)
      .join('\n');

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Summarize the following journal entries in 5 bullet points and mention any chapters or milestones.'
          },
          { role: 'user', content: prompt }
        ]
      });

      return completion.choices[0]?.message?.content ?? 'Summary unavailable.';
    } catch (error) {
      logger.error({ error }, 'Failed to summarize entries');
      throw error;
    }
  }
}

export const chatService = new ChatService();
