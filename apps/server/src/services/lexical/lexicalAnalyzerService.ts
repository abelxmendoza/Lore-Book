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
import { discoverEntityLinks, groupInputsByRelationshipScope } from '../ontology/relationshipDiscovery';
import type { AnalyzeMessageInput, LexicalAnalysisResult } from './lexicalTypes';

class LexicalAnalyzerService {
  analyzeMessage(input: AnalyzeMessageInput): LexicalAnalysisResult {
    const { userId, messageId, text, threadId, timestamp } = input;
    const normalizedText = normalizeLexicalText(text);

    const entities = extractLexicalEntities(text);
    const intents = detectLexicalIntents(text);
    const emotions = detectLexicalEmotions(text);
    const relationships = detectLexicalRelationships(text);
    const skills = detectLexicalSkills(text);
    const places = detectLexicalPlaces(text);
    const events = detectLexicalEvents(text);
    const glossaryMatches = mapGlossaryMatches(text);

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
      ambiguityFlags: scoring.ambiguityFlags,
      needsClarification: scoring.needsClarification,
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
