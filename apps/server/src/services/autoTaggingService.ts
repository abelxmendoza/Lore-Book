/**
 * Auto-Tagging Service
 * AI-powered classification for entries: tags, lane, hierarchy, characters
 */
import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';
import type { MemoryEntry } from '../types';

import { memoryService } from './memoryService';
import { peoplePlacesService } from './peoplePlacesService';
import { ruleBasedTagExtractionService } from './ruleBasedTagExtraction';
import { timelineManager } from './timelineManager';
import { classificationService } from './ontology/classificationService';

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
  async autoTagEntry(userId: string, entry: MemoryEntry): Promise<AutoTaggingResult> {
    try {
      const ruleBasedTags = await ruleBasedTagExtractionService.suggestTags(entry.content, userId);
      const lane = await this.extractLane(entry.content, entry.tags || [], userId);
      const characters = await peoplePlacesService.listEntities(userId);
      const characterMentions = this.extractCharacterMentions(entry.content, characters.map(c => c.name));

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

      const recentEntries = await memoryService.searchEntries(userId, { limit: 10 });
      const context = recentEntries
        .slice(0, 5)
        .map(e => `[${e.date}] ${e.summary || e.content.substring(0, 100)}`)
        .join('\n');

      const characterNames = characters.map(c => c.name).join(', ');
      const swimlanes = await classificationService.getSwimlanes(userId);
      const laneLabels = swimlanes.map((l) => l.label).join(' | ');

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
  "tags": ["tag1", "tag2", ...],
  "lane": "<one of available lanes>",
  "arc_candidates": ["arc_id or null"],
  "saga_candidates": ["saga_id or null"],
  "era_candidates": ["era_id or null"],
  "character_mentions": ["character_name1", ...],
  "confidence_scores": {
    "tags": 0.0-1.0,
    "lane": 0.0-1.0,
    "overall": 0.0-1.0
  }
}

Available lanes: ${laneLabels}
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
      const validLanes = swimlanes.map((l) => l.label);
      const defaultLane = swimlanes.find((l) => l.isDefault)?.label ?? 'life';

      if (!validLanes.includes(result.lane)) {
        result.lane = defaultLane;
        result.confidence_scores.lane = 0.5;
      }

      const validCharacters = characters.map(c => c.name.toLowerCase());
      result.character_mentions = (result.character_mentions ?? []).filter(name =>
        validCharacters.includes(name.toLowerCase())
      );

      return result;
    } catch (error) {
      logger.error({ error, entryId: entry.id }, 'Auto-tagging failed, using rule-based');
      const ruleBasedTags = await ruleBasedTagExtractionService.suggestTags(entry.content, userId);
      const lane = await this.extractLane(entry.content, entry.tags || [], userId);
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

  private async extractLane(content: string, tags: string[], userId?: string): Promise<string> {
    return classificationService.matchSwimlane(content, tags, userId);
  }

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

      const existingTags = entry.tags || [];
      const newTags = [...new Set([...existingTags, ...result.tags])];

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
