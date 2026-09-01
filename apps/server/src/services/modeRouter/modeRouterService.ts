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

import {
  isCastRosterQuery,
  isCharacterBookWriteRequest,
  isOrganizationGroupFollowUpRequest,
  isOrganizationGroupWriteRequest,
  isEntityReclassifyWriteRequest,
  isLocationWriteRequest,
  isProjectWriteRequest,
  isSkillWriteRequest,
  isQuestWriteRequest,
  isFamilyWriteRequest,
  isHouseholdWriteRequest,
  isRomanceWriteRequest,
  isEventWriteRequest,
  isLifeArcWriteRequest,
  isLifeArcBrainstormRequest,
  isCharacterEpithetWriteRequest,
  isCharacterEpithetBrainstormRequest,
} from '@lorebook/api-contracts';

import { logger } from '../../logger';
import { isReplyToGroupNamingPrompt } from '../chat/groupWriteService';
import { classifyQuestionIntent } from '../chat/questionIntentClassifier';
import {
  EDUCATION_RE,
  matchesFoundationRecallQuery,
  WORK_RE,
} from '../chat/recallIntentPatterns';
import {
  shouldSuppressTherapist,
  shouldPreferBiographyWriter,
} from '../chat/therapistSuppressionRules';
import { openai } from '../openaiClient';
import { isUniversalBookQueryRequest } from '../query/bookQueryIntent';

