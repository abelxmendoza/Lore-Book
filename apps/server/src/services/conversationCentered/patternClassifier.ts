// =====================================================
// PATTERN CLASSIFIER
// Purpose: Classify messages into simple/common/complex for routing
// Expected Impact: Better routing, reduced LLM calls
// =====================================================

import { logger } from '../../logger';
import type { ExtractedUnitType } from '../../types/conversationCentered';

export type MessageComplexity = 'simple' | 'common' | 'complex';
export type MessageCategory = 'experience' | 'feeling' | 'thought' | 'perception' | 'decision' | 'correction' | 'mixed' | 'unknown';

export type PatternClassification = {
  complexity: MessageComplexity;
  category: MessageCategory;
  confidence: number;
  suggestedExtractor: 'rule-based' | 'lightweight' | 'llm';
};

/**
 * Classifies messages by complexity and category for routing
 */
export class PatternClassifier {
  /**
   * Classify message complexity and category
   */
  classifyMessage(text: string): PatternClassification {
    const lowerText = text.toLowerCase();
    const textLength = text.length;
    const wordCount = text.split(/\s+/).length;

    // Determine category
    const category = this.determineCategory(text, lowerText);

    // Determine complexity
    const complexity = this.determineComplexity(text, lowerText, textLength, wordCount);

    // Determine suggested extractor
    const suggestedExtractor = this.suggestExtractor(complexity, category);

    // Calculate confidence
    const confidence = this.calculateConfidence(complexity, category, textLength, wordCount);

    return {
      complexity,
      category,
      confidence,
      suggestedExtractor,
    };
  }

  /**
   * Determine message category
   */
  private determineCategory(text: string, lowerText: string): MessageCategory {
    // Check for multiple categories
    const categories: MessageCategory[] = [];

    // Experience indicators
    if (
      /\b(i|we|they|he|she)\s+(went|did|met|saw|visited|attended|completed|finished|started|began|achieved|accomplished|had|got|received|gave|took|made|created|built|wrote|read|watched|listened|played|worked|studied|learned|taught|helped|solved|fixed|broke|lost|found|bought|sold|moved|traveled|arrived|left|returned|joined|quit|ended)\b/.test(
        text
      )
    ) {
      categories.push('experience');
    }

    // Feeling indicators
    if (
      /\b(i|i'm|i am|i feel|feeling|felt|feels)\s+(happy|sad|angry|excited|nervous|anxious|worried|scared|afraid|confident|proud|ashamed|embarrassed|disappointed|frustrated|grateful|thankful|relieved|stressed|overwhelmed|calm|peaceful|content|satisfied|lonely|connected|loved|hated|jealous|envious|guilty|hopeful|hopeless|optimistic|pessimistic|depressed|elated|ecstatic|miserable|terrible|awful|great|wonderful|fantastic|amazing|tired|exhausted|energetic|motivated|inspired|creative|productive)\b/.test(
        text
      )
    ) {
      categories.push('feeling');
    }

    // Thought indicators
    if (
      /\b(i|i'm|i am|i think|thinking|thought|thoughts|i believe|i realize|realized|i understand|understanding|i see|i notice|noticed|i wonder|wondering|i guess|guessing|i suppose|supposing|i imagine|imagining|i consider|considering|i reflect|reflecting|reflection|insight|insights|perspective|perspectives|it seems|it appears|it looks like|it sounds like|it feels like|i figure|i reckon|i assume|i presume|i suspect|i doubt|i question|i'm wondering|i'm curious|i'm intrigued|i'm puzzled|i'm confused|i'm aware|i'm conscious|i'm mindful|i'm attentive|i'm observant|i'm perceptive|i'm insightful|i'm intuitive|i'm analytical|i'm logical|i'm rational|i'm reasonable|i'm sensible|i'm thoughtful|i'm considerate|i'm contemplative|i'm meditative|i'm reflective|i'm introspective)\b/.test(
        text
      )
    ) {
      categories.push('thought');
    }

    // Perception indicators
    if (
      /\b(i heard|i was told|someone said|they said|people say|rumor|rumors|gossip|i believe|i assume|assuming|i suspect|suspected|i guess|i imagine|supposedly|apparently|allegedly|reportedly|according to|based on|from what i|from what|word is|the word|scuttlebutt|hearsay|secondhand|thirdhand|indirect|firsthand|eyewitness|testimony|evidence|proof|indication|sign|signal|clue|hint|tip|lead|suggestion|implication|inference|deduction|conclusion|assumption|presumption|supposition|hypothesis|theory|speculation|conjecture|guess|estimate|approximation|rough idea|ballpark)\b/.test(
        text
      )
    ) {
      categories.push('perception');
    }

    // Decision indicators
    if (
      /\b(i|i'm|i am|i will|i'll|i'm going to|i'm gonna|i decided|decided|decision|decisions|i choose|chose|choosing|choice|choices|i plan|planning|plans|i intend|intending|intention|intentions|i commit|committing|commitment|commitments|i promise|promising|promise|promises|i'm planning to|i'm planning on|i'm about to|i'm ready to|i'm prepared to|i'm set to|i'm scheduled to|going to|gonna|will|shall|must|have to|need to|want to|plan to|intend to|aim to|try to|attempt to|strive to|seek to|endeavor to|work to|struggle to|fight to|face to|meet to|encounter to|experience to|endure to|suffer to|bear to|accept to|get to|obtain to|acquire to|gain to|earn to|win to|achieve to|accomplish to|complete to|finish to|end to|conclude to|terminate to|stop to|pause to|resume to|continue to|proceed to|go to|move to|advance to|progress to|develop to|evolve to|transform to|change to|modify to|adjust to|adapt to)\b/.test(
        text
      )
    ) {
      categories.push('decision');
    }

    // Correction indicators
    if (
      /\b(actually|wait|no|never mind|scratch that|ignore that|forget that|i was wrong|i made a mistake|correction|corrected|i meant|i mean|let me rephrase|let me correct|i take that back|retract|retraction|i need to correct|i should correct|i want to correct|i have to correct|i must correct|i'll correct|i'm correcting|i've corrected|i corrected|i'm going to correct|i'm about to correct|i'm ready to correct|i'm prepared to correct|i'm set to correct)\b/.test(
        text
      )
    ) {
      categories.push('correction');
    }

    if (categories.length === 0) {
      return 'unknown';
    }
    if (categories.length === 1) {
      return categories[0];
    }
    return 'mixed';
  }

