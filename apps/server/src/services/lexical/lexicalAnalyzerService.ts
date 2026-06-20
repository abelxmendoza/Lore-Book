/**
 * Lexical Analyzer Service — orchestrates the pre-ontology signal extraction pipeline.
 *
 * User Message → Lexical Analyzer → Entity Extraction → Ontology Mapping
 * → Memory/Cognition Mutation (via review queue) → Narrative/Lore Compiler
 */
import { logger } from '../../logger';
import { normalizeLexicalText } from './lexicalNormalizer';
import { mapGlossaryMatches } from './lexicalGlossaryMapper';
import { extractLexicalEntities } from './lexicalEntityExtractor';
import { detectLexicalIntents } from './lexicalIntentDetector';
import { detectLexicalEmotions } from './lexicalEmotionDetector';
import { detectLexicalRelationships } from './lexicalRelationshipDetector';
import { detectLexicalSkills } from './lexicalSkillDetector';
import { detectLexicalPlaces } from './lexicalPlaceDetector';
import { detectLexicalEvents } from './lexicalEventDetector';
import { scoreLexicalConfidence } from './lexicalConfidenceScorer';
import { buildMemoryCandidates, buildOntologyCandidates } from './lexicalCandidateBuilder';
import { enrichMessyContextLexical } from './messyContextLexical';
import { enrichTravelContextLexical } from './travelContextLexical';
import { discoverEntityLinks, groupInputsByRelationshipScope } from '../ontology/relationshipDiscovery';
import type { AnalyzeMessageInput, LexicalAnalysisResult } from './lexicalTypes';

class LexicalAnalyzerService {
  /**
   * Lightweight extraction for composer preview / intelligence — entities + context enrichers only.
   * Skips ontology, memory, glossary, entity-link discovery, and full confidence scoring.
   */
  analyzeMessageLite(input: AnalyzeMessageInput): Pick<
    LexicalAnalysisResult,
    'entities' | 'ambiguityFlags' | 'needsClarification' | 'normalizedText' | 'rawText'
  > & {
    messageId: string;
    userId: string;
    threadId?: string;
    createdAt: string;
  } {
    const { userId, messageId, text, threadId, timestamp } = input;
    const normalizedText = normalizeLexicalText(text);

    let entities = extractLexicalEntities(text);
    let places = detectLexicalPlaces(text);
    let events = detectLexicalEvents(text);
    let skills = detectLexicalSkills(text);

    const messy = enrichMessyContextLexical(text, {
      entities,
      places,
      events,
      emotions: [],
      skills,
      relationships: [],
    });
    entities = messy.entities;
    places = messy.places;
    events = messy.events;
    skills = messy.skills;

    const travel = enrichTravelContextLexical(text, { entities, places, events, skills });
    entities = travel.entities;

    const ambiguityFlags = [...new Set([...messy.ambiguityFlags, ...travel.ambiguityFlags])];
    const needsClarification = messy.ambiguityFlags.some((f) =>
      /fight_grammar|celebrity_name|homie_unnamed|july_needs|venue_category/.test(f)
    );

    return {
      messageId,
      userId,
      threadId,
      rawText: text,
      normalizedText,
      entities,
      ambiguityFlags,
      needsClarification,
      createdAt: timestamp ?? new Date().toISOString(),
    };
  }

  analyzeMessage(input: AnalyzeMessageInput): LexicalAnalysisResult {
    const { userId, messageId, text, threadId, timestamp } = input;
    const normalizedText = normalizeLexicalText(text);

    let entities = extractLexicalEntities(text);
    const intents = detectLexicalIntents(text);
    let emotions = detectLexicalEmotions(text);
    const relationships = detectLexicalRelationships(text);
    let skills = detectLexicalSkills(text);
    let places = detectLexicalPlaces(text);
    let events = detectLexicalEvents(text);
    const glossaryMatches = mapGlossaryMatches(text);

    const messy = enrichMessyContextLexical(text, {
      entities,
      places,
      events,
      emotions,
      skills,
      relationships,
    });
    entities = messy.entities;
    places = messy.places;
    events = messy.events;
    emotions = messy.emotions;
    skills = messy.skills;

    const travel = enrichTravelContextLexical(text, { entities, places, events, skills });
    entities = travel.entities;
    places = travel.places;
    events = travel.events;
    skills = travel.skills;

    const ontologyCandidates = buildOntologyCandidates(entities, skills, relationships, events, glossaryMatches);
    const memoryCandidates = buildMemoryCandidates(skills, emotions, relationships, events, entities);

    const entityLinks = discoverEntityLinks(text, entities, relationships);
    const relationshipGroups = groupInputsByRelationshipScope(text, entityLinks, entities, relationships);

    const scoring = scoreLexicalConfidence({
      messageId,
      userId,
      threadId,
      rawText: text,
      normalizedText,
      entities,
      intents,
      emotions,
      relationships,
      skills,
      places,
      events,
      ontologyCandidates,
      memoryCandidates,
      glossaryMatches,
      createdAt: timestamp ?? new Date().toISOString(),
    });

    const ambiguityFlags = [...new Set([...scoring.ambiguityFlags, ...messy.ambiguityFlags, ...travel.ambiguityFlags])];
    const needsClarification =
      scoring.needsClarification ||
      messy.ambiguityFlags.some((f) =>
        /fight_grammar|celebrity_name|homie_unnamed|july_needs|venue_category/.test(f)
      );

    return {
      messageId,
      userId,
      threadId,
      rawText: text,
      normalizedText,
      entities,
      intents,
      emotions,
      relationships,
      skills,
      places,
      events,
      ontologyCandidates,
      memoryCandidates,
      glossaryMatches,
      entityLinks,
      relationshipGroups,
      confidence: scoring.confidence,
      ambiguityFlags,
      needsClarification,
      createdAt: timestamp ?? new Date().toISOString(),
    };
  }

  /**
   * @deprecated Use runLoreInterpretationPipeline from pipeline/loreInterpretationPipeline.
   */
  async analyzeAndIntegrate(input: AnalyzeMessageInput): Promise<LexicalAnalysisResult> {
    const { runLoreInterpretationPipeline } = await import('../pipeline/loreInterpretationPipeline');
    const { lexical } = await runLoreInterpretationPipeline(input);
    return lexical;
  }
}

export const lexicalAnalyzerService = new LexicalAnalyzerService();
