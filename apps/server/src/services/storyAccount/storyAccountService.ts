/**
 * Story Account Service
 * 
 * Retrieves and organizes narrative accounts of events/stories.
 * Handles multiple perspectives: at_the_time, others_perspective, later_interpretation
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';

export interface StoryAccount {
  id: string;
  user_id: string;
  event_record_id?: string;
  account_type: 'at_the_time' | 'others_perspective' | 'later_interpretation';
  narrator_id?: string; // Character ID (null = user's perspective)
  narrative_text: string;
  recorded_at: string;
  source_entry_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GroupedAccounts {
  atTheTime: StoryAccount[];
  others: StoryAccount[];
  later: StoryAccount[];
}

class StoryAccountService {
  /**
   * Extract story/event name from message
   */
  extractStoryName(message: string): string {
    // Try to extract entity/story name using patterns
    const patterns = [
      /(what happened|tell me about|remember|story of|story about) (with|at|the|when) ([a-z\s]+)/i,
      /(what happened with|tell me about|story of) ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /"([^"]+)"/, // Quoted names
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        // Return the captured group (usually the last one)
        const name = match[match.length - 1]?.trim();
        if (name && name.length > 2) {
          return name;
        }
      }
    }

    // Fallback: use LLM to extract
    return this.extractStoryNameLLM(message);
  }

  /**
   * Extract story name using LLM
   */
  private async extractStoryNameLLM(message: string): Promise<string> {
    const prompt = `Extract the story/event name from this query:

"${message}"

Respond with JSON:
{
  "story_name": "name of the story or event",
  "confidence": 0.0-1.0
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 100,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.story_name || 'unknown story';
    } catch (error) {
      logger.warn({ err: error }, 'LLM story name extraction failed');
      return 'unknown story';
    }
  }

  /**
   * Get all accounts of a story/event
   */
  async getStoryAccounts(
    userId: string,
    storyName: string
  ): Promise<StoryAccount[]> {
    try {
      // First, try to find event records by name/tags
      const { data: events } = await supabaseAdmin
        .from('event_records')
        .select('id')
        .eq('user_id', userId)
        .or(`tags.cs.{${storyName.toLowerCase()}},metadata->>name.ilike.%${storyName}%`);

      const eventIds = events?.map(e => e.id) || [];

      // Get narrative accounts for these events
      let query = supabaseAdmin
        .from('narrative_accounts')
        .select('*')
        .eq('user_id', userId);

      if (eventIds.length > 0) {
        query = query.in('event_record_id', eventIds);
      } else {
        // Fallback: search by narrative text
        query = query.ilike('narrative_text', `%${storyName}%`);
      }

      const { data: accounts, error } = await query.order('recorded_at', { ascending: true });

      if (error) {
        throw error;
      }

      return (accounts || []) as StoryAccount[];
    } catch (error) {
      logger.error({ err: error, userId, storyName }, 'Failed to get story accounts');
      return [];
    }
  }

  /**
   * Group accounts by perspective
   */
  groupByPerspective(accounts: StoryAccount[]): GroupedAccounts {
    return {
      atTheTime: accounts.filter(a => a.account_type === 'at_the_time'),
      others: accounts.filter(a => a.account_type === 'others_perspective'),
      later: accounts.filter(a => a.account_type === 'later_interpretation'),
    };
  }

  /**
   * Build multi-layered narrative response
   */
  buildNarrativeResponse(accounts: StoryAccount[]): string {
    const grouped = this.groupByPerspective(accounts);
    
    let response = "Yes. There are multiple layers to that story.\n\n";
    
    // At the time
    if (grouped.atTheTime.length > 0) {
      const account = grouped.atTheTime[0];
      const summary = this.summarizeAccount(account.narrative_text);
      response += `At the time, you experienced it as: ${summary}\n\n`;
    }
    
    // Others' perspectives
    if (grouped.others.length > 0) {
      const account = grouped.others[0];
      const summary = this.summarizeAccount(account.narrative_text);
      response += `Others involved described it as: ${summary}\n\n`;
    }
    
    // Later interpretations
    if (grouped.later.length > 0) {
      const account = grouped.later[0];
      const summary = this.summarizeAccount(account.narrative_text);
      response += `Later, you interpreted it as: ${summary}\n\n`;
    }
    
    response += "Do you want the short version, the full account, or a specific angle?";
    
    return response;
  }

  /**
   * Summarize account text (first 200 chars or sentence)
   */
  private summarizeAccount(text: string): string {
    if (text.length <= 200) {
      return text;
    }
    
    // Try to find sentence boundary
    const sentenceEnd = text.search(/[.!?]\s/);
    if (sentenceEnd > 0 && sentenceEnd < 250) {
      return text.substring(0, sentenceEnd + 1);
    }
    
    // Fallback: first 200 chars with ellipsis
    return text.substring(0, 200) + '...';
  }
}

export const storyAccountService = new StoryAccountService();
