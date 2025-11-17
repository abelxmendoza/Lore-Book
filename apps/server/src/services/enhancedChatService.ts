import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type { MemoryEntry, ResolvedMemoryEntry } from '../types';
import { memoryService } from './memoryService';
import { chapterService } from './chapterService';
import { memoirService } from './memoirService';
import { autopilotService } from './autopilotService';
import { taskEngineService } from './taskEngineService';
import { peoplePlacesService } from './peoplePlacesService';
import { extractTags, shouldPersistMessage } from '../utils/keywordDetector';
import { correctionService } from './correctionService';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type EnhancedChatResponse = {
  answer: string;
  entryId?: string;
  characterIds?: string[];
  connections?: string[];
  continuityWarnings?: string[];
  timelineUpdates?: string[];
  strategicGuidance?: string;
  extractedDates?: Array<{ date: string; context: string }>;
};

class EnhancedChatService {
  /**
   * Extract dates and times from message text
   */
  private async extractDatesAndTimes(message: string): Promise<Array<{ date: string; context: string }>> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Extract all dates, times, and temporal references from the text. Return JSON with array of {date: ISO date string, context: brief description}. Handle relative dates like "yesterday", "last week", "next month".'
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      return parsed.dates || [];
    } catch (error) {
      logger.error({ error }, 'Failed to extract dates');
      return [];
    }
  }

  /**
   * Check for continuity issues with existing entries
   */
  private async checkContinuity(
    userId: string,
    message: string,
    extractedDates: Array<{ date: string; context: string }>
  ): Promise<string[]> {
    const warnings: string[] = [];
    
    try {
      // Get recent entries to check for conflicts
      const recentEntries = await memoryService.searchEntries(userId, { limit: 50 });
      
      for (const dateInfo of extractedDates) {
        const date = new Date(dateInfo.date);
        const conflictingEntries = recentEntries.filter(entry => {
          const entryDate = new Date(entry.date);
          const daysDiff = Math.abs((date.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
          return daysDiff < 1 && entry.content.toLowerCase().includes(dateInfo.context.toLowerCase());
        });

        if (conflictingEntries.length > 0) {
          warnings.push(`Potential conflict: ${dateInfo.context} on ${dateInfo.date} may overlap with existing entries`);
        }
      }

      // Check for factual inconsistencies using AI
      if (recentEntries.length > 0) {
        const context = recentEntries
          .slice(0, 10)
          .map(e => `Date: ${e.date}\n${e.summary || e.content}`)
          .join('\n---\n');

        const completion = await openai.chat.completions.create({
          model: config.defaultModel,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'Compare the new message with existing entries. Identify any factual inconsistencies, contradictions, or temporal conflicts. Return only warnings, one per line, or "none" if no issues.'
            },
            {
              role: 'user',
              content: `New message: ${message}\n\nRecent entries:\n${context}`
            }
          ]
        });

        const response = completion.choices[0]?.message?.content ?? '';
        if (response.toLowerCase() !== 'none' && response.trim()) {
          warnings.push(...response.split('\n').filter(line => line.trim()));
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check continuity');
    }

    return warnings;
  }

  /**
   * Find connections between the message and existing entries
   */
  private async findConnections(
    userId: string,
    message: string,
    relatedEntries: ResolvedMemoryEntry[]
  ): Promise<string[]> {
    const connections: string[] = [];

    try {
      // Extract key topics from message
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Extract key topics, themes, people, places, and concepts from the message. Return as JSON array of strings.'
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      const topics = parsed.topics || [];

      // Find related entries by topics
      for (const topic of topics.slice(0, 5)) {
        const related = relatedEntries.filter(entry => 
          entry.content.toLowerCase().includes(topic.toLowerCase()) ||
          entry.tags?.some(tag => tag.toLowerCase().includes(topic.toLowerCase()))
        );

        if (related.length > 0) {
          connections.push(`Connected to ${related.length} previous entry${related.length > 1 ? 's' : ''} about "${topic}"`);
        }
      }

      // Find character connections
      const characters = await peoplePlacesService.listEntities(userId);
      const mentionedCharacters = characters.filter(char =>
        message.toLowerCase().includes(char.name.toLowerCase())
      );

      if (mentionedCharacters.length > 0) {
        connections.push(`Mentioned ${mentionedCharacters.length} character${mentionedCharacters.length > 1 ? 's' : ''}: ${mentionedCharacters.map(c => c.name).join(', ')}`);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to find connections');
    }

    return connections;
  }

  /**
   * Get strategic guidance using Autopilot
   */
  private async getStrategicGuidance(userId: string, message: string): Promise<string | null> {
    try {
      // Get daily plan for context
      const dailyPlan = await autopilotService.getDailyPlan(userId, 'json') as any;
      
      if (dailyPlan?.daily_plan?.description) {
        return `💡 **Today's Focus**: ${dailyPlan.daily_plan.description}`;
      }
    } catch (error) {
      logger.debug({ error }, 'Could not fetch autopilot guidance');
    }
    return null;
  }

  /**
   * Main enhanced chat method with full Autopilot integration
   */
  async chatWithAutopilot(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<EnhancedChatResponse> {
    // Step 1: Extract dates and times
    const extractedDates = await this.extractDatesAndTimes(message);

    // Step 2: Get related entries for context
    const relatedEntries = await memoryService.searchEntriesWithCorrections(userId, {
      search: message,
      limit: 15
    });

    // Step 3: Check continuity
    const continuityWarnings = await this.checkContinuity(userId, message, extractedDates);

    // Step 4: Find connections
    const connections = await this.findConnections(userId, message, relatedEntries);

    // Step 5: Get strategic guidance
    const strategicGuidance = await this.getStrategicGuidance(userId, message);

    // Step 6: Build comprehensive context
    const context = relatedEntries
      .map((entry) => `Date: ${entry.date}\nSummary: ${entry.summary ?? entry.corrected_content ?? entry.content}\nTags: ${(entry.tags || []).join(', ')}`)
      .join('\n---\n');

    const recentChapters = await chapterService.listChapters(userId);
    const chapterContext = recentChapters
      .slice(0, 3)
      .map(ch => `Chapter: ${ch.title} (${ch.start_date}${ch.end_date ? ` - ${ch.end_date}` : ''})`)
      .join('\n');

    // Step 7: Build enhanced system prompt
    const systemPrompt = `You are an AI Life Guidance assistant integrated into Lore Keeper. Your role is to:

1. **Listen and Reflect**: Provide empathetic, thoughtful responses that show you understand what the user is sharing
2. **Make Connections**: Point out patterns, themes, and connections to their past entries
3. **Track the Story**: Help summarize their journey, noting key moments and evolution
4. **Update Knowledge**: Automatically extract and track dates, times, people, places, and events
5. **Check Continuity**: Watch for inconsistencies, conflicts, or contradictions in their story
6. **Provide Strategy**: Offer actionable guidance based on their patterns and current situation
7. **Maintain Timeline**: Help organize their memories chronologically and thematically

**Your Style**:
- Conversational and warm, like ChatGPT but focused on life guidance
- Reference specific dates and past entries when relevant
- Make connections between different periods of their life
- Offer strategic insights based on patterns you notice
- Be proactive about updating their timeline and memoir

**Current Context**:
${chapterContext ? `Active Chapters:\n${chapterContext}\n\n` : ''}
${connections.length > 0 ? `Connections Found:\n${connections.join('\n')}\n\n` : ''}
${continuityWarnings.length > 0 ? `⚠️ Continuity Warnings:\n${continuityWarnings.join('\n')}\n\n` : ''}
${strategicGuidance ? `${strategicGuidance}\n\n` : ''}

**Relevant Past Entries**:
${context || 'No previous entries yet.'}`;

    // Step 8: Generate response
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.slice(-6), // Include last 6 messages for context
      {
        role: 'user' as const,
        content: message
      }
    ];

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.7, // Higher for more conversational, strategic responses
      messages
    });

    const answer = completion.choices[0]?.message?.content ?? 'I understand. Tell me more.';

    // Step 9: Save entry if it should be persisted
    let entryId: string | undefined;
    const timelineUpdates: string[] = [];

    if (shouldPersistMessage(message)) {
      const savedEntry = await memoryService.saveEntry({
        userId,
        content: message,
        tags: extractTags(message),
        source: 'chat',
        metadata: { 
          autoCaptured: true,
          extractedDates,
          connections: connections.length,
          hasContinuityWarnings: continuityWarnings.length > 0
        }
      });
      entryId = savedEntry.id;
      timelineUpdates.push('Entry saved to timeline');

      // Auto-update memoir (fire and forget)
      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
      });

      // Note: Chapter auto-organization can be added later if needed
    }

    // Step 10: Extract characters
    const characters = await peoplePlacesService.listEntities(userId);
    const mentionedCharacters = characters.filter(char =>
      message.toLowerCase().includes(char.name.toLowerCase())
    );
    const characterIds = mentionedCharacters.map(c => c.id);

    return {
      answer,
      entryId,
      characterIds,
      connections,
      continuityWarnings,
      timelineUpdates,
      strategicGuidance: strategicGuidance || undefined,
      extractedDates
    };
  }
}

export const enhancedChatService = new EnhancedChatService();

