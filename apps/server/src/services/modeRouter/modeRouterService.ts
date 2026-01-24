/**
 * Mode Router Service
 * 
 * Routes every chat message to one of 5 distinct modes BEFORE any processing.
 * This ensures the system knows which mode it's in before responding.
 * 
 * Modes:
 * - EMOTIONAL_EXISTENTIAL: Thoughts, fears, insecurities (no memory check)
 * - MEMORY_RECALL: Factual questions ("what did I eat?", "when did X?")
 * - NARRATIVE_RECALL: Complex story questions ("what happened with X?")
 * - EXPERIENCE_INGESTION: Lived experiences with duration/context (party, night out, trip)
 * - ACTION_LOG: Atomic verb-forward moments ("I said X", "I walked away", "I froze")
 */

import { logger } from '../../logger';
import { openai } from '../openaiClient';

export type ChatMode =
  | 'EMOTIONAL_EXISTENTIAL'  // Mode 1: Thoughts, fears, insecurities
  | 'MEMORY_RECALL'          // Mode 2: Factual questions
  | 'NARRATIVE_RECALL'       // Mode 3: Complex stories
  | 'EXPERIENCE_INGESTION'   // Mode 4: Lived experiences (macro: duration, context, narrative arc)
  | 'ACTION_LOG'             // Mode 5: Atomic actions (micro: verb-forward, instant)
  | 'NEEDS_CLARIFICATION'    // Ambiguous milestone/achievement: ask what they mean before ingesting
  | 'MIXED'                  // Requires disambiguation
  | 'UNKNOWN';               // Can't determine - fall through to normal chat

export interface ModeRoutingResult {
  mode: ChatMode;
  confidence: number;
  reasoning: string;
  requiresDisambiguation?: boolean;
  suggestedQuestions?: string[];
}