  /**
   * Determine message complexity
   */
  private determineComplexity(
    text: string,
    lowerText: string,
    textLength: number,
    wordCount: number
  ): MessageComplexity {
    // Simple: short, clear patterns, single category
    const isSimple =
      textLength < 100 &&
      wordCount < 20 &&
      !lowerText.includes('however') &&
      !lowerText.includes('although') &&
      !lowerText.includes('despite') &&
      !lowerText.includes('because') &&
      !lowerText.includes('therefore') &&
      !lowerText.includes('consequently') &&
      !lowerText.includes('furthermore') &&
      !lowerText.includes('moreover') &&
      !lowerText.includes('nevertheless') &&
      !lowerText.includes('nonetheless') &&
      !lowerText.includes('meanwhile') &&
      !lowerText.includes('subsequently') &&
      !lowerText.includes('previously') &&
      !lowerText.includes('initially') &&
      !lowerText.includes('eventually') &&
      !lowerText.includes('finally') &&
      !lowerText.includes('ultimately') &&
      !lowerText.includes('specifically') &&
      !lowerText.includes('particularly') &&
      !lowerText.includes('especially') &&
      !lowerText.includes('specifically') &&
      !lowerText.includes('generally') &&
      !lowerText.includes('typically') &&
      !lowerText.includes('usually') &&
      !lowerText.includes('normally') &&
      !lowerText.includes('commonly') &&
      !lowerText.includes('frequently') &&
      !lowerText.includes('occasionally') &&
      !lowerText.includes('rarely') &&
      !lowerText.includes('seldom') &&
      !lowerText.includes('hardly') &&
      !lowerText.includes('scarcely') &&
      !lowerText.includes('barely') &&
      !lowerText.includes('almost') &&
      !lowerText.includes('nearly') &&
      !lowerText.includes('quite') &&
      !lowerText.includes('rather') &&
      !lowerText.includes('fairly') &&
      !lowerText.includes('pretty') &&
      !lowerText.includes('very') &&
      !lowerText.includes('extremely') &&
      !lowerText.includes('incredibly') &&
      !lowerText.includes('really') &&
      !lowerText.includes('truly') &&
      !lowerText.includes('genuinely') &&
      !lowerText.includes('absolutely') &&
      !lowerText.includes('completely') &&
      !lowerText.includes('totally') &&
      !lowerText.includes('entirely') &&
      !lowerText.includes('fully') &&
      !lowerText.includes('partially') &&
      !lowerText.includes('partly') &&
      !lowerText.includes('mostly') &&
      !lowerText.includes('mainly') &&
      !lowerText.includes('primarily') &&
      !lowerText.includes('chiefly') &&
      !lowerText.includes('largely') &&
      !lowerText.includes('mostly') &&
      !lowerText.includes('mainly') &&
      !lowerText.includes('primarily') &&
      !lowerText.includes('chiefly') &&
      !lowerText.includes('largely') &&
      text.split(/[.!?]/).length <= 2;

    if (isSimple) {
      return 'simple';
    }

    // Complex: long, multiple clauses, complex grammar, multiple topics
    const isComplex =
      textLength > 300 ||
      wordCount > 50 ||
      text.split(/[.!?]/).length > 3 ||
      (lowerText.includes('however') ||
        lowerText.includes('although') ||
        lowerText.includes('despite') ||
        lowerText.includes('because') ||
        lowerText.includes('therefore') ||
        lowerText.includes('consequently') ||
        lowerText.includes('furthermore') ||
        lowerText.includes('moreover') ||
        lowerText.includes('nevertheless') ||
        lowerText.includes('nonetheless') ||
        lowerText.includes('meanwhile') ||
        lowerText.includes('subsequently') ||
        lowerText.includes('previously') ||
        lowerText.includes('initially') ||
        lowerText.includes('eventually') ||
        lowerText.includes('finally') ||
        lowerText.includes('ultimately') ||
        lowerText.includes('specifically') ||
        lowerText.includes('particularly') ||
        lowerText.includes('especially')) ||
      text.split(/\sand\s|\sor\s|\sbut\s/).length > 3;

    if (isComplex) {
      return 'complex';
    }

    // Common: everything else
    return 'common';
  }

