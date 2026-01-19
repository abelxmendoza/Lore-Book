/**
 * Essence Profile Service
 * Extracts and tracks user's psychological essence: hopes, dreams, fears, strengths, weaknesses, skills, values, traits, and relationship patterns
 */

import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

import { memoryService } from './memoryService';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type EssenceInsight = {
  text: string;
  confidence: number;
  extractedAt: string;
  sources: string[];
};

export type SkillInsight = {
  skill: string;
  confidence: number;
  evidence: string[];
  extractedAt: string;
};

export type EvolutionEntry = {
  date: string;
  changes: string;
  trigger: string;
};

export type EssenceProfile = {
  hopes: EssenceInsight[];
  dreams: EssenceInsight[];
  fears: EssenceInsight[];
  strengths: EssenceInsight[];
  weaknesses: EssenceInsight[];
  topSkills: SkillInsight[];
  coreValues: EssenceInsight[];
  personalityTraits: EssenceInsight[];
  relationshipPatterns: EssenceInsight[];
  evolution: EvolutionEntry[];
};

class EssenceProfileService {
  /**
   * Get user's essence profile
   */
  async getProfile(userId: string): Promise<EssenceProfile> {
    try {
      const { data, error } = await supabaseAdmin
        .from('essence_profiles')
        .select('profile_data')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        // Return default empty profile
        return this.getDefaultProfile();
      }

      return (data.profile_data as EssenceProfile) || this.getDefaultProfile();
    } catch (error) {
      logger.error({ error }, 'Failed to get essence profile');
      return this.getDefaultProfile();
    }
  }

  /**
   * Extract essence insights from conversation and entries
   */
  async extractEssence(
    userId: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    recentEntries?: Array<{ content: string; date: string; summary?: string }>
  ): Promise<Partial<EssenceProfile>> {
    try {
      // Get recent entries if not provided
      if (!recentEntries) {
        const entries = await memoryService.searchEntries(userId, { limit: 50 });
        recentEntries = entries.map(e => ({
          content: e.content,
          date: e.date,
          summary: e.summary || undefined
        }));
      }

      // Combine conversation and entries for analysis
      const combinedText = [
        ...conversationHistory.map(m => `${m.role}: ${m.content}`),
        ...recentEntries.map(e => `[${e.date}] ${e.summary || e.content}`)
      ].join('\n\n');

      // Use OpenAI to extract essence insights
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze the following conversations and journal entries to extract psychological and identity insights. 
Return JSON with:
{
  "hopes": [{"text": "...", "confidence": 0.0-1.0, "source": "entry_id or conversation"}],
  "dreams": [{"text": "...", "confidence": 0.0-1.0, "source": "..."}],
  "fears": [{"text": "...", "confidence": 0.0-1.0, "source": "..."}],
  "strengths": [{"text": "...", "confidence": 0.0-1.0, "source": "..."}],
  "weaknesses": [{"text": "...", "confidence": 0.0-1.0, "source": "..."}],
  "topSkills": [{"skill": "...", "confidence": 0.0-1.0, "evidence": ["...", "..."]}],
  "coreValues": [{"text": "...", "confidence": 0.0-1.0, "source": "..."}],
  "personalityTraits": [{"text": "...", "confidence": 0.0-1.0, "source": "..."}],
  "relationshipPatterns": [{"text": "...", "confidence": 0.0-1.0, "source": "..."}]
}

Be specific and evidence-based. Only include insights with confidence > 0.5.`
          },
          {
            role: 'user',
            content: combinedText.substring(0, 8000) // Limit length
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      // Transform to match our type structure
      const now = new Date().toISOString();
      const insights: Partial<EssenceProfile> = {
        hopes: (parsed.hopes || []).map((h: any) => ({
          text: h.text,
          confidence: h.confidence || 0.7,
          extractedAt: now,
          sources: [h.source || 'conversation']
        })),
        dreams: (parsed.dreams || []).map((d: any) => ({
          text: d.text,
          confidence: d.confidence || 0.7,
          extractedAt: now,
          sources: [d.source || 'conversation']
        })),
        fears: (parsed.fears || []).map((f: any) => ({
          text: f.text,
          confidence: f.confidence || 0.7,
          extractedAt: now,
          sources: [f.source || 'conversation']
        })),
        strengths: (parsed.strengths || []).map((s: any) => ({
          text: s.text,
          confidence: s.confidence || 0.7,
          extractedAt: now,
          sources: [s.source || 'conversation']
        })),
        weaknesses: (parsed.weaknesses || []).map((w: any) => ({
          text: w.text,
          confidence: w.confidence || 0.7,
          extractedAt: now,
          sources: [w.source || 'conversation']
        })),
        topSkills: (parsed.topSkills || []).map((s: any) => ({
          skill: s.skill,
          confidence: s.confidence || 0.7,
          evidence: s.evidence || [],
          extractedAt: now
        })),
        coreValues: (parsed.coreValues || []).map((v: any) => ({
          text: v.text,
          confidence: v.confidence || 0.7,
          extractedAt: now,
          sources: [v.source || 'conversation']
        })),
        personalityTraits: (parsed.personalityTraits || []).map((t: any) => ({
          text: t.text,
          confidence: t.confidence || 0.7,
          extractedAt: now,
          sources: [t.source || 'conversation']
        })),
        relationshipPatterns: (parsed.relationshipPatterns || []).map((r: any) => ({
          text: r.text,
          confidence: r.confidence || 0.7,
          extractedAt: now,
          sources: [r.source || 'conversation']
        }))
      };

      return insights;
    } catch (error) {
      logger.error({ error }, 'Failed to extract essence');
      return {};
    }
  }

  /**
   * Update profile with new insights
   */
  async updateProfile(userId: string, newInsights: Partial<EssenceProfile>): Promise<void> {
    try {
      const currentProfile = await this.getProfile(userId);
      
      // Merge new insights with existing, avoiding duplicates
      const updatedProfile: EssenceProfile = {
        hopes: this.mergeInsights(currentProfile.hopes, newInsights.hopes || []),
        dreams: this.mergeInsights(currentProfile.dreams, newInsights.dreams || []),
        fears: this.mergeInsights(currentProfile.fears, newInsights.fears || []),
        strengths: this.mergeInsights(currentProfile.strengths, newInsights.strengths || []),
        weaknesses: this.mergeInsights(currentProfile.weaknesses, newInsights.weaknesses || []),
        topSkills: this.mergeSkills(currentProfile.topSkills, newInsights.topSkills || []),
        coreValues: this.mergeInsights(currentProfile.coreValues, newInsights.coreValues || []),
        personalityTraits: this.mergeInsights(currentProfile.personalityTraits, newInsights.personalityTraits || []),
        relationshipPatterns: this.mergeInsights(currentProfile.relationshipPatterns, newInsights.relationshipPatterns || []),
        evolution: currentProfile.evolution
      };

      // Detect evolution changes
      const changes = this.detectChanges(currentProfile, updatedProfile);
      if (changes.length > 0) {
        updatedProfile.evolution.push(...changes.map(c => ({
          date: new Date().toISOString(),
          changes: c,
          trigger: 'conversation'
        })));
      }

      // Upsert profile
      const { error } = await supabaseAdmin
        .from('essence_profiles')
        .upsert({
          user_id: userId,
          profile_data: updatedProfile,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        logger.error({ error }, 'Failed to update essence profile');
        throw error;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to update profile');
      throw error;
    }
  }

  /**
   * Detect skills from entries
   */
  async detectSkills(userId: string, entries: Array<{ content: string; date: string }>): Promise<SkillInsight[]> {
    try {
      const content = entries
        .map(e => `[${e.date}] ${e.content}`)
        .join('\n\n')
        .substring(0, 6000);

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract technical skills, talents, and expertise areas mentioned in these entries. 
Return JSON with:
{
  "skills": [
    {
      "skill": "skill name",
      "confidence": 0.0-1.0,
      "evidence": ["quote 1", "quote 2"]
    }
  ]
}

Only include skills with confidence > 0.6. Evidence should be direct quotes from entries.`
          },
          {
            role: 'user',
            content
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const now = new Date().toISOString();
      
      return (parsed.skills || []).map((s: any) => ({
        skill: s.skill,
        confidence: s.confidence || 0.7,
        evidence: s.evidence || [],
        extractedAt: now
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to detect skills');
      return [];
    }
  }

  /**
   * Get evolution timeline
   */
  async getEvolution(userId: string): Promise<EvolutionEntry[]> {
    const profile = await this.getProfile(userId);
    return profile.evolution || [];
  }

  /**
   * Merge insights, avoiding duplicates
   */
  private mergeInsights(existing: EssenceInsight[], newOnes: EssenceInsight[]): EssenceInsight[] {
    const merged = [...existing];
    
    for (const newInsight of newOnes) {
      // Check for similar insights (fuzzy match)
      const similar = merged.find(existing => 
        this.similarText(existing.text, newInsight.text)
      );
      
      if (similar) {
        // Update confidence if new one is higher, merge sources
        if (newInsight.confidence > similar.confidence) {
          similar.confidence = newInsight.confidence;
        }
        similar.sources = [...new Set([...similar.sources, ...newInsight.sources])];
      } else {
        merged.push(newInsight);
      }
    }
    
    // Sort by confidence descending
    return merged.sort((a, b) => b.confidence - a.confidence).slice(0, 20); // Keep top 20
  }

  /**
   * Merge skills
   */
  private mergeSkills(existing: SkillInsight[], newOnes: SkillInsight[]): SkillInsight[] {
    const merged = [...existing];
    
    for (const newSkill of newOnes) {
      const similar = merged.find(existing => 
        existing.skill.toLowerCase() === newSkill.skill.toLowerCase()
      );
      
      if (similar) {
        if (newSkill.confidence > similar.confidence) {
          similar.confidence = newSkill.confidence;
        }
        similar.evidence = [...new Set([...similar.evidence, ...newSkill.evidence])];
      } else {
        merged.push(newSkill);
      }
    }
    
    return merged.sort((a, b) => b.confidence - a.confidence).slice(0, 15); // Keep top 15
  }

  /**
   * Detect changes between profiles
   */
  private detectChanges(oldProfile: EssenceProfile, newProfile: EssenceProfile): string[] {
    const changes: string[] = [];
    
    // Compare counts
    if (newProfile.hopes.length > oldProfile.hopes.length) {
      changes.push(`Discovered ${newProfile.hopes.length - oldProfile.hopes.length} new hope(s)`);
    }
    if (newProfile.fears.length > oldProfile.fears.length) {
      changes.push(`Identified ${newProfile.fears.length - oldProfile.fears.length} new fear(s)`);
    }
    if (newProfile.topSkills.length > oldProfile.topSkills.length) {
      changes.push(`Recognized ${newProfile.topSkills.length - oldProfile.topSkills.length} new skill(s)`);
    }
    
    return changes;
  }

  /**
   * Check if two texts are similar (simple fuzzy match)
   */
  private similarText(text1: string, text2: string): boolean {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const commonWords = words1.filter(w => words2.includes(w));
    return commonWords.length / Math.max(words1.length, words2.length) > 0.6;
  }

  /**
   * Get default empty profile
   */
  private getDefaultProfile(): EssenceProfile {
    return {
      hopes: [],
      dreams: [],
      fears: [],
      strengths: [],
      weaknesses: [],
      topSkills: [],
      coreValues: [],
      personalityTraits: [],
      relationshipPatterns: [],
      evolution: []
    };
  }
}

export const essenceProfileService = new EssenceProfileService();


