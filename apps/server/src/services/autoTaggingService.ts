/**
 * Auto-Tagging Service
 * AI-powered classification for entries: tags, lane, hierarchy, characters
 */

import OpenAI from 'openai';
import { logger } from '../logger';
import { config } from '../config';
import { memoryService } from './memoryService';
import { timelineManager } from './timelineManager';
import { peoplePlacesService } from './peoplePlacesService';
import { ruleBasedTagExtractionService } from './ruleBasedTagExtraction';
import type { MemoryEntry } from '../types';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type AutoTaggingResult = {
  tags: string[];
  lane: string;
  arc_candidates?: string[];
  saga_candidates?: string[];
  era_candidates?: string[];
  character_mentions: string[];
  confidence_scores: {
    tags: number;
    lane: number;
    overall: number;
  };
};

class AutoTaggingService {
  /**
   * Auto-tag an entry with AI
   */
  async autoTagEntry(userId: string, entry: MemoryEntry): Promise<AutoTaggingResult> {
    try {
      // Use rule-based tag extraction first (FREE - no API call)
      const ruleBasedTags = await ruleBasedTagExtractionService.suggestTags(entry.content, userId);
      
      // Extract lane from content patterns (FREE)
      const lane = this.extractLane(entry.content, entry.tags || []);
      
      // Extract character mentions using rule-based extraction (FREE)
      const characters = await peoplePlacesService.listEntities(userId);
      const characterMentions = this.extractCharacterMentions(entry.content, characters.map(c => c.name));

      // If we have good rule-based results, use them (skip API call)
      if (ruleBasedTags.length >= 3) {
        return {
          tags: ruleBasedTags.slice(0, 7),
          lane,
          character_mentions: characterMentions,
          confidence_scores: {
            tags: 0.7,
            lane: 0.6,
            overall: 0.65
          }
        };
      }

      // Fallback to API only if rule-based didn't produce enough tags
      // Get context: recent entries, existing timeline hierarchy
      const recentEntries = await memoryService.searchEntries(userId, { limit: 10 });
      const context = recentEntries
        .slice(0, 5)
        .map(e => `[${e.date}] ${e.summary || e.content.substring(0, 100)}`)
        .join('\n');

      const characterNames = characters.map(c => c.name).join(', ');

      // Get existing timeline hierarchy for context
      const [recentArcs, recentSagas, recentEras] = await Promise.all([
        timelineManager.search(userId, { layer_type: ['arc'], date_from: entry.date }),
        timelineManager.search(userId, { layer_type: ['saga'], date_from: entry.date }),
        timelineManager.search(userId, { layer_type: ['era'], date_from: entry.date })
      ]);

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant that classifies journal entries. Return JSON with:
{
  "tags": ["tag1", "tag2", ...], // 3-7 relevant tags
  "lane": "life" | "robotics" | "mma" | "work" | "creative", // primary lane
  "arc_candidates": ["arc_id or null"], // if this fits an existing arc
  "saga_candidates": ["saga_id or null"], // if this fits an existing saga
  "era_candidates": ["era_id or null"], // if this fits an existing era
  "character_mentions": ["character_name1", ...], // characters mentioned
  "confidence_scores": {
    "tags": 0.0-1.0,
    "lane": 0.0-1.0,
    "overall": 0.0-1.0
  }
}

Available lanes: life, robotics, mma, work, creative
Available characters: ${characterNames || 'none'}
Recent arcs: ${recentArcs.slice(0, 3).map(a => `${a.id}: ${a.title}`).join(', ') || 'none'}
Recent sagas: ${recentSagas.slice(0, 3).map(s => `${s.id}: ${s.title}`).join(', ') || 'none'}
Recent eras: ${recentEras.slice(0, 3).map(e => `${e.id}: ${e.title}`).join(', ') || 'none'}`
          },
          {
            role: 'user',
            content: `Classify this entry:\nDate: ${entry.date}\nContent: ${entry.content}\n${entry.summary ? `Summary: ${entry.summary}` : ''}\nTags: ${entry.tags.join(', ') || 'none'}\nMood: ${entry.mood || 'none'}\n\nRecent context:\n${context || 'No recent context'}`
          }
        ]
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || '{}') as AutoTaggingResult;
      
      // Validate and normalize
      const validLanes = ['life', 'robotics', 'mma', 'work', 'creative'];
      if (!validLanes.includes(result.lane)) {
        result.lane = 'life'; // Default fallback
        result.confidence_scores.lane = 0.5;
      }

      // Filter out invalid character mentions
      const validCharacters = characters.map(c => c.name.toLowerCase());
      result.character_mentions = result.character_mentions.filter(name =>
        validCharacters.includes(name.toLowerCase())
      );

      return result;
    } catch (error) {
      logger.error({ error, entryId: entry.id }, 'Auto-tagging failed, using rule-based');
      // Fallback to rule-based on error
      const ruleBasedTags = await ruleBasedTagExtractionService.suggestTags(entry.content, userId);
      const lane = this.extractLane(entry.content, entry.tags || []);
      const characters = await peoplePlacesService.listEntities(userId);
      const characterMentions = this.extractCharacterMentions(entry.content, characters.map(c => c.name));
      
      return {
        tags: ruleBasedTags.length > 0 ? ruleBasedTags : (entry.tags || []),
        lane,
        character_mentions: characterMentions,
        confidence_scores: {
          tags: 0.6,
          lane: 0.5,
          overall: 0.55
        }
      };
    }
  }

  /**
   * Extract lane from content patterns (FREE - rule-based)
   */
  private extractLane(content: string, tags: string[]): string {
    const lowerContent = content.toLowerCase();
    const lowerTags = tags.map(t => t.toLowerCase()).join(' ');

    const lanePatterns = {
      robotics: ['robot', 'robotics', 'ai', 'machine learning', 'automation', 'sensor', 'actuator', 'arduino', 'raspberry pi'],
      mma: ['mma', 'fighting', 'martial arts', 'training', 'gym', 'sparring', 'fight', 'jiu jitsu', 'boxing', 'wrestling'],
      work: ['work', 'meeting', 'project', 'deadline', 'office', 'colleague', 'boss', 'client', 'presentation'],
      creative: ['art', 'creative', 'design', 'music', 'writing', 'drawing', 'painting', 'photography', 'film'],
      life: [] // Default
    };

    for (const [lane, keywords] of Object.entries(lanePatterns)) {
      if (lane === 'life') continue;
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword) || lowerTags.includes(keyword)) {
          return lane;
        }
      }
    }

    return 'life'; // Default
  }

  /**
   * Extract character mentions from content (FREE - rule-based)
   */
  private extractCharacterMentions(content: string, characterNames: string[]): string[] {
    const mentions: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const name of characterNames) {
      if (lowerContent.includes(name.toLowerCase())) {
        mentions.push(name);
      }
    }

    return mentions;
  }

  /**
   * Apply auto-tagging results to entry metadata
   */
  async applyAutoTags(userId: string, entryId: string, result: AutoTaggingResult): Promise<MemoryEntry> {
    try {
      const entry = await memoryService.getEntry(userId, entryId);
      if (!entry) throw new Error('Entry not found');

      const updatedMetadata = {
        ...entry.metadata,
        auto_tags: result.tags,
        auto_lane: result.lane,
        auto_tag_confidence: result.confidence_scores,
        auto_arc_candidates: result.arc_candidates || [],
        auto_saga_candidates: result.saga_candidates || [],
        auto_era_candidates: result.era_candidates || [],
        auto_character_mentions: result.character_mentions,
        auto_tagged_at: new Date().toISOString()
      };

      // Merge auto-tags with existing tags (avoid duplicates)
      const existingTags = entry.tags || [];
      const newTags = [...new Set([...existingTags, ...result.tags])];

      // Update entry
      const updated = await memoryService.updateEntry(userId, entryId, {
        tags: newTags,
        metadata: updatedMetadata
      });

      return updated;
    } catch (error) {
      logger.error({ error, entryId }, 'Failed to apply auto-tags');
      throw error;
    }
  }
}

export const autoTaggingService = new AutoTaggingService();

