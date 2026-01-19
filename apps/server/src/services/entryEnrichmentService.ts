// =====================================================
// ENTRY ENRICHMENT SERVICE
// Purpose: Extract emotions, themes, intensity, venting signals
// from entries for better recall and understanding
// =====================================================

import { logger } from '../logger';

import { embeddingService } from './embeddingService';
import { emotionExtractor } from './emotionalIntelligence/emotionExtractor';

export type IntensityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EnrichedEntryMetadata {
  emotions: string[];
  themes: string[];
  people: string[]; // entity IDs
  intensity?: IntensityLevel;
  is_venting?: boolean;
}

export class EntryEnrichmentService {
  /**
   * Enrich entry with emotions, themes, people, intensity, venting detection
   */
  async enrichEntry(
    rawText: string,
    resolvedEntities: Array<{ id: string; type: string }>
  ): Promise<EnrichedEntryMetadata> {
    try {
      // Extract emotions
      const emotions = await this.extractEmotions(rawText);
      
      // Extract themes
      const themes = await this.extractThemes(rawText);
      
      // Filter people/characters from resolved entities
      const people = resolvedEntities
        .filter(e => e.type === 'person' || e.type === 'CHARACTER' || e.type === 'PERSON')
        .map(e => e.id);
      
      // Infer intensity
      const intensity = this.inferIntensity(rawText, emotions);
      
      // Detect venting
      const is_venting = this.detectVenting(rawText, emotions);
      
      return {
        emotions,
        themes,
        people,
        intensity,
        is_venting,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to enrich entry');
      return {
        emotions: [],
        themes: [],
        people: [],
      };
    }
  }

  /**
   * Extract emotions from text
   */
  private async extractEmotions(text: string): Promise<string[]> {
    try {
      const extractor = new EmotionExtractor();
      const signals = extractor.extract([{ content: text, id: '', user_id: '', date: '' }]);
      
      // Get unique emotion types
      const emotions = new Set<string>();
      signals.forEach(signal => {
        if (signal.emotion) {
          emotions.add(signal.emotion);
        }
      });
      
      return Array.from(emotions);
    } catch (error) {
      logger.debug({ error }, 'Failed to extract emotions, using fallback');
      return this.extractEmotionsFallback(text);
    }
  }

  /**
   * Fallback emotion extraction (rule-based)
   */
  private extractEmotionsFallback(text: string): string[] {
    const emotions: string[] = [];
    const textLower = text.toLowerCase();
    
    const emotionPatterns: Record<string, RegExp> = {
      anxious: /(anxious|worried|nervous|uneasy|apprehensive)/i,
      angry: /(angry|mad|furious|irritated|annoyed|pissed)/i,
      sad: /(sad|depressed|down|upset|hurt|melancholy)/i,
      happy: /(happy|joyful|excited|thrilled|elated|grateful)/i,
      hopeful: /(hopeful|optimistic|positive|encouraged)/i,
      frustrated: /(frustrated|stuck|blocked|can't|unable)/i,
      relieved: /(relieved|better|calm|peaceful|content)/i,
      overwhelmed: /(overwhelmed|too much|burnt out|exhausted)/i,
    };
    
    for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
      if (pattern.test(textLower)) {
        emotions.push(emotion);
      }
    }
    
    return emotions;
  }

  /**
   * Extract themes from text (simple keyword-based, can be enhanced with embeddings)
   */
  private async extractThemes(text: string): Promise<string[]> {
    const themes: string[] = [];
    const textLower = text.toLowerCase();
    
    // Common theme patterns
    const themePatterns: Record<string, RegExp> = {
      burnout: /(burnout|exhausted|tired|overwhelmed|can't keep up)/i,
      relationships: /(relationship|friend|partner|family|dating|breakup)/i,
      career: /(work|job|career|promotion|boss|colleague|office)/i,
      health: /(health|sick|doctor|medical|pain|exercise|fitness)/i,
      money: /(money|financial|budget|spending|debt|income|salary)/i,
      creativity: /(creative|art|writing|music|project|idea)/i,
      growth: /(learning|growth|improving|developing|progress)/i,
      conflict: /(fight|argument|disagreement|conflict|tension)/i,
      achievement: /(achieved|accomplished|success|milestone|goal)/i,
      loss: /(loss|grief|death|passed away|mourning)/i,
    };
    
    for (const [theme, pattern] of Object.entries(themePatterns)) {
      if (pattern.test(textLower)) {
        themes.push(theme);
      }
    }
    
    return themes;
  }

  /**
   * Infer emotional intensity from text and emotions
   */
  private inferIntensity(text: string, emotions: string[]): IntensityLevel {
    const textLower = text.toLowerCase();
    
    // Strong intensity indicators
    const strongIndicators = [
      /\b(extremely|incredibly|intensely|deeply|profoundly|overwhelmingly|completely|totally|absolutely)\b/gi,
      /!{2,}/g, // Multiple exclamation marks
      /\b(can't|cannot|never|always|hate|love|desperate|devastated)\b/gi,
    ];
    
    let strongCount = 0;
    for (const pattern of strongIndicators) {
      const matches = textLower.match(pattern);
      if (matches) strongCount += matches.length;
    }
    
    // Weak intensity indicators
    const weakIndicators = [
      /\b(slightly|a bit|somewhat|kind of|sort of|maybe|perhaps)\b/gi,
    ];
    
    let weakCount = 0;
    for (const pattern of weakIndicators) {
      const matches = textLower.match(pattern);
      if (matches) weakCount += matches.length;
    }
    
    // Multiple emotions = higher intensity
    const emotionMultiplier = emotions.length > 2 ? 1.5 : 1;
    
    const intensityScore = (strongCount - weakCount * 0.5) * emotionMultiplier;
    
    if (intensityScore >= 3) return 'HIGH';
    if (intensityScore >= 1) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Detect if text is venting (emotional release, not seeking advice)
   */
  private detectVenting(text: string, emotions: string[]): boolean {
    const textLower = text.toLowerCase();
    
    // Venting indicators
    const ventingPatterns = [
      /(just needed to|had to get|wanted to vent|letting it out)/i,
      /(so frustrated|so angry|so upset|can't believe|unbelievable)/i,
      /(rant|venting|complaining|frustrated about)/i,
      // High emotion + no question marks = likely venting
      ...(emotions.length > 2 && !text.includes('?') ? [/.+/] : []),
    ];
    
    // Not venting if contains advice-seeking
    const adviceSeekingPatterns = [
      /(what should|how do|should i|need advice|what do you think)/i,
      /\?/g, // Questions
    ];
    
    const hasVentingPattern = ventingPatterns.some(pattern => pattern.test(textLower));
    const hasAdviceSeeking = adviceSeekingPatterns.some(pattern => pattern.test(textLower));
    
    return hasVentingPattern && !hasAdviceSeeking;
  }
}

export const entryEnrichmentService = new EntryEnrichmentService();

