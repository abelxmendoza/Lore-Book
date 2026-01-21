import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';

import type {
  LearningRecord,
  LearningType,
  LearningSource,
  ProficiencyLevel,
} from './types';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * Learning Extraction Service
 * Extracts learning records (skills, knowledge, concepts) from journal entries
 */
export class LearningExtractor {
  // Learning indicator patterns (rule-based, FREE)
  private readonly learningPatterns = {
    skill: [
      /\b(i learned|i'm learning|learning to|learned how to|mastered|practicing|practiced)\b/gi,
      /\b(skill|skills|ability|abilities|can now|able to|know how to)\b/gi,
      /\b(training|trained|studying|studied|practicing|practiced)\b/gi,
    ],
    knowledge: [
      /\b(i know|i learned|i understand|knowledge|learned about|found out|discovered)\b/gi,
      /\b(fact|facts|information|learned that|now i know|i now understand)\b/gi,
      /\b(understanding|comprehension|grasped|realized|aware of)\b/gi,
    ],
    concept: [
      /\b(concept|concepts|idea|ideas|principle|principles|theory|theories)\b/gi,
      /\b(understanding of|grasp of|familiar with|aware of|know about)\b/gi,
      /\b(learned the|understood the|grasped the|concept of)\b/gi,
    ],
    technique: [
      /\b(technique|techniques|method|methods|approach|approaches|way to|how to)\b/gi,
      /\b(learned the|mastered the|practicing the|using the|applying the)\b/gi,
      /\b(strategy|strategies|tactic|tactics|process|processes)\b/gi,
    ],
    tool: [
      /\b(tool|tools|software|app|application|platform|framework|library)\b/gi,
      /\b(using|learned to use|mastered|working with|familiar with)\b/gi,
      /\b(program|programs|system|systems|technology|technologies)\b/gi,
    ],
    language: [
      /\b(language|languages|speaking|learning|studying|practicing)\b/gi,
      /\b(fluent|conversational|beginner|intermediate|advanced)\b/gi,
      /\b(grammar|vocabulary|pronunciation|comprehension)\b/gi,
    ],
    framework: [
      /\b(framework|frameworks|library|libraries|platform|platforms)\b/gi,
      /\b(using|working with|learned|mastered|familiar with)\b/gi,
      /\b(react|vue|angular|django|rails|spring|express|next)\b/gi,
    ],
    methodology: [
      /\b(methodology|methodologies|process|processes|approach|approaches)\b/gi,
      /\b(agile|scrum|kanban|waterfall|lean|design thinking)\b/gi,
      /\b(learned|using|applying|practicing|mastered)\b/gi,
    ],
  };

  // Proficiency indicators
  private readonly proficiencyIndicators = {
    beginner: [
      /\b(beginner|starting|just started|new to|learning|first time|never done)\b/gi,
      /\b(basic|basics|introduction|introductory|getting started)\b/gi,
    ],
    intermediate: [
      /\b(intermediate|comfortable|familiar|decent|getting better|improving)\b/gi,
      /\b(used to|have experience|some experience|moderate|average)\b/gi,
    ],
    advanced: [
      /\b(advanced|proficient|skilled|experienced|expert|master|excellent)\b/gi,
      /\b(very good|really good|strong|deep understanding|well-versed)\b/gi,
    ],
    expert: [
      /\b(expert|master|mastery|exceptional|world-class|top-tier|elite)\b/gi,
      /\b(teaching|mentoring|leading|authority|specialist|guru)\b/gi,
    ],
  };

  /**
   * Extract learning from content
   */
  async extractLearning(
    content: string,
    source: LearningSource,
    sourceId: string,
    sourceDate: string
  ): Promise<LearningRecord[]> {
    const learning: LearningRecord[] = [];

    // First, try rule-based extraction (FREE)
    const ruleBasedLearning = this.extractRuleBased(content, source, sourceId, sourceDate);
    learning.push(...ruleBasedLearning);

    // If rule-based found something, use it
    if (ruleBasedLearning.length > 0) {
      logger.debug(
        { count: ruleBasedLearning.length, source },
        'Extracted learning using rule-based patterns'
      );
      return learning;
    }

    // If rule-based found nothing and content is substantial, try LLM
    if (content.length > 200) {
      try {
        const llmLearning = await this.extractLLM(content, source, sourceId, sourceDate);
        learning.push(...llmLearning);
        logger.debug(
          { count: llmLearning.length, source },
          'Extracted learning using LLM'
        );
      } catch (error) {
        logger.warn({ error, source }, 'Failed to extract learning using LLM');
      }
    }

    return learning;
  }

  /**
   * Rule-based learning extraction (FREE, no API calls)
   */
  private extractRuleBased(
    content: string,
    source: LearningSource,
    sourceId: string,
    sourceDate: string
  ): LearningRecord[] {
    const learning: LearningRecord[] = [];
    const lowerContent = content.toLowerCase();

    // Check each learning type
    for (const [type, patterns] of Object.entries(this.learningPatterns)) {
      for (const pattern of patterns) {
        const matches = Array.from(lowerContent.matchAll(pattern));
        if (matches.length > 0) {
          // Extract the learning statement
          const learningText = this.extractLearningText(content, matches[0].index || 0);
          
          if (learningText && learningText.length > 10) {
            const name = this.extractName(learningText, type as LearningType);
            const proficiency = this.detectProficiency(learningText);
            const confidence = this.calculateConfidence(learningText, type as LearningType);
            
            if (confidence > 0.4 && name) {
              learning.push({
                id: '', // Will be set by storage service
                user_id: '', // Will be set by storage service
                type: type as LearningType,
                name,
                description: learningText,
                proficiency,
                confidence,
                source,
                source_id: sourceId,
                source_date: sourceDate,
                tags: [],
                related_experiences: [],
                related_projects: [],
                first_mentioned: sourceDate,
                last_mentioned: sourceDate,
                progress_timeline: [],
                practice_count: 1,
                mastery_indicators: [],
                metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    return learning;
  }

  /**
   * Extract learning text from content around a match
   */
  private extractLearningText(content: string, matchIndex: number): string {
    // Extract sentence containing the match
    const sentenceEnd = /[.!?]\s+/g;
    const sentences: { start: number; end: number; text: string }[] = [];
    
    let lastIndex = 0;
    let match;
    while ((match = sentenceEnd.exec(content)) !== null) {
      sentences.push({
        start: lastIndex,
        end: match.index + match[0].length,
        text: content.substring(lastIndex, match.index + match[0].length).trim(),
      });
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < content.length) {
      sentences.push({
        start: lastIndex,
        end: content.length,
        text: content.substring(lastIndex).trim(),
      });
    }

    const containingSentence = sentences.find(
      s => matchIndex >= s.start && matchIndex < s.end
    );

    return containingSentence?.text || content.substring(Math.max(0, matchIndex - 50), Math.min(content.length, matchIndex + 100)).trim();
  }

  /**
   * Extract name of the learning (skill/knowledge/concept name)
   */
  private extractName(text: string, type: LearningType): string {
    // Limit input length to prevent ReDoS attacks
    if (text.length > 1000) {
      text = text.substring(0, 1000);
    }
    
    // Try to extract the name after learning indicators
    // Using more specific patterns with word boundaries to prevent ReDoS
    const patterns = [
      // Pattern 1: "learned React" or "learning TypeScript"
      /\b(?:learned|learning|mastered|practicing|using|working with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})/,
      // Pattern 2: "skill of JavaScript" or "tool called Docker"
      /\b(?:skill|knowledge|concept|technique|tool|language|framework|methodology)\s+(?:of|in|called|named)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})/,
      // Pattern 3: "React skill" or "TypeScript framework"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\s+(?:skill|knowledge|concept|technique|tool|language|framework)\b/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Fallback: use first capitalized words
    const words = text.split(/\s+/);
    const capitalized = words.filter(w => /^[A-Z]/.test(w));
    if (capitalized.length > 0) {
      return capitalized.slice(0, 3).join(' ');
    }

    // Last resort: use type + first few words
    return `${type} from entry`;
  }

  /**
   * Detect proficiency level from text
   */
  private detectProficiency(text: string): ProficiencyLevel {
    const lower = text.toLowerCase();

    // Check for expert indicators first (most specific)
    for (const indicator of this.proficiencyIndicators.expert) {
      if (indicator.test(lower)) return 'expert';
    }

    // Check for advanced
    for (const indicator of this.proficiencyIndicators.advanced) {
      if (indicator.test(lower)) return 'advanced';
    }

    // Check for intermediate
    for (const indicator of this.proficiencyIndicators.intermediate) {
      if (indicator.test(lower)) return 'intermediate';
    }

    // Check for beginner
    for (const indicator of this.proficiencyIndicators.beginner) {
      if (indicator.test(lower)) return 'beginner';
    }

    // Default to beginner if no indicators found
    return 'beginner';
  }

  /**
   * Calculate confidence score for learning record
   */
  private calculateConfidence(text: string, type: LearningType): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence for longer, more specific statements
    if (text.length > 30) confidence += 0.1;
    if (text.length > 60) confidence += 0.1;

    // Boost for specific learning indicators
    const highConfidencePhrases = [
      'i learned',
      'i\'m learning',
      'mastered',
      'practicing',
      'skill',
      'knowledge',
    ];

    const lowerText = text.toLowerCase();
    for (const phrase of highConfidencePhrases) {
      if (lowerText.includes(phrase)) {
        confidence += 0.1;
        break;
      }
    }

    // Reduce confidence for questions
    if (text.includes('?')) confidence -= 0.1;

    // Reduce confidence for very short statements
    if (text.length < 20) confidence -= 0.2;

    return Math.max(0.3, Math.min(0.9, confidence));
  }

  /**
   * LLM-based learning extraction (fallback for complex cases)
   */
  private async extractLLM(
    content: string,
    source: LearningSource,
    sourceId: string,
    sourceDate: string
  ): Promise<LearningRecord[]> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a learning extraction system. Analyze the following journal entry and extract any skills, knowledge, concepts, techniques, tools, languages, frameworks, or methodologies that were learned or mentioned.

Return a JSON object with a "learning" array. Each learning object should have:
- type: one of "skill", "knowledge", "concept", "technique", "tool", "language", "framework", "methodology"
- name: the name of the skill/knowledge/concept (concise, 1-3 words)
- description: what was learned (1-2 sentences)
- proficiency: one of "beginner", "intermediate", "advanced", "expert"
- confidence: 0.0-1.0 confidence score

Only extract learning that is:
1. Explicitly mentioned or clearly implied
2. A specific skill, knowledge, or concept (not just general activities)
3. Something that can be tracked over time

If no learning is found, return {"learning": []}.`,
          },
          {
            role: 'user',
            content: content.substring(0, 3000),
          },
        ],
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const learningArray = response.learning || [];

      return learningArray.map((l: any) => ({
        id: '',
        user_id: '',
        type: l.type || 'knowledge',
        name: l.name || 'Unknown',
        description: l.description || '',
        proficiency: l.proficiency || 'beginner',
        confidence: l.confidence || 0.6,
        source,
        source_id: sourceId,
        source_date: sourceDate,
        tags: [],
        related_experiences: [],
        related_projects: [],
        first_mentioned: sourceDate,
        last_mentioned: sourceDate,
        progress_timeline: [],
        practice_count: 1,
        mastery_indicators: [],
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to extract learning using LLM');
      return [];
    }
  }
}

