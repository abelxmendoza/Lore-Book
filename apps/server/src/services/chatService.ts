import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type { MemoryEntry, ResolvedMemoryEntry } from '../types';
import { extractTags, shouldPersistMessage } from '../utils/keywordDetector';

import { correctionService } from './correctionService';
import { memoryService } from './memoryService';

const openai = new OpenAI({ apiKey: config.openAiKey });

class ChatService {
  async askLoreKeeper(userId: string, message: string, persona?: string) {
    const relatedEntries = await memoryService.searchEntriesWithCorrections(userId, {
      search: message,
      limit: 12
    });
    const context = relatedEntries
      .map((entry) => `Date: ${entry.date}\nSummary: ${entry.summary ?? entry.corrected_content ?? entry.content}`)
      .join('\n---\n');

    const name = persona ?? 'The Archivist';
    const system = `${name} is a loyal lorekeeper that references the user's journaling history. Answer succinctly while citing dates when possible and keep responses reflective.`;

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

    // Auto-save message as journal entry (all chat messages are automatically saved)
    if (shouldPersistMessage(message)) {
      await memoryService.saveEntry({
        userId,
        content: message,
        tags: extractTags(message),
        source: 'chat',
        metadata: { 
          autoCaptured: true,
          fromLegacyChat: true
        }
      });
    }

    return { answer, relatedEntries };
  }

  async summarizeEntries(
    userId: string,
    entries: MemoryEntry[],
    chapterContext?: { title: string; description?: string }
  ) {
    if (!entries.length) {
      return 'No entries found for that time range yet.';
    }

    const resolvedEntries = correctionService.applyCorrectionsToEntries(entries);
    const prompt = resolvedEntries
      .map((entry) => `Date: ${entry.date}\n${entry.summary ?? entry.corrected_content ?? entry.content}`)
      .join('\n');

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Summarize the following journal entries in 5 bullet points and mention any chapters or milestones. Include the chapter context if provided.'
          },
          {
            role: 'user',
            content: `${chapterContext ? `Chapter: ${chapterContext.title}\n${chapterContext.description ?? ''}\n` : ''}${prompt}`
          }
        ]
      });

      return completion.choices[0]?.message?.content ?? 'Summary unavailable.';
    } catch (error) {
      logger.error({ error }, 'Failed to summarize entries');
      throw error;
    }
  }

  async reflectOnEntries(
    entries: MemoryEntry[],
    prompt: string,
    persona = 'The Archivist'
  ) {
    if (!entries.length) {
      return 'No entries available for reflection yet.';
    }

    const resolvedEntries: ResolvedMemoryEntry[] = correctionService.applyCorrectionsToEntries(entries);
    const context = resolvedEntries
      .map(
        (entry) =>
          `Date: ${entry.date}\nTags: ${(entry.tags || []).join(', ')}\n${entry.summary ?? entry.corrected_content ?? entry.content}`
      )
      .join('\n---\n');

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content: `${persona} is a therapeutic, reflective guide. Provide insights, patterns, and advice grounded in the entries. Avoid generic platitudes.`
        },
        {
          role: 'user',
          content: `${prompt}\n\nJournal context:\n${context}`
        }
      ]
    });

    return completion.choices[0]?.message?.content ?? 'No reflection available right now.';
  }
}

export const chatService = new ChatService();