export type ChatMode =
  | 'EMOTIONAL_EXISTENTIAL'  // Mode 1: Thoughts, fears, insecurities
  | 'MEMORY_RECALL'          // Mode 2: Factual questions
  | 'NARRATIVE_RECALL'       // Mode 3: Complex stories
  | 'NARRATIVE_STORY'        // Mode 3b: Build/tell a narrative ("tell me the story of X")
  | 'FOUNDATION_RECALL'      // Mode 3c: Explicit "Recall …" commands (biography, roster, family)
  | 'SUBJECT_TIMELINE'       // Existing subject timeline compiler + stitched feed
  | 'CURRENT_STORY_CAST'     // Closed-scope: new/returning/unresolved people in the active thread
  | 'CHARACTER_BOOK_WRITE'   // Explicit "add these people to my character book" request
  | 'ORGANIZATION_GROUP_WRITE' // Explicit group create, roster, hierarchy, or connection write
  | 'ENTITY_RECLASSIFY_WRITE' // Wrong-book correction: "X is a group, not a place"
  | 'LOCATION_WRITE'         // Explicit Places create/update/delete
  | 'PROJECT_WRITE'          // Explicit Projects create/update/delete
  | 'SKILL_WRITE'            // Explicit Skills create/update/delete
  | 'QUEST_WRITE'            // Explicit Quest Log create/update/delete/status
  | 'FAMILY_WRITE'           // Explicit Family Tree kinship writes
  | 'HOUSEHOLD_WRITE'        // Explicit household create/delete/member/location writes
  | 'ROMANCE_WRITE'          // Explicit Dating & Romance status writes
  | 'EVENT_WRITE'            // Explicit Life Log user-posted Event create
  | 'LIFE_ARC_WRITE'         // Explicit swim-lane life arc rename/re-date/re-lane
  | 'LIFE_ARC_BRAINSTORM'    // Read-only name-idea brainstorming for an arc/lane/era
  | 'CHARACTER_EPITHET_WRITE'       // Explicit "set X's title/epithet to Y"
  | 'CHARACTER_EPITHET_BRAINSTORM'  // Read-only title/epithet idea brainstorming for a character
  | 'SUGGESTION_DISMISS_WRITE' // Explicit "that suggestion is wrong" correction
  | 'ORGANIZATION_QUERY'     // Relational read over the Groups & Organizations Book
  | 'CHARACTER_QUERY'        // Grounded read over the People / Character Book
  | 'FAMILY_QUERY'           // Relational read over Family + Family Tree
  | 'LOCATION_QUERY'         // Relational read over Places and Locations
  | 'ROMANCE_QUERY'          // Grounded read over Dating and Romance
  | 'PROJECT_QUERY'          // Grounded read over the Projects Book
  | 'SKILL_QUERY'            // Grounded read over the Skills Book
  | 'QUEST_QUERY'            // Grounded read over the Quest Log
  | 'BOOK_QUERY'             // Cross-Book or generic Event/Document/Narrative read
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
      // Compound project-state questions must resolve a canonical project and
      // retrieve its history before any generic/ingestion classifier can run.
      // This intentionally precedes quickModeCheck: a question such as
      // "What's the current state of LoreBook, and what should I do next?"
      // contains no literal "project" noun and used to fall into ingestion.
      const { isProjectStateRecallShape, resolveProjectStateTarget } = await import(
        '../projects/projectStateRecallService'
      );
      if (isProjectStateRecallShape(message)) {
        const project = await resolveProjectStateTarget(userId, message);
        if (project) {
          const result: ModeRoutingResult = {
            mode: 'PROJECT_QUERY',
            confidence: 0.99,
            reasoning: `Grounded project-state recall detected for ${project.name}`,
          };
          logger.info(
            { mode: result.mode, confidence: result.confidence, via: 'canonical-project', projectId: project.id, elapsed: Date.now() - startTime },
            'Mode routed',
          );
          return result;
        }
      }

      // Step 1: Quick pattern checks (fast, <50ms)
      const quickCheck = this.quickModeCheck(message, conversationHistory);
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
  private quickModeCheck(
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): ModeRoutingResult {
    const text = message.toLowerCase().trim();
    const messageLength = message.length;

    // Explicit timeline generation must outrank generic narrative recall.
    if (isExplicitSubjectTimelineRequest(message)) {
      return {
        mode: 'SUBJECT_TIMELINE',
        confidence: 0.98,
        reasoning: 'Explicit subject timeline request detected',
      };
    }

    // Wrong-book corrections must outrank group create / place query.
    if (isEntityReclassifyWriteRequest(message)) {
      return {
        mode: 'ENTITY_RECLASSIFY_WRITE',
        confidence: 0.97,
        reasoning: 'Explicit entity reclassify / wrong-book correction detected',
      };
    }

    // Explicit "make a group" / roster-list for a new group — must outrank
    // CURRENT_STORY_CAST so "So far we have A, B, and C" actually persists.
    if (isOrganizationGroupWriteRequest(message)) {
      return {
        mode: 'ORGANIZATION_GROUP_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit organization/group create or roster write request detected',
      };
    }

    if (isOrganizationGroupFollowUpRequest(message, conversationHistory)) {
      return {
        mode: 'ORGANIZATION_GROUP_WRITE',
        confidence: 0.94,
        reasoning: 'Follow-up to a recent organization/group roster write',
      };
    }

    // Bare reply to "what do you want to name it?" (e.g. "popular e-girls") —
    // no group/crew keyword, so isOrganizationGroupWriteRequest alone misses it.
    if (isReplyToGroupNamingPrompt(message, conversationHistory)) {
      return {
        mode: 'ORGANIZATION_GROUP_WRITE',
        confidence: 0.9,
        reasoning: 'Bare reply to a pending group-naming prompt',
      };
    }

    if (isLocationWriteRequest(message)) {
      return {
        mode: 'LOCATION_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit Places book write request detected',
      };
    }

    if (isProjectWriteRequest(message)) {
      return {
        mode: 'PROJECT_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit Projects book write request detected',
      };
    }

    if (isSkillWriteRequest(message)) {
      return {
        mode: 'SKILL_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit Skills book write request detected',
      };
    }

    if (isQuestWriteRequest(message)) {
      return {
        mode: 'QUEST_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit Quest Log write request detected',
      };
    }

    if (isFamilyWriteRequest(message)) {
      return {
        mode: 'FAMILY_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit Family Tree write request detected',
      };
    }

    if (isHouseholdWriteRequest(message)) {
      return {
        mode: 'HOUSEHOLD_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit household write request detected',
      };
    }

    if (isRomanceWriteRequest(message)) {
      return {
        mode: 'ROMANCE_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit Dating & Romance write request detected',
      };
    }

    if (isEventWriteRequest(message)) {
      return {
        mode: 'EVENT_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit Life Log Event post request detected',
      };
    }

    if (isLifeArcWriteRequest(message)) {
      return {
        mode: 'LIFE_ARC_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit life arc rename/re-date/re-lane request detected',
      };
    }

    if (isLifeArcBrainstormRequest(message)) {
      return {
        mode: 'LIFE_ARC_BRAINSTORM',
        confidence: 0.9,
        reasoning: 'Explicit request to brainstorm arc/lane/era name ideas detected',
      };
    }

    if (isCharacterEpithetWriteRequest(message)) {
      return {
        mode: 'CHARACTER_EPITHET_WRITE',
        confidence: 0.93,
        reasoning: 'Explicit request to set a character\'s card title/epithet detected',
      };
    }

    if (isCharacterEpithetBrainstormRequest(message)) {
      return {
        mode: 'CHARACTER_EPITHET_BRAINSTORM',
        confidence: 0.9,
        reasoning: 'Explicit request to brainstorm a character\'s card title/epithet detected',
      };
    }

    // Closed-scope current-story cast query ("who's new and returning in this
    // story?") must outrank generic narrative recall — NARRATIVE_RECALL has
    // no concept of "the active thread's cast" and SILENCEs on this shape.
    if (isCastRosterQuery(message)) {
      return {
        mode: 'CURRENT_STORY_CAST',
        confidence: 0.95,
        reasoning: 'Cast/roster new-vs-returning query for the active story window',
      };
    }

    // Explicit "add these people to my character book" request — must not
    // fall through to ordinary chat, where it only gets a prompt-level
    // acknowledgment with no real persistence.
    if (isCharacterBookWriteRequest(message)) {
      return {
        mode: 'CHARACTER_BOOK_WRITE',
        confidence: 0.95,
        reasoning: 'Explicit Character Book write request detected',
      };
    }

    if (isSuggestionDismissWriteRequest(message)) {
      return {
        mode: 'SUGGESTION_DISMISS_WRITE',
        confidence: 0.93,
        reasoning: 'Explicit suggestion dismissal/correction request detected',
      };
    }

    // Work and education recall have a deterministic handler. These terms can
    // also look like document or organization domains, so resolve them before
    // the generic Book registry.
    if (WORK_RE.test(message) || EDUCATION_RE.test(message)) {
      return {
        mode: 'FOUNDATION_RECALL',
        confidence: 0.95,
        reasoning: 'Foundation work or education recall query detected',
      };
    }

    // Cross-Book questions must be recognized before a single Book handler
    // captures one of their domains.
    if (isUniversalBookQueryRequest(message)) {
      return {
        mode: 'BOOK_QUERY',
        confidence: 0.96,
        reasoning: 'Cross-Book or generic Book query detected',
      };
    }

    if (isOrganizationQueryRequest(message)) {
      return {
        mode: 'ORGANIZATION_QUERY',
        confidence: 0.94,
        reasoning: 'Relational Groups & Organizations Book query detected',
      };
    }

    if (isFamilyQueryRequest(message)) {
      return {
        mode: 'FAMILY_QUERY',
        confidence: 0.95,
        reasoning: 'Relational Family and Family Tree query detected',
      };
    }

    if (isCharacterBookQueryRequest(message)) {
      return {
        mode: 'CHARACTER_QUERY',
        confidence: 0.94,
        reasoning: 'Grounded People / Character Book query detected',
      };
    }

    if (isLocationQueryRequest(message)) {
      return {
        mode: 'LOCATION_QUERY',
        confidence: 0.95,
        reasoning: 'Relational Places and Locations query detected',
      };
    }

    // Explicit Quest Log nouns win over cross-domain status words such as
    // "blocked", which can also describe a romantic connection.
    if (isQuestQueryRequest(message)) {
      return {
        mode: 'QUEST_QUERY',
        confidence: 0.96,
        reasoning: 'Grounded Quest Log query detected',
      };
    }

    if (isRomanceQueryRequest(message)) {
      return {
        mode: 'ROMANCE_QUERY',
        confidence: 0.95,
        reasoning: 'Grounded Dating and Romance query detected',
      };
    }

    if (isProjectQueryRequest(message)) {
      return {
        mode: 'PROJECT_QUERY',
        confidence: 0.95,
        reasoning: 'Grounded Projects Book query detected',
      };
    }

    if (isSkillQueryRequest(message)) {
      return {
        mode: 'SKILL_QUERY',
        confidence: 0.95,
        reasoning: 'Grounded Skills Book query detected',
      };
    }

    // Remaining foundation queries are checked after dedicated domain modes
    // so questions such as "who am I dating?" stay in the romance compiler.
    if (matchesFoundationRecallQuery(message)) {
      return {
        mode: 'FOUNDATION_RECALL',
        confidence: 0.95,
        reasoning: 'Foundation recall query detected (biography, roster, family, or entity)',
      };
    }

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
8. CURRENT_STORY_CAST - Asking who's new vs. already-known in the CURRENT conversation/thread specifically: "who's new and returning in this story?", "who have I mentioned so far in this chat?". Scoped to this thread, not the whole life story. NOT for listing members of a group you are creating ("So far we have A, B, and C").
9. CHARACTER_BOOK_WRITE - Explicit request to save/add/rename/delete people in the character book: "make sure they're all in my character book", "add Marcus to my character book", "delete the person Marcus".
10. ORGANIZATION_GROUP_WRITE - Explicit request to create/delete a group/crew/squad, supply its roster, or edit group/company/job hierarchy and connections: "make a group for that", "delete the group Northwind Collective", "So far we have Marcus, Jamie, and Nova", "make Robotics a department under Vanguard Robotics", "Robotics is a job at Vanguard Robotics", "connect Vanguard Robotics with MemoVault".
10b. ENTITY_RECLASSIFY_WRITE - Wrong-book correction: "Popular E-Girls is a group, not a place", "move X to my Groups book", "X should be a project".
10c. LOCATION_WRITE - Explicit Places create/rename/delete: "add Northwind Depot as a place", "delete the place X".
10d. PROJECT_WRITE - Explicit Projects create/rename/delete: "add MemoVault as a project".
10e. SKILL_WRITE - Explicit Skills create/rename/delete/merge: "add Welding as a skill", "merge Prototyping into Hardware Prototyping".
10f. QUEST_WRITE - Explicit Quest Log create/rename/delete/status: "add Ship MemoVault as a quest", "mark the quest X as done".
10g. FAMILY_WRITE - Explicit Family Tree kinship write: "mark Marcus as my cousin".
10g2. HOUSEHOLD_WRITE - Explicit household create/delete/member/location write: "add Ralph to the Mom and Dad's House household", "move the Mom and Dad's House household to 456 Oak Ave".
10h. ROMANCE_WRITE - Explicit Dating & Romance status write: "mark Jamie as dating", "we broke up with Jamie".
10i. EVENT_WRITE - Explicit Life Log Event post: "we played a backyard show at Northwind Depot", "post an event: House Show at Ritual Coffee".
10j. LIFE_ARC_WRITE - Explicit swim-lane life arc rename/re-date/re-lane: "rename the arc Robotics Career Push to Robotics Push", "move the arc Ángel Negr0 to my Creative lane", "change the dates of arc Reconstruction to 2026-ongoing".
10k. LIFE_ARC_BRAINSTORM - Read-only request for name/title ideas for an arc, lane, or era (no write): "give me some name ideas for my Career arc", "brainstorm names for my Romance lane", "what should I call my Creative arc".
10l. CHARACTER_EPITHET_WRITE - Explicit apply-a-picked-title write for a character's card title: "set Genni's title to Card Table Rival", "change Ángel Negr0's epithet to Underground Selector".
10m. CHARACTER_EPITHET_BRAINSTORM - Read-only request for card-title/epithet ideas for a character (no write): "give me some title ideas for Genni", "brainstorm epithets for Genni", "help me title Genni's card".
11. ORGANIZATION_QUERY - Read-only query over the Groups & Organizations Book: "which groups am I in?", "what organizations is Marcus connected to?", "show unlinked bands".
11b. CHARACTER_QUERY - Grounded query over the People / Character Book: "which people need review?", "who do I know from Vanguard Robotics?", "which people look related?", "show people in my character book". NOT "who is Marcus?" (foundation recall) and NOT family-tree questions.
12. FAMILY_QUERY - Read-only query over Family and Family Tree: "who is on my maternal side?", "show my cousins", "who lives in the Solenne House?", "which relatives need review?".
13. LOCATION_QUERY - Read-only query over Places and Locations: "which places did I visit with Marcus?", "show places linked to Vanguard Robotics", "which locations need coordinates?".
14. ROMANCE_QUERY - Grounded query over Dating and Romance: "who am I currently dating?", "show my past relationships", "which romantic records need review?", "rank my evidence-backed connections by compatibility".
15. PROJECT_QUERY - Grounded query over the Projects Book: "show my active software projects", "which projects did I finish in 2025?", "rank my projects by grounded importance".
16. SKILL_QUERY - Grounded query over the Skills Book: "show my improving technical skills", "which skills do I use for Vanguard Robotics?", "rank my evidence-backed skills by proficiency", "which skills are similar?", "what skills are similar to Interviewing".
17. QUEST_QUERY - Grounded query over the Quest Log: "what quests am I currently working on?", "show blocked quests", "which quests are due soon?", "rank my quests by priority".
18. BOOK_QUERY - Cross-Book query, or a grounded query over Life Log, Documents, or Narrative Anchors: "what skills support my active quests?", "which documents mention MemoVault?", "show Life Log events with Marcus".

Key rules:
- When in doubt between ACTION_LOG/EXPERIENCE and UNKNOWN, always choose UNKNOWN.
- Greetings, thanks, and meta-questions about the app are always UNKNOWN.
- First-person sentences like "I thought X", "I felt Y", "I noticed Z" are NOT action logs — they are UNKNOWN (normal conversation).
- ACTION_LOG requires an explicit command word: log, save, record, capture, store, remember, add to journal.
- Listing people after "so far we have" / "members are" is ORGANIZATION_GROUP_WRITE, never CURRENT_STORY_CAST.
- "X is a group, not a place" / "move X to Groups" is ENTITY_RECLASSIFY_WRITE, not ORGANIZATION_GROUP_WRITE or LOCATION_QUERY.
- Questions that explicitly ask for a set of places or locations are LOCATION_QUERY; "what happened at X?" remains narrative recall.
- Explicit lists, filters, or rankings over dating and romantic connections are ROMANCE_QUERY. Advice, feelings, and "what happened with X?" remain ordinary romantic conversation or narrative recall.
- Explicit lists, filters, timelines, or rankings over projects are PROJECT_QUERY. "What happened while building X?" remains narrative recall.
- Explicit lists, filters, growth checks, project associations, or rankings over skills are SKILL_QUERY. Advice about learning a new skill remains ordinary conversation.
- Explicit lists, filters, progress checks, schedules, or rankings over quests are QUEST_QUERY. Asking for help completing a quest remains ordinary conversation.
- Explicit lists, filters, or rankings over people in the Character Book are CHARACTER_QUERY. "Who is Marcus?" remains foundation recall. Family-tree questions remain FAMILY_QUERY.
- Questions naming multiple Books, or explicit queries over Life Log, Documents, or Narrative Anchors, are BOOK_QUERY.

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
      const validModes: ChatMode[] = ['EMOTIONAL_EXISTENTIAL', 'MEMORY_RECALL', 'NARRATIVE_RECALL', 'NARRATIVE_STORY', 'FOUNDATION_RECALL', 'SUBJECT_TIMELINE', 'CURRENT_STORY_CAST', 'CHARACTER_BOOK_WRITE', 'ORGANIZATION_GROUP_WRITE', 'ENTITY_RECLASSIFY_WRITE', 'LOCATION_WRITE', 'PROJECT_WRITE', 'SKILL_WRITE', 'QUEST_WRITE', 'FAMILY_WRITE', 'HOUSEHOLD_WRITE', 'ROMANCE_WRITE', 'EVENT_WRITE', 'LIFE_ARC_WRITE', 'LIFE_ARC_BRAINSTORM', 'CHARACTER_EPITHET_WRITE', 'CHARACTER_EPITHET_BRAINSTORM', 'SUGGESTION_DISMISS_WRITE', 'ORGANIZATION_QUERY', 'CHARACTER_QUERY', 'FAMILY_QUERY', 'LOCATION_QUERY', 'ROMANCE_QUERY', 'PROJECT_QUERY', 'SKILL_QUERY', 'QUEST_QUERY', 'BOOK_QUERY', 'EXPERIENCE_INGESTION', 'ACTION_LOG', 'NEEDS_CLARIFICATION', 'MIXED', 'UNKNOWN'];
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

    // Same override for NARRATIVE_RECALL: the classifier's own few-shot example
    // ("Tell me about Y") surface-matches ordinary introductions ("Let me tell
    // you about X..."), and unlike a genuine recall question, an introduction
    // has nothing to retrieve — routing it to recall either finds nothing or,
    // if the recall path throws, surfaces a confusing "something went wrong"
    // error instead of a normal reflective reply. Below 0.75 confidence, prefer
    // UNKNOWN so the message gets a normal conversational response.
    if (quick.mode === 'UNKNOWN' && llm.mode === 'NARRATIVE_RECALL' && llm.confidence < 0.75) {
      return { ...quick, confidence: 0.6, reasoning: 'Overriding LLM NARRATIVE_RECALL when confidence < 0.75; use normal chat' };
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

/**
 * Whether the message is actually posing a question/information request, not
 * just incidentally containing a query-verb word inside a narrative sentence
 * (e.g. "the show on Hulu" contains "show" but isn't asking to show anything).
 * The *QueryRequest classifiers below gate on this so a journal entry that
 * happens to mention "family"/"places"/"skills" isn't misrouted into a
 * structured Book query instead of normal conversational chat.
 */
function looksLikeQueryPhrasing(text: string): boolean {
  if (text.includes('?')) return true;
  return /^(?:who|what|which|where|when|how|why|show|find|list|tell|give|display|pull up|do i|do you|does|did|am i|is|are|was|were|can you|could you|will|would|rank|compare)\b/i.test(text);
}

export function isOrganizationQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text || !looksLikeQueryPhrasing(text)) return false;
  const hasGroupSubject =
    /\b(?:groups?|organizations?|bands?|crews?|clubs?|communities|companies|teams?)\b/i.test(text);
  if (!hasGroupSubject) return false;
  return (
    /\b(?:which|what|who|show|find|list|how many)\b/i.test(text)
    && /\b(?:am i in|i belong|part of|connected to|associated with|with|include|includes|including|mine|close to|their world|mentioned|unlinked|unresolved|active|inactive|at|located|based)\b/i.test(text)
  );
}

