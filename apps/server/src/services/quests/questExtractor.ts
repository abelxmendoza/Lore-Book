import { config } from '../../config';
import { logger } from '../../logger';
import { openaiClient } from '../openaiClient';

import type { Quest, QuestType } from './types';

/**
 * Extracts quests from journal entries or chat messages using LLM
 */
export class QuestExtractor {
  /**
   * Extract quests from journal entries
   */
  async extractQuests(userId: string, entries: any[]): Promise<Quest[]> {
    if (entries.length === 0) return [];

    try {
      // Prepare entry context
      const recentEntries = entries.slice(0, 50).map(e => ({
        content: e.content,
        date: e.date,
      }));

      const completion = await openaiClient.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a quest extraction expert. Your job is to identify quest-like statements from journal entries.
A quest is a goal, todo, or objective that the user wants to accomplish.

Quest types:
- main: Primary, long-term objectives (e.g., "Get promoted", "Write a book", "Start a business")
- side: Secondary objectives (e.g., "Learn Spanish", "Fix the garage door", "Visit Japan")
- daily: Short-term tasks (e.g., "Call dentist", "Buy groceries", "Finish report")
- achievement: Milestone-based goals (e.g., "Run 100 miles", "Read 50 books", "Lose 20 pounds")

For each quest, estimate:
- priority (1-10): Urgency/importance
- importance (1-10): Long-term significance
- impact (1-10): Expected outcome magnitude

Return JSON:
{
  "quests": [
    {
      "title": "Quest title",
      "description": "Quest description",
      "quest_type": "main|side|daily|achievement",
      "priority": 1-10,
      "importance": 1-10,
      "impact": 1-10,
      "category": "career|health|relationships|creative|financial|personal_growth|other",
      "source_entry_date": "YYYY-MM-DD"
    }
  ]
}`
          },
          {
            role: 'user',
            content: `Extract quests from these journal entries:\n\n${JSON.stringify(recentEntries, null, 2)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const extractedQuests = response.quests || [];

      logger.debug({ count: extractedQuests.length, userId }, 'Extracted quests from entries');

      return extractedQuests.map((q: any) => ({
        id: '', // Will be set when saved
        user_id: userId,
        title: q.title,
        description: q.description,
        quest_type: q.quest_type as QuestType,
        priority: q.priority || 5,
        importance: q.importance || 5,
        impact: q.impact || 5,
        category: q.category,
        source: 'extracted',
        status: 'active',
        progress_percentage: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })) as Quest[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to extract quests');
      return [];
    }
  }

  /**
   * Extract quests from a single chat message
   * This is called during chat ingestion to auto-detect quests
   */
  async extractQuestsFromMessage(userId: string, message: string, conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<Quest[]> {
    if (!message || message.trim().length < 10) return [];

    try {
      // Build context from conversation history (last 5 messages)
      const recentHistory = conversationHistory?.slice(-5) || [];
      const contextMessages = recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');

      const completion = await openaiClient.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a quest extraction expert. Your job is to identify quest-like statements from user messages in conversations.
A quest is a goal, todo, or objective that the user wants to accomplish.

Look for:
- Explicit goals ("I want to...", "I need to...", "I should...", "I'm going to...")
- Tasks mentioned ("I have to...", "I need to finish...", "I should start...")
- Aspirations ("I'd like to...", "My goal is...", "I'm planning to...")
- Commitments ("I will...", "I'm going to...", "I plan to...")

Quest types:
- main: Primary, long-term objectives (e.g., "Get promoted", "Write a book", "Start a business")
- side: Secondary objectives (e.g., "Learn Spanish", "Fix the garage door", "Visit Japan")
- daily: Short-term tasks (e.g., "Call dentist", "Buy groceries", "Finish report")
- achievement: Milestone-based goals (e.g., "Run 100 miles", "Read 50 books", "Lose 20 pounds")

For each quest, estimate:
- priority (1-10): Urgency/importance
- importance (1-10): Long-term significance
- impact (1-10): Expected outcome magnitude

Generate a clear, concise title (max 60 chars) and description (max 200 chars).

Return JSON:
{
  "quests": [
    {
      "title": "Quest title",
      "description": "Quest description",
      "quest_type": "main|side|daily|achievement",
      "priority": 1-10,
      "importance": 1-10,
      "impact": 1-10,
      "category": "career|health|relationships|creative|financial|personal_growth|other"
    }
  ]
}

Only extract quests if they are clearly stated. Don't extract vague or uncertain statements.`
          },
          {
            role: 'user',
            content: contextMessages 
              ? `Conversation context:\n${contextMessages}\n\nCurrent message:\n${message}\n\nExtract any quests from the current message.`
              : `Extract quests from this message:\n${message}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const extractedQuests = response.quests || [];

      if (extractedQuests.length > 0) {
        logger.debug({ count: extractedQuests.length, userId, messagePreview: message.substring(0, 50) }, 'Extracted quests from chat message');
      }

      return extractedQuests.map((q: any) => ({
        id: '', // Will be set when saved
        user_id: userId,
        title: q.title,
        description: q.description,
        quest_type: q.quest_type as QuestType,
        priority: q.priority || 5,
        importance: q.importance || 5,
        impact: q.impact || 5,
        category: q.category,
        source: 'extracted',
        status: 'active',
        progress_percentage: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })) as Quest[];
    } catch (error) {
      logger.error({ error, userId, messagePreview: message.substring(0, 50) }, 'Failed to extract quests from message');
      return [];
    }
  }

  /**
   * Extract progress updates from chat messages
   * Detects mentions like "I'm 50% done with X" or "I finished half of Y"
   */
  async extractProgressUpdates(
    userId: string,
    message: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<Array<{ questTitle: string; progress: number; confidence: number }>> {
    if (!message || message.trim().length < 10) return [];

    try {
      const recentHistory = conversationHistory?.slice(-5) || [];
      const contextMessages = recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');

      const completion = await openaiClient.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a progress tracking expert. Your job is to identify progress updates for quests/goals from user messages.

Look for:
- Percentage mentions: "I'm 50% done with X", "I finished half of Y", "I'm 75% through Z"
- Milestone completions: "I completed the first milestone of X", "I finished step 2 of Y"
- Progress indicators: "I made progress on X", "I'm getting closer to finishing Y"
- Completion mentions: "I finished X", "I completed Y"

For each progress update, identify:
- The quest/goal title (match to existing quests if possible)
- The progress percentage (0-100)
- Confidence level (0-1) based on how clear the progress statement is

Return JSON:
{
  "progress_updates": [
    {
      "quest_title": "Quest title (as mentioned or inferred)",
      "progress": 50,
      "confidence": 0.9
    }
  ]
}

Only extract progress updates if they are clearly stated. Don't infer progress from vague statements.`
          },
          {
            role: 'user',
            content: contextMessages 
              ? `Conversation context:\n${contextMessages}\n\nCurrent message:\n${message}\n\nExtract any progress updates from the current message.`
              : `Extract progress updates from this message:\n${message}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const progressUpdates = response.progress_updates || [];

      if (progressUpdates.length > 0) {
        logger.debug({ count: progressUpdates.length, userId, messagePreview: message.substring(0, 50) }, 'Extracted progress updates from chat message');
      }

      return progressUpdates.map((update: any) => ({
        questTitle: update.quest_title,
        progress: Math.max(0, Math.min(100, update.progress || 0)),
        confidence: Math.max(0, Math.min(1, update.confidence || 0)),
      }));
    } catch (error) {
      logger.error({ error, userId, messagePreview: message.substring(0, 50) }, 'Failed to extract progress updates from message');
      return [];
    }
  }

  /**
   * Detect life changes that might affect quests
   * Identifies direction changes, priority shifts, and conflicting goals
   */
  async detectLifeChanges(
    userId: string,
    message: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{
    abandonedQuests: Array<{ questTitle: string; reason: string; confidence: number }>;
    pausedQuests: Array<{ questTitle: string; reason: string; confidence: number }>;
    overallReason: string;
  }> {
    if (!message || message.trim().length < 10) {
      return { abandonedQuests: [], pausedQuests: [], overallReason: '' };
    }

    try {
      const recentHistory = conversationHistory?.slice(-10) || [];
      const contextMessages = recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');

      const completion = await openaiClient.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a life change detection expert. Your job is to identify when users express changes in direction, priorities, or goals that might affect their quests.

Look for:
- Direction changes: "I'm no longer interested in...", "I've decided to focus on...", "I'm changing direction..."
- Priority shifts: "X is no longer a priority", "I'm putting Y on hold", "I've decided to prioritize Z instead"
- Life events: "I got a new job", "I'm moving", "I'm starting a family"
- Conflicting goals: "I can't do X because of Y", "X conflicts with my new focus on Y"
- Abandonment signals: "I'm giving up on X", "I don't want to do Y anymore", "X isn't important to me now"

For each affected quest, identify:
- The quest title (match to existing quests if possible)
- Whether it should be abandoned or paused
- The reason for the change
- Confidence level (0-1)

Return JSON:
{
  "abandoned_quests": [
    {
      "quest_title": "Quest title",
      "reason": "Why this quest should be abandoned",
      "confidence": 0.9
    }
  ],
  "paused_quests": [
    {
      "quest_title": "Quest title",
      "reason": "Why this quest should be paused",
      "confidence": 0.8
    }
  ],
  "overall_reason": "Summary of the life change"
}

Only detect changes if they are clearly expressed. Don't infer changes from vague statements.`
          },
          {
            role: 'user',
            content: contextMessages 
              ? `Conversation context:\n${contextMessages}\n\nCurrent message:\n${message}\n\nDetect any life changes that might affect quests.`
              : `Detect life changes from this message:\n${message}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      const abandonedQuests = (response.abandoned_quests || []).map((q: any) => ({
        questTitle: q.quest_title,
        reason: q.reason || '',
        confidence: Math.max(0, Math.min(1, q.confidence || 0)),
      }));

      const pausedQuests = (response.paused_quests || []).map((q: any) => ({
        questTitle: q.quest_title,
        reason: q.reason || '',
        confidence: Math.max(0, Math.min(1, q.confidence || 0)),
      }));

      if (abandonedQuests.length > 0 || pausedQuests.length > 0) {
        logger.debug({ 
          abandonedCount: abandonedQuests.length, 
          pausedCount: pausedQuests.length, 
          userId, 
          messagePreview: message.substring(0, 50) 
        }, 'Detected life changes from chat message');
      }

      return {
        abandonedQuests,
        pausedQuests,
        overallReason: response.overall_reason || '',
      };
    } catch (error) {
      logger.error({ error, userId, messagePreview: message.substring(0, 50) }, 'Failed to detect life changes from message');
      return { abandonedQuests: [], pausedQuests: [], overallReason: '' };
    }
  }
}

export const questExtractor = new QuestExtractor();