  /**
   * Suggest extractor based on complexity and category
   */
  private suggestExtractor(
    complexity: MessageComplexity,
    category: MessageCategory
  ): 'rule-based' | 'lightweight' | 'llm' {
    if (complexity === 'simple') {
      return 'rule-based';
    }
    if (complexity === 'common' && category !== 'unknown' && category !== 'mixed') {
      // Could use lightweight model here in the future
      return 'rule-based';
    }
    return 'llm';
  }

  /**
   * Calculate classification confidence
   */
  private calculateConfidence(
    complexity: MessageComplexity,
    category: MessageCategory,
    textLength: number,
    wordCount: number
  ): number {
    let confidence = 0.7; // Base confidence

    // Boost confidence for simple messages
    if (complexity === 'simple') {
      confidence += 0.15;
    }

    // Boost confidence for clear categories
    if (category !== 'unknown' && category !== 'mixed') {
      confidence += 0.1;
    }

    // Reduce confidence for very short or very long messages
    if (textLength < 10 || textLength > 1000) {
      confidence -= 0.1;
    }

    // Boost confidence for medium-length messages
    if (textLength >= 50 && textLength <= 200) {
      confidence += 0.05;
    }

    return Math.min(Math.max(confidence, 0.3), 0.95);
  }

  /**
   * Batch classify messages
   */
  classifyBatch(texts: string[]): PatternClassification[] {
    return texts.map(text => this.classifyMessage(text));
  }
}

export const patternClassifier = new PatternClassifier();