export function isCharacterBookQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text || !looksLikeQueryPhrasing(text)) return false;
  const peopleSubject =
    /\b(?:people|persons?|characters?|character book|people book|coworkers?|colleagues?)\b/i.test(text)
    || /\bwho do i know\b/i.test(text)
    || /\bpeople i know\b/i.test(text);
  if (!peopleSubject) return false;
  if (/\b(?:family tree|maternal|paternal|cousins?|siblings?|households?)\b/i.test(text)
    && !/\b(?:character book|people book)\b/i.test(text)) {
    return false;
  }
  if (/\b(?:dating|romance|romantic|exes?|crushes?|situationships?)\b/i.test(text)) return false;
  if (/\b(?:this (?:story|chat|thread|conversation)|in my (?:story|life)|new and returning)\b/i.test(text)) return false;
  return (
    /\b(?:which|what|who|show|find|list|how many|rank|compare)\b/i.test(text) &&
    /\b(?:my|book|review|unverified|similar|duplicates?|related|connected|from|at|with|know|active|inactive|coworkers?|colleagues?|people|characters?)\b/i.test(text)
  );
}

export function isFamilyQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text || !looksLikeQueryPhrasing(text)) return false;
  // People-book similarity ("which people look related?") is CHARACTER_QUERY, not kinship.
  if (
    /\b(?:people|persons?|characters?)\b/i.test(text)
    && /\b(?:look related|similar|duplicates?)\b/i.test(text)
    && !/\b(?:family|family tree|relatives?|kinship|maternal|paternal|cousins?|siblings?|parents?|households?)\b/i.test(text)
  ) {
    return false;
  }
  if (!/\b(?:family|family tree|relatives?|related|moms?|mothers?|dads?|fathers?|parents?|siblings?|sisters?|brothers?|grandparents?|grandmas?|grandpas?|aunts?|uncles?|cousins?|households?)\b/i.test(text)) {
    return false;
  }
  return /\b(?:who|which|what|show|find|list|how many|how is)\b/i.test(text)
    && /\b(?:my|related|side|branch|tree|family|household|lives|inferred|confirmed|review|card|closest|growing|inactive)\b/i.test(text);
}

