import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type { ConversationMessage, MemoryComponent } from '../types';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * LLM-based memory extraction (fallback when rule-based insufficient)
 * Only called when rule-based detection confidence is low or extraction fails
 */
class LLMMemoryExtractionService {
  /**
   * Detect memory-worthy segments using LLM
   * Only called when rule-based confidence < threshold
   */
  async detectMemoryWorthyLLM(
    messages: ConversationMessage[]
  ): Promise<{
    isMemoryWorthy: boolean;
    confidence: number;
    reasons: string[];
  }> {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n')
      .slice(0, 4000); // Limit context

    const prompt = `Analyze this conversation and determine if it contains memory-worthy content.

A memory-worthy conversation contains:
- Past events or experiences
- Significant emotional moments
- Relationship updates or interactions
- Achievements or milestones
- Important decisions or reflections
- Story progress or narrative elements

Conversation:
${conversationText}

Respond with JSON:
{
  "isMemoryWorthy": boolean,
  "confidence": number (0-1),
  "reasons": string[] (brief explanations)
}`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Use cheaper model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return {
        isMemoryWorthy: response.isMemoryWorthy || false,
        confidence: response.confidence || 0.5,
        reasons: response.reasons || [],
      };
    } catch (error) {
      logger.error({ error }, 'LLM memory detection failed');
      // Fallback to conservative estimate
      return {
        isMemoryWorthy: false,
        confidence: 0.3,
        reasons: ['LLM detection failed'],
      };
    }
  }

  /**
   * Extract memory components using LLM
   * Only called when rule-based extraction insufficient
   */
  async extractComponentsLLM(
    content: string,
    entryDate: string
  ): Promise<Array<{
    component_type: MemoryComponent['component_type'];
    text: string;
    characters_involved: string[];
    location?: string | null;
    tags: string[];
    importance_score: number;
  }>> {
    const prompt = `Extract memory components from this journal entry content.

Extract distinct memory components such as:
- Events (things that happened)
- Thoughts (reflections, realizations)
- Decisions (choices made, plans)
- Relationship updates (interactions with people)
- Worldbuilding/lore (important context or world details)
- Timeline markers (significant dates or periods)

Content:
${content.slice(0, 3000)}

Date: ${entryDate}

Respond with JSON array:
[
  {
    "component_type": "event" | "thought" | "reflection" | "decision" | "relationship_update" | "worldbuilding" | "lore_drop" | "timeline_marker",
    "text": string (extracted component text, 50-500 chars),
    "characters_involved": string[] (names mentioned),
    "location": string | null,
    "tags": string[],
    "importance_score": number (0-10)
  }
]`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Use cheaper model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const components = response.components || [];

      // Validate and normalize components
      return components
        .filter((comp: any) => comp.component_type && comp.text)
        .map((comp: any) => ({
          component_type: comp.component_type,
          text: comp.text.slice(0, 1000),
          characters_involved: Array.isArray(comp.characters_involved) ? comp.characters_involved : [],
          location: comp.location || null,
          tags: Array.isArray(comp.tags) ? comp.tags : [],
          importance_score: Math.max(0, Math.min(10, comp.importance_score || 5)),
        }));
    } catch (error) {
      logger.error({ error }, 'LLM component extraction failed');
      return [];
    }
  }

  /**
   * Assign timeline hierarchy using LLM
   * Only called when rule-based assignment insufficient
   */
  async assignTimelineLLM(
    component: MemoryComponent,
    availableTimelineLevels: {
      chapters?: Array<{ id: string; title: string; start_date: string; end_date?: string | null }>;
      arcs?: Array<{ id: string; title: string; start_date: string; end_date?: string | null }>;
    }
  ): Promise<{
    chapter_id?: string | null;
    arc_id?: string | null;
    confidence: number;
  }> {
    const prompt = `Assign this memory component to the appropriate timeline level.

Component:
Type: ${component.component_type}
Text: ${component.text.slice(0, 500)}
Date: ${component.timestamp || 'unknown'}

Available Chapters:
${(availableTimelineLevels.chapters || [])
  .map(c => `- ${c.title} (${c.start_date} to ${c.end_date || 'ongoing'})`)
  .join('\n')}

Available Arcs:
${(availableTimelineLevels.arcs || [])
  .map(a => `- ${a.title} (${a.start_date} to ${a.end_date || 'ongoing'})`)
  .join('\n')}

Respond with JSON:
{
  "chapter_id": string | null,
  "arc_id": string | null,
  "confidence": number (0-1),
  "reason": string
}`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Use cheaper model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return {
        chapter_id: response.chapter_id || null,
        arc_id: response.arc_id || null,
        confidence: response.confidence || 0.5,
      };
    } catch (error) {
      logger.error({ error }, 'LLM timeline assignment failed');
      return {
        chapter_id: null,
        arc_id: null,
        confidence: 0.3,
      };
    }
  }
}

export const llmMemoryExtractionService = new LLMMemoryExtractionService();

