/**
 * Preserved Content Placer
 * 
 * Intelligently places preserved content (testimonies, advice, etc.) in optimal
 * chapters and positions based on narrative relevance rather than temporal accuracy.
 */

import OpenAI from 'openai';
import { config } from '../../config';
import { logger } from '../../logger';
import type { ContentType } from '../../types';
import type {
  NarrativeAtom,
  ChapterCluster,
  PreservedContentPlacement,
  BiographySpec
} from './types';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * Placement rules by content type
 */
const PLACEMENT_RULES: Record<ContentType, {
  position: 'beginning' | 'end' | 'contextual';
  chapter: 'first' | 'last' | 'contextual';
  priority: number;
  strategy?: 'thematic_relevance' | 'temporal_relevance' | 'narrative_flow' | 'thematic_peak' | 'turning_point' | 'significance_peak';
}> = {
  'preface': { position: 'beginning', chapter: 'first', priority: 1 },
  'dedication': { position: 'beginning', chapter: 'first', priority: 2 },
  'acknowledgment': { position: 'beginning', chapter: 'first', priority: 3 },
  'epilogue': { position: 'end', chapter: 'last', priority: 1 },
  'testimony': { position: 'contextual', chapter: 'contextual', priority: 0, strategy: 'thematic_relevance' },
  'advice': { position: 'contextual', chapter: 'contextual', priority: 0, strategy: 'temporal_relevance' },
  'message_to_reader': { position: 'contextual', chapter: 'contextual', priority: 0, strategy: 'narrative_flow' },
  'manifesto': { position: 'contextual', chapter: 'contextual', priority: 0, strategy: 'thematic_peak' },
  'vow': { position: 'contextual', chapter: 'contextual', priority: 0, strategy: 'turning_point' },
  'promise': { position: 'contextual', chapter: 'contextual', priority: 0, strategy: 'temporal_relevance' },
  'declaration': { position: 'contextual', chapter: 'contextual', priority: 0, strategy: 'significance_peak' },
  'standard': { position: 'contextual', chapter: 'contextual', priority: 0, strategy: 'temporal_relevance' }
};

export class PreservedContentPlacer {
  /**
   * Place preserved content in optimal chapters and positions
   */
  async placePreservedContent(
    preservedAtoms: NarrativeAtom[],
    chapters: Array<ChapterCluster & { title: string }>,
    spec: BiographySpec
  ): Promise<Map<string, Array<{ atom: NarrativeAtom; position: 'opening' | 'middle' | 'closing' | 'standalone' }>>> {
    const placementMap = new Map<string, Array<{ atom: NarrativeAtom; position: 'opening' | 'middle' | 'closing' | 'standalone' }>>();

    if (preservedAtoms.length === 0 || chapters.length === 0) {
      return placementMap;
    }

    // Stage 1: Separate by content type
    const structural = preservedAtoms.filter(a => {
      const contentType = (a.metadata as any)?.content_type as ContentType;
      return ['preface', 'dedication', 'acknowledgment', 'epilogue'].includes(contentType);
    });

    const contextual = preservedAtoms.filter(a => {
      const contentType = (a.metadata as any)?.content_type as ContentType;
      return !['preface', 'dedication', 'acknowledgment', 'epilogue'].includes(contentType);
    });

    // Stage 2: Place structural elements
    if (chapters.length > 0) {
      const firstChapterId = chapters[0].id;
      const openingContent = structural.filter(a => {
        const contentType = (a.metadata as any)?.content_type as ContentType;
        return ['preface', 'dedication', 'acknowledgment'].includes(contentType);
      });

      // Sort by priority
      openingContent.sort((a, b) => {
        const typeA = (a.metadata as any)?.content_type as ContentType;
        const typeB = (b.metadata as any)?.content_type as ContentType;
        return (PLACEMENT_RULES[typeA]?.priority || 0) - (PLACEMENT_RULES[typeB]?.priority || 0);
      });

      if (openingContent.length > 0) {
        placementMap.set(firstChapterId, openingContent.map(a => ({
          atom: a,
          position: 'opening' as const
        })));
      }

      // Epilogue → last chapter closing
      const lastChapterId = chapters[chapters.length - 1].id;
      const epilogueContent = structural.filter(a => {
        const contentType = (a.metadata as any)?.content_type as ContentType;
        return contentType === 'epilogue';
      });

      if (epilogueContent.length > 0) {
        placementMap.set(lastChapterId, epilogueContent.map(a => ({
          atom: a,
          position: 'closing' as const
        })));
      }
    }

    // Stage 3: Place contextual elements using AI analysis
    for (const atom of contextual) {
      try {
        const bestChapter = await this.findBestChapterForContent(atom, chapters, spec);
        if (bestChapter) {
          const position = await this.determineOptimalPosition(atom, bestChapter);
          
          if (!placementMap.has(bestChapter.id)) {
            placementMap.set(bestChapter.id, []);
          }
          placementMap.get(bestChapter.id)!.push({ atom, position });
        }
      } catch (error) {
        logger.error({ error, atomId: atom.id }, 'Failed to place preserved content, skipping');
      }
    }

    return placementMap;
  }