export function isLocationQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text || !looksLikeQueryPhrasing(text)) return false;
  if (!/\b(?:places?|locations?|venues?|cities|neighborhoods?|restaurants?|bars?|clubs?|parks?)\b/i.test(text)) {
    return false;
  }
  return (
    /\b(?:which|what|where|show|find|list|how many)\b/i.test(text) &&
    /\b(?:i|my|visited|went|been|with|linked|associated|connected|organization|group|in|near|inside|within|coordinates|map|mentioned|unvisited|recent|review|most|frequent)\b/i.test(text)
  );
}

export function isRomanceQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text || !looksLikeQueryPhrasing(text)) return false;
  if (!/\b(?:dating|romance|romantic|relationships?|relationship\s+(?:status|history|changes?)|exes?|crushes?|situationships?|boyfriends?|girlfriends?|partners?|lovers?|no contact|ghosted|blocked|inactive)\b/i.test(text)) {
    return false;
  }
  return (
    /\b(?:which|who|what|show|find|list|how many|rank|compare)\b/i.test(text) &&
    /\b(?:my|i|current|active|inactive|past|former|dated|dating|romantic|relationship|history|changed|changes|reason|crush|situationship|no contact|ghosted|blocked|risk|flag|review|linked|compatibility|health|affection|intensity|attachment|evidence)\b/i.test(text)
  );
}

