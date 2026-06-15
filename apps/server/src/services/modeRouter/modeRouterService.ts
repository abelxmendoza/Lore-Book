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
import { matchesFoundationRecallQuery } from '../chat/recallIntentPatterns';
import { classifyQuestionIntent } from '../chat/questionIntentClassifier';
import {
  shouldSuppressTherapist,
  shouldPreferBiographyWriter,
} from '../chat/therapistSuppressionRules';

export type ChatMode =
  | 'EMOTIONAL_EXISTENTIAL'  // Mode 1: Thoughts, fears, insecurities
  | 'MEMORY_RECALL'          // Mode 2: Factual questions
  | 'NARRATIVE_RECALL'       // Mode 3: Complex stories
  | 'NARRATIVE_STORY'        // Mode 3b: Build/tell a narrative ("tell me the story of X")
  | 'FOUNDATION_RECALL'      // Mode 3c: Explicit "Recall …" commands (biography, roster, family)
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
        // Always log routing decisions at info — the router gates the entire
        // conversational pipeline, and silent misroutes cost weeks to find.
        logger.info(
          { mode: quickCheck.mode, confidence: quickCheck.confidence, via: 'pattern', reason: quickCheck.reasoning, elapsed: Date.now() - startTime },
          'Mode routed'
        );
        return quickCheck;
      }

      // Step 2: LLM classification (if needed, <250ms)
      const llmCheck = await this.llmModeCheck(message, conversationHistory);

      // Step 3: Combine and decide
      const result = this.combineChecks(quickCheck, llmCheck);

      logger.info(
        { mode: result.mode, confidence: result.confidence, via: 'llm+pattern', reason: result.reasoning, elapsed: Date.now() - startTime },
        'Mode routed'
      );

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

    // Foundation recall queries — structured lore, not LLM + journal fallback
    if (matchesFoundationRecallQuery(message)) {
      return {
        mode: 'FOUNDATION_RECALL',
        confidence: 0.95,
        reasoning: 'Foundation recall query detected (biography, roster, family, or entity)',
      };
    }

    // Explicit "Recall …" commands (caught by matchesFoundationRecallQuery too, kept for clarity)
    if (this.isExplicitRecallCommand(text)) {
      return {
        mode: 'FOUNDATION_RECALL',
        confidence: 0.95,
        reasoning: 'Explicit recall command detected',
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

    // NARRATIVE_STORY: Build/tell a narrative about a topic
    if (this.isNarrativeStory(text)) {
      return {
        mode: 'NARRATIVE_STORY',
        confidence: 0.9,
        reasoning: 'Narrative story build request detected',
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

    // Sprint AK — suppress therapist routing for recall/testing/fact descriptions
    const akIntent = classifyQuestionIntent(message);
    if (shouldSuppressTherapist(message, akIntent)) {
      if (shouldPreferBiographyWriter(message)) {
        return {
          mode: 'EXPERIENCE_INGESTION',
          confidence: 0.85,
          reasoning: 'Biography-worthy fact description; suppress therapist mode',
        };
      }
      if (matchesFoundationRecallQuery(message)) {
        return {
          mode: 'FOUNDATION_RECALL',
          confidence: 0.9,
          reasoning: 'Recall/testing query; suppress therapist mode',
        };
      }
    }

    // EMOTIONAL_EXISTENTIAL: Short, emotional, present-tense
    if (messageLength < 200 && this.isEmotionalExistential(text) && !shouldSuppressTherapist(message, akIntent)) {
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
   * Entity salience score for a message.
   *
   * High-salience messages contain named people, family relationships, or
   * social-context language. These should be elevated to EXPERIENCE_INGESTION
   * even if they lack explicit time ranges, because they carry autobiographical
   * graph data (who exists, how they relate to the user) that must be extracted.
   *
   * Examples that were previously mis-classified as UNKNOWN or ACTION_LOG:
   *   "talking with my cousin Jerry about computers"
   *   "hanging out with my brother and his girlfriend"
   *   "met Sofia at work today, she's really cool"
   */
  private entitySalienceScore(message: string): number {
    let score = 0;

    // Named people: capitalized words that aren't at sentence start and aren't common words
    // Match: "my cousin Jerry", "talked to Maria", "with Alex and Sam"
    const namedPersonPattern = /\b(my |with |and |talked? to |met |saw |visited? |called? )?([A-Z][a-z]{1,15})\b/g;
    const commonWords = new Set([
      'I', 'The', 'A', 'An', 'In', 'At', 'On', 'To', 'It', 'He', 'She', 'We', 'They',
      'This', 'That', 'Is', 'Was', 'Are', 'Were', 'Be', 'Been', 'Have', 'Has', 'Had',
      'Do', 'Does', 'Did', 'Will', 'Would', 'Could', 'Should', 'Can', 'May', 'Might',
      'My', 'Your', 'His', 'Her', 'Our', 'Their', 'Its', 'But', 'And', 'Or', 'So',
      'Not', 'No', 'Yes', 'Ok', 'Okay', 'Also', 'Just', 'Now', 'Here', 'There',
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December',
    ]);
    const namedMatches = [...message.matchAll(namedPersonPattern)];
    const uniqueNames = new Set(
      namedMatches.map(m => m[2]).filter(name => !commonWords.has(name))
    );
    // Cap at +4 so capitalized words alone can't clear the salience threshold
    // (5): place names like "Smith Rock" count as "people" here, and a message
    // can be full of names while being a question or a meta-comment. A
    // relationship/social/interaction signal below is required to tip it over.
    score += Math.min(uniqueNames.size * 2, 4);

    // Family relationship words — always autobiographically significant
    const familyPattern = /\b(cousin|brother|sister|mom|dad|mother|father|uncle|aunt|nephew|niece|grandma|grandpa|grandmother|grandfather|wife|husband|boyfriend|girlfriend|partner|fiance|fiancee|son|daughter|stepbrother|stepsister|stepdad|stepmom|in-law|brother-in-law|sister-in-law)\b/i;
    if (familyPattern.test(message)) score += 4;

    // Social context: friend, coworker, roommate, classmate, etc.
    const socialPattern = /\b(friend|coworker|colleague|roommate|classmate|teammate|neighbor|boss|manager|mentor|therapist|doctor|teacher|professor|coach|trainer)\b/i;
    if (socialPattern.test(message)) score += 2;

    // Relationship verbs: signals a social interaction
    const interactionPattern = /\b(hanging out|hung out|chilling|visited|met up|caught up|talked|chatted|argued|laughed|helped|worked with|studied with|played with)\b/i;
    if (interactionPattern.test(message)) score += 2;

    return score;
  }

  /**
   * Check if message describes an Experience (container)
   * Has: time range, multiple people, location, story arc — OR high entity salience.
   *
   * Entity-salient messages (named people + relationship context) are promoted
   * to EXPERIENCE_INGESTION regardless of time range because they carry
   * autobiographical graph data critical for character extraction.
   */
  private looksLikeExperience(message: string): boolean {
    // Questions are never experience dumps. Without this guard, "did you save
    // Goth Tio as a character?" or "should I book the campsite for the trip
    // with Quintessa?" got an ingestion ack instead of a conversational answer
    // — the user asks something and the app replies "got it, captured!".
    const text = message.trim();
    if (text.includes('?')) return false;
    if (/^(do|did|does|should|shall|can|could|would|will|what|when|where|who|why|how|is|are|am|any)\b/i.test(text)) return false;

    const hasTimeRange = /(last night|yesterday|that weekend|when i was|during|while|for \d+)/i.test(message);
    const hasMultiplePeople = /(we|they|everyone|people|group|together)/i.test(message);
    const hasLocation = /(at|in|to|from) (the |a |an )?[a-z]+/i.test(message);
    const hasStoryArc = message.length > 200 && /(then|after|later|eventually|finally)/i.test(message);
    const hasDuration = /(hours?|minutes?|all day|all night|the whole)/i.test(message);

    // Standard experience detection (unchanged)
    const standardExperience = (hasTimeRange || hasDuration) &&
      (hasMultiplePeople || hasLocation || hasStoryArc);

    // Entity-salience elevation: named people + relationship context is always
    // worth ingesting as an experience even without an explicit time range.
    // Threshold 5 requires a relationship/social/interaction signal on top of
    // names — capitalized words alone (which match place names like "Smith
    // Rock") can no longer clear it on their own.
    const entitySalient = this.entitySalienceScore(message) >= 5;

    return standardExperience || entitySalient;
  }

  /**
   * Check if message is an explicit log/save command.
   * ACTION_LOG should only trigger for deliberate "log this" style commands,
   * NOT for normal first-person conversation like "I thought...", "I felt...", etc.
   */
  private looksLikeAction(message: string): boolean {
    const text = message.trim();

    // Never classify questions as action logs
    if (text.includes('?')) return false;
    // Long messages are almost never pure action logs
    if (text.length > 300) return false;

    // Only trigger for explicit log/save/record commands
    const explicitLogPatterns = [
      /^(log|save|record|capture|store|add to journal|add memory|add lore)\b/i,
      /^(note this|save this|remember this|log this|record this|capture this)\b/i,
      /^journal entry\s*:/i,
      /^memory\s*:/i,
      /^lore note\s*:/i,
      /^action log\s*:/i,
    ];

    return explicitLogPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Explicit "Recall …" commands that should surface structured lore directly.
   */
  private isExplicitRecallCommand(text: string): boolean {
    return /^recall\b/i.test(text.trim());
  }

  /**
   * Character roster queries — must not route to narrative story recall.
   */
  private isCharacterListRecall(text: string): boolean {
    return /\b(recall|list|show|tell me).*(all )?(the )?(characters|people).*(story|life|know|mentioned)\b/i.test(text)
      || /\bhow many (characters|people) do you (remember|know)\b/i.test(text)
      || /\bwho (are )?(the )?(people|characters) in my (story|life)\b/i.test(text);
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
   * Check if message explicitly requests a narrative to be BUILT/TOLD
   * e.g. "tell me the story of", "write the story of", "give me a narrative about"
   */
  private isNarrativeStory(text: string): boolean {
    const storyPatterns = [
      /^(tell me|write|give me|show me) (a |the |my )?(story|narrative|account) (of|about)/i,
      /^(narrate|tell) (my|the|a) (story|journey|arc)/i,
      /^what'?s? (my|the) story (of|with|about|around)/i,
      /^(build|create|generate|construct|craft|write) (me )?(a |the |my )?(story|narrative|arc)/i,
      /^(put together|pull together) (a |the |my )?(story|narrative|arc)/i,
      /^(give|write|build|tell) me (my|the|a) (life story|origin story|full story|whole story|story so far)/i,
      /\b(my story|my narrative|my arc|my journey)\b.*\?$/i,
      /^(what'?s?|tell me) (the )?(narrative|story|arc) (of|behind|about) (my|the)/i,
    ];
    return storyPatterns.some(p => p.test(text));
  }

  /**
   * Check if message is a narrative/story recall query
   */
  private isNarrativeRecall(text: string): boolean {
    if (this.isCharacterListRecall(text)) return false;

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
    _conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<ModeRoutingResult> {
    const prompt = `Classify this message into ONE mode:

Message: "${message}"

Modes:
1. UNKNOWN - Use for: greetings ("hi", "hello", "hey"), thanks ("thanks", "thank you"), meta-questions about the app or you ("Does it work?", "Is this working?", "Can you hear me?", "Are you there?"), and general small talk or conversation that does NOT clearly fit 2-5. These get a normal conversational reply.
2. EMOTIONAL_EXISTENTIAL - Thoughts, fears, insecurities, existential questions. Short, present-tense, clearly emotional. Example: "I feel behind", "Do you think I can get this job?" NOT for: greetings, or frustration about the app ("it's not working", "you only say X").
3. MEMORY_RECALL - Specific factual questions: "What did I eat?", "When did X happen?", "Do you remember Y?"
4. NARRATIVE_RECALL - Complex story questions: "What happened with X?", "Tell me about Y", "What's the story behind Z?"
7. NARRATIVE_STORY - Explicit request to BUILD/TELL a narrative: "tell me the story of my last year", "write the story of my growth", "give me a narrative about my relationship with X", "what's my story?", "narrate my journey"
5. EXPERIENCE_INGESTION - User describing a time-bounded experience (party, night out, trip, event with duration, multiple people, location, story arc). Example: "Last night I went to a show, met these people, things got weird..." NOT: "I got the chat working" or short updates.
6. ACTION_LOG - ONLY for explicit save/log/record commands: "Log this", "Save this", "Remember this", "Journal entry: ...", "Memory: ...", "Lore note: ...". NOT for first-person narrative sentences. NOT for "I thought", "I felt", "I noticed", "I realized", "I decided", or any normal conversational sentence.

Key rules:
- When in doubt between ACTION_LOG/EXPERIENCE and UNKNOWN, always choose UNKNOWN.
- Greetings, thanks, and meta-questions about the app are always UNKNOWN.
- First-person sentences like "I thought X", "I felt Y", "I noticed Z" are NOT action logs — they are UNKNOWN (normal conversation).
- ACTION_LOG requires an explicit command word: log, save, record, capture, store, remember, add to journal.

Respond with JSON:
{
  "mode": "MODE_NAME",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 150,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Validate mode
      const validModes: ChatMode[] = ['EMOTIONAL_EXISTENTIAL', 'MEMORY_RECALL', 'NARRATIVE_RECALL', 'NARRATIVE_STORY', 'FOUNDATION_RECALL', 'EXPERIENCE_INGESTION', 'ACTION_LOG', 'NEEDS_CLARIFICATION', 'MIXED', 'UNKNOWN'];
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
