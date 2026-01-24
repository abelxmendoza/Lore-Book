/**
 * Context Prompting Service
 * 
 * Detects when journal entries lack context and prompts user to add it:
 * - Detects vague entries ("Today sucked" - why?)
 * - Identifies missing context (what, why, who, where, when, how)
 * - Suggests questions to fill gaps
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';
import type { MemoryEntry } from '../../types';

export type MissingContextType = 'what' | 'why' | 'who' | 'where' | 'when' | 'how';

export interface ContextPrompt {
  id: string;
  user_id: string;
  entry_id: string;
  missing_context: MissingContextType[];
  suggested_questions: string[];
  prompt_status: 'pending' | 'answered' | 'dismissed';
  answered_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

class ContextPromptingService {
  /**
   * Analyze entry for missing context and create prompts
   */
  async analyzeEntry(
    userId: string,
    entry: MemoryEntry
  ): Promise<ContextPrompt | null> {
    try {
      // Check if prompt already exists
      const existing = await this.getPromptForEntry(userId, entry.id);
      if (existing && existing.prompt_status === 'pending') {
        return existing;
      }

      // Analyze for missing context
      const missingContext = await this.detectMissingContext(entry);
      
      if (missingContext.length === 0) {
        return null; // No missing context
      }

      // Generate suggested questions
      const suggestedQuestions = this.generateQuestions(entry, missingContext);

      // Create prompt
      const prompt: Omit<ContextPrompt, 'id' | 'created_at'> = {
        user_id: userId,
        entry_id: entry.id,
        missing_context: missingContext,
        suggested_questions: suggestedQuestions,
        prompt_status: 'pending',
        metadata: {},
      };

      const { data, error } = await supabaseAdmin
        .from('context_prompts')
        .insert(prompt)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as ContextPrompt;
    } catch (error) {
      logger.error({ err: error, userId, entryId: entry.id }, 'Failed to analyze entry for context');
      return null;
    }
  }

  /**
   * Detect missing context types
   */
  private async detectMissingContext(
    entry: MemoryEntry
  ): Promise<MissingContextType[]> {
    const missing: MissingContextType[] = [];
    const content = entry.content.toLowerCase();

    // Use LLM for nuanced detection
    const prompt = `Analyze this journal entry for missing context:

"${entry.content}"

Identify what context is missing:
- "what" - unclear what happened
- "why" - unclear why it happened or why it matters
- "who" - unclear who was involved
- "where" - unclear where it happened
- "when" - unclear when it happened (beyond the date)
- "how" - unclear how it happened

Respond with JSON:
{
  "missing": ["what", "why", ...],
  "reasoning": "brief explanation"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.missing || [];
    } catch (error) {
      logger.warn({ err: error }, 'LLM context detection failed, using pattern matching');
      return this.basicContextDetection(entry);
    }
  }

  /**
   * Basic context detection using patterns
   */
  private basicContextDetection(entry: MemoryEntry): MissingContextType[] {
    const missing: MissingContextType[] = [];
    const content = entry.content.toLowerCase();

    // Detect vague statements
    const vaguePatterns = [
      /(today|yesterday|it) (sucked|was bad|was terrible)/gi,
      /(something|things) (happened|went wrong)/gi,
      /(I|we) (did|went|saw) (something|things)/gi,
    ];

    const isVague = vaguePatterns.some(p => p.test(content));
    if (isVague) {
      missing.push('what');
      missing.push('why');
    }

    // Detect missing "who"
    const hasNames = /[A-Z][a-z]+ [A-Z][a-z]+/.test(entry.content);
    const hasPronouns = /\b(he|she|they|them|him|her)\b/gi.test(content);
    if (!hasNames && !hasPronouns && content.length > 50) {
      missing.push('who');
    }

    // Detect missing "where"
    const hasLocation = /(at|in|from|to) (the|a|an) [a-z]+/gi.test(content);
    if (!hasLocation && content.length > 100) {
      missing.push('where');
    }

    // Detect missing "when" (beyond date)
    const hasTime = /\b(morning|afternoon|evening|night|today|yesterday|tomorrow|week|month)\b/gi.test(content);
    if (!hasTime && content.length > 50) {
      missing.push('when');
    }

    return missing;
  }

  /**
   * Generate suggested questions based on missing context
   */
  private generateQuestions(
    entry: MemoryEntry,
    missingContext: MissingContextType[]
  ): string[] {
    const questions: string[] = [];

    for (const type of missingContext) {
      switch (type) {
        case 'what':
          questions.push('What exactly happened?');
          questions.push('Can you describe the event in more detail?');
          break;
        case 'why':
          questions.push('Why did this happen?');
          questions.push('Why does this matter to you?');
          questions.push('What led to this situation?');
          break;
        case 'who':
          questions.push('Who was involved?');
          questions.push('Who else was there?');
          break;
        case 'where':
          questions.push('Where did this happen?');
          questions.push('What was the location?');
          break;
        case 'when':
          questions.push('When did this happen? (time of day, day of week)');
          questions.push('What was the timing?');
          break;
        case 'how':
          questions.push('How did this happen?');
          questions.push('What was the process?');
          break;
      }
    }

    return [...new Set(questions)]; // Remove duplicates
  }

  /**
   * Get prompt for an entry
   */
  async getPromptForEntry(
    userId: string,
    entryId: string
  ): Promise<ContextPrompt | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('context_prompts')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_id', entryId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data as ContextPrompt;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get context prompt');
      return null;
    }
  }

  /**
   * Mark prompt as answered
   */
  async markAnswered(
    userId: string,
    promptId: string
  ): Promise<ContextPrompt> {
    try {
      const { data, error } = await supabaseAdmin
        .from('context_prompts')
        .update({
          prompt_status: 'answered',
          answered_at: new Date().toISOString(),
        })
        .eq('id', promptId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as ContextPrompt;
    } catch (error) {
      logger.error({ err: error }, 'Failed to mark prompt as answered');
      throw error;
    }
  }

  /**
   * Get pending prompts for user
   */
  async getPendingPrompts(userId: string): Promise<ContextPrompt[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('context_prompts')
        .select('*')
        .eq('user_id', userId)
        .eq('prompt_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as ContextPrompt[];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get pending prompts');
      return [];
    }
  }
}

export const contextPromptingService = new ContextPromptingService();