export function isProjectQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text || !looksLikeQueryPhrasing(text)) return false;
  if (!/\b(?:projects?|builds?|initiatives?|workstreams?)\b/i.test(text)) {
    return false;
  }
  return (
    /\b(?:which|what|show|find|list|how many|rank|compare)\b/i.test(text) &&
    /\b(?:my|active|current|paused|complete|completed|finished|abandoned|software|business|creative|fitness|education|career|hobby|tagged|started|ended|recent|important|importance|priority|review|missing)\b/i.test(text)
  );
}

export function isSkillQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text || !looksLikeQueryPhrasing(text)) return false;
  if (!/\b(?:skills?|capabilities|proficiencies)\b/i.test(text)) {
    return false;
  }
  return (
    /\b(?:which|what|show|find|list|how many|rank|compare)\b/i.test(text) &&
    /\b(?:my|active|inactive|technical|creative|physical|professional|practical|social|intellectual|emotional|artistic|paid|hobby|improving|stagnant|declining|practiced|level|proficiency|confidence|evidence|use|used|needed|required|project|job|review|similar|related|duplicates?|merge)\b/i.test(text)
  );
}

export function isQuestQueryRequest(message: string): boolean {
  const text = message.trim();
  if (!text || !looksLikeQueryPhrasing(text)) return false;
  if (!/\b(?:quests?|quest log|missions?)\b/i.test(text)) return false;
  return (
    /\b(?:which|what|show|find|list|how many|rank|compare)\b/i.test(text) &&
    /\b(?:my|active|current|working on|in progress|paused|completed|finished|abandoned|blocked|stuck|due|deadline|priority|important|progress|main|side|daily|recent|review)\b/i.test(text)
  );
}

export function isSuggestionDismissWriteRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  const hasSuggestionWord = /\b(suggestion|suggested|detected|book)\b/.test(text);
  const hasDismissVerb = /\b(dismiss|remove|delete|hide|suppress|reject|clear|drop)\b/.test(text);
  const hasCorrectionPhrase =
    /\b(not a|not an|wrong book|wrong type|bad extraction|noise|garbage|duplicate|already tracked|already have)\b/.test(text);
  const hasBookDomain = /\b(place|location|character|person|project|skill|quest|goal)\b/.test(text);
  return (hasDismissVerb && hasBookDomain) || (hasSuggestionWord && hasCorrectionPhrase && hasBookDomain);
}

export function isExplicitSubjectTimelineRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    /\b(?:show|pull up|bring up|give|build|create|generate|display)\b[^.!?\n]{0,60}\b(?:a |the |my )?timeline\b/i.test(text)
    || /\b(?:what is|what's)\b[^.!?\n]{0,40}\b timeline of\b/i.test(text)
    || /\b(?:timeline|chronology)\b[^.!?\n]{0,45}\b(?:my time|history|relationship|career|project)\b/i.test(text)
    || /\b(?:my|the)\s+[\p{L}\p{N}'’.-]+(?:\s+[\p{L}\p{N}'’.-]+){0,5}\s+timeline\b/iu.test(text)
    || /\bhow did\b[^.!?\n]{2,60}\b(?:develop|evolve|change|unfold)\b[^.!?\n]{0,20}\bover time\b/i.test(text)
    || /\b(?:show|give|tell)\b[^.!?\n]{0,30}\b(?:history|chronology)\s+of\b/i.test(text)
    || /\bwhat happened during my time (?:at|in|with|as)\b/i.test(text)
  );
}

export const modeRouterService = new ModeRouterService();