class ModeRouterService {
  /**
   * Route message to correct mode BEFORE any processing
   * This is the gatekeeper - everything flows through here
   * 
   * Target: <100ms for pattern-based, <300ms with LLM
   */
  async routeMessage(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<ModeRoutingResult> {
    const startTime = Date.now();

    try {
      // Step 1: Quick pattern checks (fast, <50ms)
      const quickCheck = this.quickModeCheck(message);
      if (quickCheck.confidence > 0.8) {
        const elapsed = Date.now() - startTime;
        logger.debug({ mode: quickCheck.mode, confidence: quickCheck.confidence, elapsed }, 'Mode routed via pattern matching');
        return quickCheck;
      }

      // Step 2: LLM classification (if needed, <250ms)
      const llmCheck = await this.llmModeCheck(message, conversationHistory);
      
      // Step 3: Combine and decide
      const result = this.combineChecks(quickCheck, llmCheck);
      
      const elapsed = Date.now() - startTime;
      logger.debug({ mode: result.mode, confidence: result.confidence, elapsed }, 'Mode routed');

      return result;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to route message mode');
      return {
        mode: 'UNKNOWN',
        confidence: 0.3,
        reasoning: 'Routing failed, falling back to unknown',
      };
    }
  }

  /**
   * Fast pattern-based mode detection (<50ms)
   */
  private quickModeCheck(message: string): ModeRoutingResult {
    const text = message.toLowerCase().trim();
    const messageLength = message.length;

    // NEEDS_CLARIFICATION: Milestone/achievement-ish but ambiguous (app vs life, or vague).
    // Ask what they mean before ingesting. Run before greeting/meta so
    // "I got the chat working. Does it work?" gets clarify, not plain UNKNOWN.
    if (this.looksLikeAmbiguousMilestoneOrExperience(text, messageLength)) {
      return {
        mode: 'NEEDS_CLARIFICATION',
        confidence: 0.9,
        reasoning: 'Ambiguous milestone or achievement; ask for clarification before ingesting',
      };
    }

    // Greetings, meta-questions about the app, and small talk → UNKNOWN (normal chat)
    if (this.isGreetingOrMetaOrSmallTalk(text, messageLength)) {
      return {
        mode: 'UNKNOWN',
        confidence: 0.9,
        reasoning: 'Greeting, meta-question, or small talk; use normal chat',
      };
    }

    // ACTION_LOG: Verb-forward, instant, single moment (check before experience)
    if (this.looksLikeAction(message)) {
      return {
        mode: 'ACTION_LOG',
        confidence: 0.9,
        reasoning: 'Atomic action detected',
      };
    }

    // EXPERIENCE_INGESTION: Time range, multiple people, location, story arc
    if (this.looksLikeExperience(message)) {
      return {
        mode: 'EXPERIENCE_INGESTION',
        confidence: 0.85,
        reasoning: 'Time-bounded experience with context detected',
      };
    }

    // MEMORY_RECALL: Specific factual questions
    if (this.isFactualRecall(text)) {
      return {
        mode: 'MEMORY_RECALL',
        confidence: 0.9,
        reasoning: 'Factual recall query detected',
      };
    }

    // NARRATIVE_RECALL: Story questions
    if (this.isNarrativeRecall(text)) {
      return {
        mode: 'NARRATIVE_RECALL',
        confidence: 0.85,
        reasoning: 'Narrative/story recall query detected',
      };
    }

    // EMOTIONAL_EXISTENTIAL: Short, emotional, present-tense
    if (messageLength < 200 && this.isEmotionalExistential(text)) {
      return {
        mode: 'EMOTIONAL_EXISTENTIAL',
        confidence: 0.8,
        reasoning: 'Short emotional/existential thought detected',
      };
    }

    return {
      mode: 'UNKNOWN',
      confidence: 0.3,
      reasoning: 'Could not determine mode from patterns',
    };
  }

  /**
   * Check if message describes an Experience (container)
   * Has: time range, multiple people, location, story arc
   */
  private looksLikeExperience(message: string): boolean {
    const text = message.toLowerCase();
    const hasTimeRange = /(last night|yesterday|that weekend|when i was|during|while|for \d+)/i.test(message);
    const hasMultiplePeople = /(we|they|everyone|people|group|together)/i.test(message);
    const hasLocation = /(at|in|to|from) (the |a |an )?[a-z]+/i.test(message);
    const hasStoryArc = message.length > 200 && /(then|after|later|eventually|finally)/i.test(message);
    const hasDuration = /(hours?|minutes?|all day|all night|the whole)/i.test(message);
    
    return (hasTimeRange || hasDuration) && 
           (hasMultiplePeople || hasLocation || hasStoryArc);
  }

  /**
   * Check if message describes an Action (atomic)
   * Verb-forward, instant, no arc
   */
  private looksLikeAction(message: string): boolean {
    const text = message.toLowerCase();
    
    // Verb-forward patterns
    const verbPatterns = [
      /^i (said|told|asked|walked|left|froze|decided|felt|noticed|realized|thought|did|didn't|couldn't|wouldn't)/i,
      /^i (didn't|couldn't|wouldn't) (say|do|go|leave)/i,
      /^(she|he|they) (said|looked|laughed|left|did)/i,
    ];
    
    const isVerbForward = verbPatterns.some(pattern => pattern.test(message));
    const isShort = message.length < 150;
    const isInstant = !/(then|after|later|eventually|while|during)/i.test(message);
    const hasNoTimeRange = !/(last night|yesterday|that weekend|for \d+)/i.test(message);
    
    return isVerbForward && isShort && isInstant && hasNoTimeRange;
  }

  /**
   * Check if message is a factual recall query
   */
  private isFactualRecall(text: string): boolean {
    const factualPatterns = [
      /^(what|when|where|who) (did|was|were|is|are|do|does)/i,
      /^(do|does|did) (you|i) (remember|know|have|recall)/i,
      /^(tell me|show me) (what|when|where|who) (did|was|happened)/i,
      /^(what did i|what did you|when did i|when did you|where did i|where did you)/i,
      /^(do you remember|do i have|have i ever|did i ever)/i,
      /^(what did|when did|where did|who did) (i|you) (eat|do|go|see|hear)/i,
    ];
    
    return factualPatterns.some(p => p.test(text));
  }

  /**
   * Check if message is a narrative/story recall query
   */
  private isNarrativeRecall(text: string): boolean {
    const narrativePatterns = [
      /(what happened|tell me about|remember when|do you remember) (with|at|when|the)/i,
      /(story|narrative|account|version) (of|about|regarding)/i,
      /(multiple|different|other) (perspectives|versions|accounts|sides)/i,
      /(what was|how did) (the|that) (story|event|situation|thing) (go|happen|unfold)/i,
      /(tell me|what's) (the|that) (story|full story|whole story|backstory)/i,
    ];
    
    return narrativePatterns.some(p => p.test(text));
  }

  /**
   * Check if message is emotional/existential
   */
  private isEmotionalExistential(text: string): boolean {
    const emotionalPatterns = [
      /^(i feel|i'm feeling|i think|i wonder|i'm worried|i'm scared|i'm anxious)/i,
      /^(do you think|can i|will i|am i|should i)/i,
      /(not gonna|won't|can't) (make it|do it|handle it|survive)/i,
      /(i feel|i'm feeling) (behind|ahead|lost|stuck|trapped|overwhelmed)/i,
      /(i'm|i am) (not|never) (good|enough|smart|fast|successful|worthy)/i,
    ];
    
    return emotionalPatterns.some(p => p.test(text));
  }

  /**
   * Milestone/achievement-ish but ambiguous: could be about the app or a life event.
   * E.g. "I got the chat working. Does it work?" or "I finally got X working" (short).
   * Ask for clarification before ingesting. Excludes clear experiences (last night, we, long story).
   */
  private looksLikeAmbiguousMilestoneOrExperience(text: string, messageLength: number): boolean {
    const hasMilestonePhrase = /\b(got|got it|have) .+ (working|to work)\b|(i |so |and )?(just |finally |actually )?(got|have) .+ (working|to work)\b/i.test(text);
    if (!hasMilestonePhrase) return false;

    const hasMetaPhrase = /\b(does it work|is it working|is this working|can you hear me|are you there)\b/i.test(text);
    const hasStrongExperienceMarkers = /(last night|yesterday|that weekend|we |they |everyone|people |group |together )/i.test(text) || messageLength > 200;
    const isShort = messageLength < 150;

    return hasMetaPhrase || (isShort && !hasStrongExperienceMarkers);
  }

  /**
   * Greetings, thanks, meta-questions about the app/assistant, and short small talk.
   * These should be UNKNOWN so they get normal conversational responses.
   */
  private isGreetingOrMetaOrSmallTalk(text: string, messageLength: number): boolean {
    // Very short greetings and sign-offs
    const greetings = /^(hi|hey|hello|howdy|yo|sup|hey there|hi there|hello there|greetings?|good (morning|afternoon|evening)|gm|gn|bye|goodbye|thanks|thank you|thank u|thx|ty|ok|okay|k|cool|nice|great|awesome|sure|yep|nope|yes|no)\s*[!.?]*$/i;
    if (greetings.test(text)) return true;

    // Meta-questions about the app or assistant (as full message or as substring, e.g. "...Does it work?")
    const metaFull = /\b(does it work|is it working|is this working|can you hear me|are you there|are you (here|online|working)|is (this|the) (chat|app) working|(can|does) (the )?(chat|app|this) work|(is|does) (anything|something) (working|work))\s*[!.?]*$/i;
    if (metaFull.test(text)) return true;
    const metaSubstring = /\b(does it work|is it working|is this working|can you hear me|are you there)\b/i;
    if (metaSubstring.test(text)) return true;

    // "I got X working", "I finally got X" as meta/update about the app (short, no story arc)
    if (messageLength < 120 && /\b(i )?(just |finally |actually )?(got|got it|have) .* (working|to work|working today)\s*[!.?]*$/i.test(text)) return true;

    // Frustrated meta: "all you (keep )?saying is X", "you only say X", "it (only |just )?(keeps? )?says? X"
    if (/\b(all you (keep )?saying is|you only say|you keep saying|it (only |just )?(keeps? )?says?)\s/i.test(text)) return true;

    return false;
  }

  /**
   * LLM-based mode detection (for ambiguous cases)
   */
  private async llmModeCheck(
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<ModeRoutingResult> {
    const prompt = `Classify this message into ONE mode:

Message: "${message}"

Modes:
1. UNKNOWN - Use for: greetings ("hi", "hello", "hey"), thanks ("thanks", "thank you"), meta-questions about the app or you ("Does it work?", "Is this working?", "Can you hear me?", "Are you there?"), and general small talk or conversation that does NOT clearly fit 2-5. These get a normal conversational reply.
2. EMOTIONAL_EXISTENTIAL - Thoughts, fears, insecurities, existential questions. Short, present-tense, clearly emotional. Example: "I feel behind", "Do you think I can get this job?" NOT for: greetings, or frustration about the app ("it's not working", "you only say X").
3. MEMORY_RECALL - Specific factual questions: "What did I eat?", "When did X happen?", "Do you remember Y?"
4. NARRATIVE_RECALL - Complex story questions: "What happened with X?", "Tell me about Y", "What's the story behind Z?"
5. EXPERIENCE_INGESTION - User describing a time-bounded experience (party, night out, trip, event with duration, multiple people, location, story arc). Example: "Last night I went to a show, met these people, things got weird..." NOT: "I got the chat working" or short updates.
6. ACTION_LOG - ONLY when the user is clearly logging a single, past-tense, verb-forward moment: "I said X", "I walked away", "I froze". NOT: greetings, "Does it work?", "I got X working", questions, or general updates.

Key rules:
- When in doubt between ACTION_LOG/EXPERIENCE and UNKNOWN, choose UNKNOWN.
- Greetings, thanks, and meta-questions about the app are always UNKNOWN.
- Action = strict "I [verb]ed" / "I [verb]ed X" instant moment, no arc.

Respond with JSON:
{
  "mode": "MODE_NAME",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 150,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Validate mode
      const validModes: ChatMode[] = ['EMOTIONAL_EXISTENTIAL', 'MEMORY_RECALL', 'NARRATIVE_RECALL', 'EXPERIENCE_INGESTION', 'ACTION_LOG', 'NEEDS_CLARIFICATION', 'MIXED', 'UNKNOWN'];
      const mode = validModes.includes(result.mode) ? result.mode : 'UNKNOWN';
      
      return {
        mode: mode as ChatMode,
        confidence: result.confidence || 0.5,
        reasoning: result.reasoning || 'LLM classification',
      };
    } catch (error) {
      logger.warn({ err: error }, 'LLM mode check failed');
      return {
        mode: 'UNKNOWN',
        confidence: 0.3,
        reasoning: 'LLM classification failed',
      };
    }
  }

  /**
   * Combine quick check and LLM check results
   */
  private combineChecks(
    quick: ModeRoutingResult,
    llm: ModeRoutingResult
  ): ModeRoutingResult {
    // Quick check said UNKNOWN with high confidence (greeting/meta/small talk) → use it
    // so we don't let the LLM override to ACTION_LOG or EXPERIENCE for "hi", "Does it work?", etc.
    if (quick.mode === 'UNKNOWN' && quick.confidence >= 0.8) {
      return quick;
    }

    // If both agree, high confidence
    if (quick.mode === llm.mode && quick.mode !== 'UNKNOWN') {
      return {
        mode: quick.mode,
        confidence: Math.min(0.95, (quick.confidence + llm.confidence) / 2),
        reasoning: `Both checks agree: ${quick.reasoning}`,
      };
    }

    // If they disagree, use higher confidence
    if (quick.confidence > llm.confidence) {
      return quick;
    }

    // When quick is UNKNOWN (low) and LLM says ACTION_LOG or EXPERIENCE with only moderate confidence,
    // prefer UNKNOWN so borderline cases get normal chat
    if (quick.mode === 'UNKNOWN' && (llm.mode === 'ACTION_LOG' || llm.mode === 'EXPERIENCE_INGESTION') && llm.confidence < 0.75) {
      return { ...quick, confidence: 0.6, reasoning: 'Overriding LLM ACTION_LOG/EXPERIENCE when confidence < 0.75; use normal chat' };
    }

    // If LLM is higher but still low, might be mixed
    if (llm.confidence < 0.6 && quick.mode !== 'UNKNOWN') {
      return {
        mode: 'MIXED',
        confidence: 0.5,
        reasoning: 'Conflicting signals detected',
        requiresDisambiguation: true,
        suggestedQuestions: [
          'Are you asking me to remember something, sharing a thought, or telling me about something that happened?',
        ],
      };
    }

    return llm;
  }
}

export const modeRouterService = new ModeRouterService();