  /**
   * Find best chapter for content using AI analysis
   */
  private async findBestChapterForContent(
    atom: NarrativeAtom,
    chapters: Array<ChapterCluster & { title: string }>,
    spec: BiographySpec
  ): Promise<(ChapterCluster & { title: string }) | null> {
    const contentType = (atom.metadata as any)?.content_type as ContentType || 'standard';
    const content = atom.content;
    const atomDate = new Date(atom.timestamp);

    // Analyze content for themes, people, events
    let analysisResult: {
      timePeriod?: string;
      themes?: string[];
      peopleMentioned?: string[];
      eventsReferenced?: string[];
      narrativePurpose?: string;
      emotionalTone?: string;
      temporalPerspective?: string;
    } = {};

    try {
      const analysis = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [{
          role: 'system',
          content: `Analyze this ${contentType} to determine where it should appear in a biography.

Extract:
1. Time period it references (if any)
2. Themes it relates to
3. People/characters mentioned
4. Events or situations it addresses
5. Narrative purpose (introduction, reflection, guidance, etc.)
6. Emotional tone
7. Whether it's retrospective, present-moment, or forward-looking

Return JSON:
{
  "timePeriod": "description of when this applies",
  "themes": ["theme1", "theme2"],
  "peopleMentioned": ["name1", "name2"],
  "eventsReferenced": ["event description"],
  "narrativePurpose": "introduction|reflection|guidance|explanation|commitment",
  "emotionalTone": "reflective|urgent|contemplative|decisive",
  "temporalPerspective": "retrospective|present|forward-looking"
}`
        }, {
          role: 'user',
          content: `Content type: ${contentType}\nWritten: ${atomDate.toISOString()}\n\nContent:\n${content.substring(0, 2000)}`
        }],
        response_format: { type: 'json_object' }
      });

      const responseText = analysis.choices[0]?.message?.content || '{}';
      analysisResult = JSON.parse(responseText);
    } catch (error) {
      logger.debug({ error }, 'Failed to analyze content, using fallback');
      // Fallback: use temporal matching
    }

    // Score each chapter for relevance
    const chapterScores = chapters.map(chapter => {
      let score = 0;

      // Temporal relevance (content written during this chapter period)
      const chapterStart = new Date(chapter.timeSpan.start);
      const chapterEnd = new Date(chapter.timeSpan.end);
      if (atomDate >= chapterStart && atomDate <= chapterEnd) {
        score += 0.4; // High weight for temporal match
      }

      // Thematic relevance
      if (analysisResult.themes && analysisResult.themes.length > 0) {
        const sharedThemes = chapter.dominantThemes.filter(t => 
          analysisResult.themes!.some((at: string) => 
            t.toLowerCase().includes(at.toLowerCase()) || 
            at.toLowerCase().includes(t.toLowerCase())
          )
        );
        score += (sharedThemes.length / Math.max(chapter.dominantThemes.length, 1)) * 0.3;
      }

      // People relevance
      if (atom.peopleIds && atom.peopleIds.length > 0) {
        const hasSharedPeople = chapter.atoms.some(a => 
          a.peopleIds?.some(pid => atom.peopleIds!.includes(pid))
        );
        if (hasSharedPeople) {
          score += 0.2;
        }
      }

      // Significance match (important content in important chapters)
      if (chapter.significance > 0.7 && atom.significance > 0.7) {
        score += 0.1;
      }

      return { chapter, score };
    });

    // Return best match (score > 0.3 threshold)
    chapterScores.sort((a, b) => b.score - a.score);
    return chapterScores[0]?.score > 0.3 ? chapterScores[0].chapter : null;
  }

  /**
   * Determine optimal position within chapter
   */
  private async determineOptimalPosition(
    atom: NarrativeAtom,
    chapter: ChapterCluster & { title: string }
  ): Promise<'opening' | 'middle' | 'closing' | 'standalone'> {
    const contentType = (atom.metadata as any)?.content_type as ContentType || 'standard';
    
    // Content-type-specific rules
    const positionRules: Record<ContentType, 'opening' | 'middle' | 'closing' | 'standalone'> = {
      'testimony': 'opening', // Testimonies often explain "why" - good for chapter openings
      'advice': 'closing', // Advice often comes after experiences - good for chapter closings
      'message_to_reader': 'middle', // Messages can appear naturally in flow
      'manifesto': 'opening', // Manifestos declare intent - good for openings
      'vow': 'closing', // Vows often conclude periods - good for closings
      'promise': 'middle', // Promises can appear in context
      'declaration': 'opening', // Declarations set tone - good for openings
      'preface': 'opening',
      'dedication': 'opening',
      'acknowledgment': 'opening',
      'epilogue': 'closing',
      'standard': 'middle'
    };

    // Default based on content type
    const defaultPosition = positionRules[contentType] || 'middle';

    // Refine based on temporal position within chapter
    const atomDate = new Date(atom.timestamp);
    const chapterStart = new Date(chapter.timeSpan.start);
    const chapterEnd = new Date(chapter.timeSpan.end);
    const chapterDuration = chapterEnd.getTime() - chapterStart.getTime();
    
    if (chapterDuration > 0) {
      const atomPosition = (atomDate.getTime() - chapterStart.getTime()) / chapterDuration;
      
      // If atom is early in chapter timeline, prefer opening
      if (atomPosition < 0.2 && defaultPosition === 'middle') {
        return 'opening';
      }
      // If atom is late in chapter timeline, prefer closing
      if (atomPosition > 0.8 && defaultPosition === 'middle') {
        return 'closing';
      }
    }

    return defaultPosition;
  }
}

export const preservedContentPlacer = new PreservedContentPlacer();
