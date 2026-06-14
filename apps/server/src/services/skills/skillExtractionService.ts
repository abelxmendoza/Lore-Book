
import { config } from '../../config';
import { openai } from '../openaiClient';
import { logger } from '../../logger';

import {
  type ExtractedSkillProfile,
  extractedToProfile,
  mergeSkillProfiles,
  normalizeSkillType,
  normalizeMonetization,
  normalizeUsageFrequency,
  normalizeTrajectory,
  clampScore,
  readSkillProfile,
} from './skillProfile';
import { skillService, type SkillCategory } from './skillService';
import { skillDetailsExtractionService } from './skillDetailsExtractionService';
import { skillSuggestionService } from './skillSuggestionService';

export type ExtractedSkill = ExtractedSkillProfile;

const EXTRACTION_SYSTEM = `You extract SKILLS from a user's life story text. Skills are dynamic identity assets — not tags.

Detect skills from:
- direct claims ("I know C++", "I'm a line cook")
- work history ("I fixed robots in the field")
- projects ("building LoreBook in React")
- hobbies ("I train Muay Thai")
- repeated behavior ("keep debugging ROS nodes")
- deep contextual talk about a capability even without "I am skilled at"

For each skill return JSON fields:
- skill_name (specific, e.g. "React", "Muay Thai", "Line Cooking")
- skill_category: professional|creative|physical|social|intellectual|emotional|practical|artistic|technical|other
- skill_type: professional|hobby|survival|creative|social|technical|physical
- monetization: paid|potentially_paid|unpaid|hobby_only
- proficiency: 1-100
- confidence: 0.0-1.0
- enjoyment: 1-100
- usage_frequency: daily|weekly|monthly|rarely
- trajectory: improving|stagnant|declining|unknown
- description: one sentence of context
- origin_story: short story if mentioned
- first_learned_context: how/where they picked it up
- related_jobs: string[]
- related_projects: string[]
- parent_skill_name: optional — if this is a subskill (e.g. "Armbar" → parent "Brazilian Jiu-Jitsu")
- related_skill_names: optional string[] — peer skills (e.g. ["Muay Thai", "Wrestling"])
- evidence: 1-3 short quotes from the text
- is_active: boolean

Examples:
"I worked as a line cook at Chipotle" → Cooking, Food prep, Kitchen operations (multiple skills ok)
"I'm building LoreBook in React and Supabase" → React, TypeScript, Supabase, Product development
"I'm 6-0 in Muay Thai and a BJJ blue belt" → Muay Thai, Brazilian Jiu-Jitsu

Return ONLY JSON: {"skills":[...]}. Be conservative with confidence below 0.5.`;

/**
 * Skill Extraction Service — derives skill lore from chat and journal context.
 */
class SkillExtractionService {
  private normalizeCategory(category: string): SkillCategory {
    const normalized = category.toLowerCase().trim();
    const valid: SkillCategory[] = [
      'professional', 'creative', 'physical', 'social', 'intellectual',
      'emotional', 'practical', 'artistic', 'technical', 'other',
    ];
    return valid.includes(normalized as SkillCategory) ? (normalized as SkillCategory) : 'other';
  }

