import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';

import { skillService, type SkillCategory } from './skillService';

const openai = new OpenAI({ apiKey: config.openAiKey });

export interface ExtractedSkill {
  skill_name: string;
  skill_category: SkillCategory;
  confidence: number;
  description?: string;
  evidence: string[]; // Quotes from journal entries
}

/**
 * Skill Extraction Service
 * Uses AI to automatically detect skills from journal entries
 */
class SkillExtractionService {
  /**
   * Extract skills from a journal entry
   */
  async extractSkillsFromEntry(userId: string, entryId: string, content: string): Promise<ExtractedSkill[]> {
    try {
      const prompt = `Analyze this journal entry and identify any skills, abilities, or learning activities mentioned. 

Return a JSON object with a "skills" array. Each skill should have:
- skill_name: The name of the skill (e.g., "Python Programming", "Guitar Playing", "Public Speaking", "Weightlifting", "Social Skills", "Making Friends", "Romantic Approach")
- skill_category: One of: professional, creative, physical, social, intellectual, emotional, practical, artistic, technical, other
- confidence: 0.0-1.0 (how confident you are this is actually a skill being practiced/learned)
- description: Brief description of the skill context
- evidence: Array of 1-2 short quotes from the text that show this skill

Special attention to:
- Physical skills: weightlifting, fitness, exercise, sports
- Social skills: making friends, picking up girls, romantic approach, networking, conversation skills, building relationships
- Gym-related: weightlifting, strength training, cardio, fitness

Only include skills that are:
1. Actually being practiced, learned, or improved
2. Not just mentioned in passing
3. Have clear evidence in the text

Return ONLY valid JSON object with "skills" array, no other text.

Journal entry:
${content.substring(0, 2000)}`;

      const response = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a skill detection system. Extract skills from journal entries. Return only valid JSON objects with a "skills" array.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      const skills = Array.isArray(result.skills) ? result.skills : [];

      // Filter by confidence threshold
      return skills
        .filter((s: ExtractedSkill) => s.confidence >= 0.5)
        .map((s: ExtractedSkill) => ({
          ...s,
          skill_category: this.normalizeCategory(s.skill_category)
        }));
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to extract skills from entry');
      return [];
    }
  }

  /**
   * Normalize skill category
   */
  private normalizeCategory(category: string): SkillCategory {
    const normalized = category.toLowerCase().trim();
    const validCategories: SkillCategory[] = [
      'professional', 'creative', 'physical', 'social', 'intellectual',
      'emotional', 'practical', 'artistic', 'technical', 'other'
    ];
    
    if (validCategories.includes(normalized as SkillCategory)) {
      return normalized as SkillCategory;
    }
    
    return 'other';
  }

  /**
   * Process a journal entry and create/update skills
   */
  async processEntryForSkills(userId: string, entryId: string, content: string): Promise<Array<{ skill: any; created: boolean }>> {
    try {
      const extractedSkills = await this.extractSkillsFromEntry(userId, entryId, content);
      const results: Array<{ skill: any; created: boolean }> = [];

      for (const extracted of extractedSkills) {
        // Check if skill already exists
        const existingSkills = await skillService.getSkills(userId, { active_only: true });
        const existing = existingSkills.find(
          s => s.skill_name.toLowerCase() === extracted.skill_name.toLowerCase()
        );

        if (existing) {
          // Add XP to existing skill
          await skillService.addXP(
            userId,
            existing.id,
            10, // Base XP per mention
            'memory',
            entryId,
            `Mentioned in journal entry`
          );
          results.push({ skill: existing, created: false });
        } else {
          // Create new skill
          const newSkill = await skillService.createSkill(userId, {
            skill_name: extracted.skill_name,
            skill_category: extracted.skill_category,
            description: extracted.description,
            auto_detected: true,
            confidence_score: extracted.confidence
          });
          results.push({ skill: newSkill, created: true });
        }
      }

      return results;
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to process entry for skills');
      return [];
    }
  }
}

export const skillExtractionService = new SkillExtractionService();
