import { config } from '../../config';
import { logger } from '../../logger';
import { openaiClient } from '../openaiClient';

import type { Quest, QuestType } from './types';

/**
 * Extracts quests from journal entries using LLM
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
}

export const questExtractor = new QuestExtractor();