  private parseExtracted(raw: unknown): ExtractedSkillProfile[] {
    const skills = Array.isArray((raw as { skills?: unknown }).skills)
      ? (raw as { skills: unknown[] }).skills
      : [];

    return skills
      .map((s: any) => ({
        skill_name: String(s.skill_name ?? '').trim(),
        skill_category: this.normalizeCategory(String(s.skill_category ?? 'other')),
        skill_type: normalizeSkillType(s.skill_type),
        monetization: normalizeMonetization(s.monetization),
        proficiency: clampScore(s.proficiency, 40),
        confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0.5)),
        enjoyment: clampScore(s.enjoyment, 50),
        usage_frequency: normalizeUsageFrequency(s.usage_frequency),
        trajectory: normalizeTrajectory(s.trajectory),
        description: s.description ? String(s.description) : undefined,
        origin_story: s.origin_story ? String(s.origin_story) : undefined,
        first_learned_context: s.first_learned_context ? String(s.first_learned_context) : undefined,
        related_jobs: Array.isArray(s.related_jobs) ? s.related_jobs.map(String) : [],
        related_projects: Array.isArray(s.related_projects) ? s.related_projects.map(String) : [],
        parent_skill_name: s.parent_skill_name ? String(s.parent_skill_name).trim() : undefined,
        related_skill_names: Array.isArray(s.related_skill_names)
          ? s.related_skill_names.map(String).filter(Boolean)
          : [],
        evidence: Array.isArray(s.evidence) ? s.evidence.map(String).filter(Boolean) : [],
        is_active: s.is_active !== false,
      }))
      .filter((s) => s.skill_name.length >= 2);
  }

  private async callExtraction(content: string): Promise<ExtractedSkillProfile[]> {
    const chunks: string[] = [];
    const maxChunk = 6000;
    for (let i = 0; i < content.length; i += maxChunk) {
      chunks.push(content.slice(i, i + maxChunk));
    }

    const merged = new Map<string, ExtractedSkillProfile>();
    for (const chunk of chunks.slice(0, 3)) {
      try {
        const response = await openai.chat.completions.create({
          model: config.defaultModel || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM },
            { role: 'user', content: chunk },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        });

        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
        for (const skill of this.parseExtracted(parsed)) {
          const key = skill.skill_name.toLowerCase();
          const prev = merged.get(key);
          if (!prev || skill.confidence > prev.confidence) {
            merged.set(key, {
              ...skill,
              evidence: [...new Set([...(prev?.evidence ?? []), ...skill.evidence])],
              related_jobs: [...new Set([...(prev?.related_jobs ?? []), ...(skill.related_jobs ?? [])])],
              related_projects: [...new Set([...(prev?.related_projects ?? []), ...(skill.related_projects ?? [])])],
            });
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Skill extraction chunk failed');
      }
    }

    return [...merged.values()].filter((s) => s.confidence >= 0.45);
  }

  async extractSkillsFromEntry(userId: string, entryId: string, content: string): Promise<ExtractedSkillProfile[]> {
    try {
      if (!content?.trim()) return [];
      return await this.callExtraction(content);
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to extract skills from entry');
      return [];
    }
  }

  /** Chat messages → suggestions only (user must confirm). */
  async processChatMessageForSkillSuggestions(
    userId: string,
    messageId: string,
    content: string
  ): Promise<number> {
    const extracted = await this.extractSkillsFromEntry(userId, messageId, content);
    const existing = await skillService.getSkills(userId, { active_only: false });
    const have = new Set(existing.map((s) => s.skill_name.toLowerCase()));

    let saved = 0;
    for (const skill of extracted) {
      if (have.has(skill.skill_name.toLowerCase())) continue;
      await skillSuggestionService.upsertFromExtraction(userId, skill, {
        sourceMessageId: messageId,
        source: 'chat',
      });
      saved++;
    }
    return saved;
  }

  /**
   * Journal / confirmed paths — merge into skills when confidence is high enough,
   * otherwise queue as suggestions.
   */
  async processEntryForSkills(userId: string, entryId: string, content: string): Promise<Array<{ skill: any; created: boolean }>> {
    try {
      const extractedSkills = await this.extractSkillsFromEntry(userId, entryId, content);
      const results: Array<{ skill: any; created: boolean }> = [];

      for (const extracted of extractedSkills) {
        if (extracted.confidence < 0.72) {
          await skillSuggestionService.upsertFromExtraction(userId, extracted, {
            sourceMessageId: entryId,
            source: 'journal',
          });
          continue;
        }

        const existingSkills = await skillService.getSkills(userId, { active_only: true });
        const existing = existingSkills.find(
          (s) => s.skill_name.toLowerCase() === extracted.skill_name.toLowerCase()
        );

        const incomingProfile = extractedToProfile(extracted, entryId);

        if (existing) {
          const mergedProfile = mergeSkillProfiles(readSkillProfile(existing.metadata), incomingProfile);
          await skillService.updateSkillMetadata(userId, existing.id, { skill_profile: mergedProfile });
          await skillService.addXP(userId, existing.id, 10, 'memory', entryId, 'Mentioned in journal entry');
          await skillService.recordUsageEvent(userId, existing.id, {
            context: extracted.description,
            source_message_id: entryId,
            enjoyment: incomingProfile.enjoyment,
          });
          results.push({ skill: existing, created: false });

          skillDetailsExtractionService.extractSkillDetails(userId, existing.id)
            .catch((err) => logger.error({ err, userId, skillId: existing.id }, 'Failed to auto-extract skill details'));
        } else {
          const newSkill = await skillService.createSkill(userId, {
            skill_name: extracted.skill_name,
            skill_category: extracted.skill_category,
            description: extracted.description,
            auto_detected: true,
            confidence_score: extracted.confidence,
            metadata: { skill_profile: incomingProfile },
          });
          await skillService.recordUsageEvent(userId, newSkill.id, {
            context: extracted.description,
            source_message_id: entryId,
            enjoyment: incomingProfile.enjoyment,
          });
          results.push({ skill: newSkill, created: true });

          skillDetailsExtractionService.extractSkillDetails(userId, newSkill.id)
            .then((details) => skillService.updateSkillDetails(userId, newSkill.id, details))
            .catch((err) => logger.error({ err, userId, skillId: newSkill.id }, 'Failed to auto-extract skill details'));
        }
      }

      return results;
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to process entry for skills');
      return [];
    }
  }

  async processQuestForSkills(
    userId: string,
    questId: string,
    questText: string,
    opts: { completed?: boolean; xpOverride?: number; reason?: string } = {}
  ): Promise<Array<{ skill: any; created: boolean; leveledUp: boolean }>> {
    try {
      const text = questText?.trim();
      if (!text) return [];

      const extractedSkills = await this.extractSkillsFromEntry(userId, questId, text);
      const xp = opts.xpOverride ?? (opts.completed ? 60 : 15);
      const reason = opts.reason ?? (opts.completed ? 'Completed a related quest' : 'Pursuing a related quest');
      const results: Array<{ skill: any; created: boolean; leveledUp: boolean }> = [];

      const existingSkills = await skillService.getSkills(userId, { active_only: true });

      for (const extracted of extractedSkills) {
        const existing = existingSkills.find(
          (s) => s.skill_name.toLowerCase() === extracted.skill_name.toLowerCase()
        );
        const incomingProfile = extractedToProfile(extracted, questId);

        if (existing) {
          const mergedProfile = mergeSkillProfiles(readSkillProfile(existing.metadata), incomingProfile);
          await skillService.updateSkillMetadata(userId, existing.id, { skill_profile: mergedProfile });
          const r = await skillService.addXP(userId, existing.id, xp, 'achievement', questId, reason);
          results.push({ skill: r.skill, created: false, leveledUp: r.leveledUp });
        } else {
          const newSkill = await skillService.createSkill(userId, {
            skill_name: extracted.skill_name,
            skill_category: extracted.skill_category,
            description: extracted.description,
            auto_detected: true,
            confidence_score: extracted.confidence,
            metadata: { skill_profile: incomingProfile },
          });
          const r = await skillService.addXP(userId, newSkill.id, xp, 'achievement', questId, reason);
          results.push({ skill: r.skill, created: true, leveledUp: r.leveledUp });
        }
      }

      return results;
    } catch (error) {
      logger.error({ error, userId, questId }, 'Failed to process quest for skills');
      return [];
    }
  }
}

export const skillExtractionService = new SkillExtractionService();
