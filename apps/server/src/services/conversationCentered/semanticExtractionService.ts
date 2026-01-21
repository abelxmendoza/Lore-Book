// =====================================================
// SEMANTIC UNIT EXTRACTION SERVICE
// Purpose: Extract EXPERIENCE, FEELING, THOUGHT, etc. from normalized text
// =====================================================

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import type { ExtractedUnitType, ExtractionResult } from '../../types/conversationCentered';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * Extracts semantic units from normalized text
 */
export class SemanticExtractionService {
  /**
   * Extract semantic units from normalized text
   * @param isAIMessage - Whether this text is from an AI response
   */
  async extractSemanticUnits(
    normalizedText: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    isAIMessage: boolean = false
  ): Promise<ExtractionResult> {
    try {
      // Try rule-based extraction first (free, fast)
      const ruleBasedUnits = this.ruleBasedExtraction(normalizedText);
      
      // For AI messages, reduce confidence
      if (isAIMessage && ruleBasedUnits.units.length > 0) {
        ruleBasedUnits.units.forEach(unit => {
          unit.confidence = Math.max(0.3, unit.confidence * 0.7);
        });
      }
      
      // If we got good results, use them
      if (ruleBasedUnits.units.length > 0 && ruleBasedUnits.units.some(u => u.confidence >= 0.7)) {
        return ruleBasedUnits;
      }

      // Otherwise, use LLM for complex cases
      return await this.llmExtraction(normalizedText, conversationHistory, isAIMessage);
    } catch (error) {
      logger.error({ error, text: normalizedText }, 'Failed to extract semantic units');
      // Fallback to rule-based
      const fallback = this.ruleBasedExtraction(normalizedText);
      if (isAIMessage && fallback.units.length > 0) {
        fallback.units.forEach(unit => {
          unit.confidence = Math.max(0.3, unit.confidence * 0.7);
        });
      }
      return fallback;
    }
  }

  /**
   * Rule-based extraction (free, fast)
   * Enhanced with 50+ new patterns and improved confidence scoring
   */
  private ruleBasedExtraction(text: string): ExtractionResult {
    const units: ExtractionResult['units'] = [];
    const lowerText = text.toLowerCase();
    
    // Calculate confidence based on pattern matches and text characteristics
    const calculateConfidence = (baseConfidence: number, patternMatches: number, textLength: number): number => {
      let confidence = baseConfidence;
      // Boost confidence for multiple pattern matches
      if (patternMatches > 1) confidence += 0.1;
      // Boost confidence for longer, more detailed text
      if (textLength > 50) confidence += 0.05;
      // Cap at 0.95
      return Math.min(confidence, 0.95);
    };

    // EXPERIENCE patterns (past tense, action verbs) - Expanded
    const experiencePatterns = [
      // Past tense actions - comprehensive verb list
      /\b(i|we|they|he|she|it)\s+(went|did|met|saw|visited|attended|completed|finished|started|began|achieved|accomplished|had|got|received|gave|took|made|created|built|wrote|read|watched|listened|played|worked|studied|learned|taught|helped|solved|fixed|broke|lost|found|bought|sold|moved|traveled|arrived|left|returned|joined|quit|ended|opened|closed|sent|called|texted|messaged|emailed|posted|shared|liked|commented|followed|blocked|deleted|saved|downloaded|uploaded|installed|updated|signed|registered|booked|reserved|cancelled|confirmed|rejected|accepted|approved|applied|interviewed|hired|fired|resigned|graduated|enrolled|passed|failed|won|lost|competed|participated|performed|presented|spoke|researched|discovered|invented|designed|developed|tested|launched|released|published|announced|celebrated|mourned|recovered|healed|improved|changed|stayed|continued|stopped|paused|resumed|tried|attempted|succeeded|failed|managed|handled|faced|confronted|avoided|escaped|survived|overcame|struggled|fought|argued|agreed|compromised|negotiated|discussed|talked|communicated|connected|met|reunited|separated|married|engaged|dated|forgave|apologized|thanked|appreciated|recognized|praised|criticized|complained|insulted|hurt|helped|supported|encouraged|motivated|inspired|disappointed|surprised|shocked|amazed|impressed|bored|interested|excited|thrilled|confused|understood|learned|forgot|remembered|recalled|realized|noticed|observed|witnessed|experienced|felt|sensed|discovered|found|lost|invited|welcomed|rejected|embraced|bonded|disconnected|greeted|introduced|caught up|hung out|spent time|shared|exchanged|traded|purchased|ordered|delivered|picked up|dropped off|shipped|mailed|opened|wrapped|packed|unpacked|relocated|settled|improved|worsened|recovered|relapsed|healed|injured|treated|cured|diagnosed|prescribed|took|skipped|missed|showed up|arrived|came|went|persisted|persevered)\b/gi,
      // Temporal markers with past actions
      /\b(yesterday|last (night|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|earlier (today|this week|this month)|a (day|week|month|year) ago|recently|lately|just now|a moment ago|a while ago|earlier|before|previously|in the past|once|back then)\s+(i|we|they|he|she|it)\s+\w+/gi,
      // Completed actions
      /\b(just|already|finally|eventually|recently)\s+(finished|completed|done|accomplished|achieved|got|received|made|created|built|wrote|read|watched|listened|played|worked|studied|learned|taught|helped|solved|fixed|broke|lost|found|bought|sold|moved|traveled|arrived|left|returned|joined|quit|started|ended)\b/gi,
      // Past perfect tense
      /\b(had|have|has)\s+\w+ed\b/gi,
      // Was/were doing patterns
      /\b(was|were)\s+\w+ing\b/gi,
    ];
    
    const experienceMatches = experiencePatterns.filter(p => p.test(text)).length;
    if (experienceMatches > 0) {
      units.push({
        type: 'EXPERIENCE',
        content: text,
        confidence: calculateConfidence(0.75, experienceMatches, text.length),
        metadata: {
          temporal_context: this.extractTemporalContext(text),
        },
      });
    }

    // FEELING patterns (emotional language) - Expanded
    const feelingPatterns = [
      // Direct feeling statements
      /\b(i|i'm|i am|i feel|feeling|felt|feels|i'm feeling|i was feeling|i've been feeling)\s+(happy|sad|angry|excited|nervous|anxious|worried|scared|afraid|confident|proud|ashamed|embarrassed|disappointed|frustrated|grateful|thankful|relieved|stressed|overwhelmed|calm|peaceful|content|satisfied|unsatisfied|lonely|connected|loved|hated|jealous|envious|guilty|shameful|hopeful|hopeless|optimistic|pessimistic|depressed|elated|ecstatic|miserable|terrible|awful|great|wonderful|fantastic|amazing|incredible|terrible|horrible|disgusting|revolting|nauseating|sick|ill|unwell|well|healthy|unhealthy|tired|exhausted|energetic|energized|motivated|demotivated|inspired|uninspired|creative|uncreative|productive|unproductive|busy|free|available|unavailable|present|absent|here|there|away|back|home|out|in|inside|outside|up|down|high|low|good|bad|better|worse|best|worst|fine|ok|okay|alright|all right|not bad|not good|so so|meh|whatever|indifferent|neutral|positive|negative|mixed|conflicted|torn|split|divided|united|together|apart|close|distant|near|far|close|distant|near|far|warm|cold|hot|cool|comfortable|uncomfortable|safe|unsafe|secure|insecure|stable|unstable|steady|unsteady|balanced|unbalanced|centered|off center|grounded|ungrounded|rooted|uprooted|settled|unsettled|peaceful|restless|calm|anxious|relaxed|tense|loose|tight|open|closed|free|trapped|liberated|imprisoned|released|captured|caught|free|bound|unbound|tied|untied|connected|disconnected|attached|detached|linked|unlinked|joined|separated|united|divided|together|apart|close|distant|near|far|warm|cold|hot|cool|comfortable|uncomfortable|safe|unsafe|secure|insecure|stable|unstable|steady|unsteady|balanced|unbalanced|centered|off center|grounded|ungrounded|rooted|uprooted|settled|unsettled|peaceful|restless|calm|anxious|relaxed|tense|loose|tight|open|closed|free|trapped|liberated|imprisoned|released|captured|caught|free|bound|unbound|tied|untied|connected|disconnected|attached|detached|linked|unlinked|joined|separated|united|divided|together|apart)\b/gi,
      // Emotional state words
      /\b(emotion|emotions|emotional|mood|moods|feeling|feelings|sentiment|sentiments|affect|affects|state of mind|mental state|emotional state|psychological state|frame of mind|disposition|temperament|personality|character|nature|essence|spirit|soul|heart|mind|body|physical|mental|emotional|spiritual|psychological|physiological|biological|chemical|hormonal|neurological|cognitive|affective|behavioral|social|cultural|environmental|contextual|situational|temporal|spatial|relational|interpersonal|intrapersonal|collective|individual|personal|private|public|shared|unshared|common|uncommon|rare|frequent|occasional|regular|irregular|consistent|inconsistent|stable|unstable|volatile|calm|chaotic|orderly|disorderly|organized|disorganized|structured|unstructured|systematic|unsystematic|methodical|random|planned|unplanned|intentional|unintentional|deliberate|accidental|purposeful|purposeless|meaningful|meaningless|significant|insignificant|important|unimportant|relevant|irrelevant|pertinent|impertinent|applicable|inapplicable|appropriate|inappropriate|suitable|unsuitable|fitting|unfitting|proper|improper|correct|incorrect|right|wrong|true|false|accurate|inaccurate|precise|imprecise|exact|inexact|specific|vague|clear|unclear|obvious|subtle|overt|covert|explicit|implicit|direct|indirect|straightforward|complicated|simple|complex|easy|difficult|hard|soft|tough|gentle|rough|smooth|rough|polished|unpolished|refined|unrefined|sophisticated|unsophisticated|advanced|basic|elementary|fundamental|essential|nonessential|necessary|unnecessary|required|optional|mandatory|voluntary|compulsory|elective|forced|chosen|selected|picked|opted|decided|undecided|certain|uncertain|sure|unsure|confident|unconfident|doubtful|dubious|skeptical|trusting|faithful|faithless|loyal|disloyal|devoted|indifferent|committed|uncommitted|dedicated|undedicated|devoted|undevoted|passionate|apathetic|enthusiastic|unenthusiastic|excited|unexcited|thrilled|unthrilled|bored|interested|uninterested|curious|incurious|inquisitive|uninquisitive|wondering|unwondering|questioning|unquestioning|doubting|undoubting|believing|unbelieving|trusting|untrusting|skeptical|unskeptical|cynical|optimistic|pessimistic|hopeful|hopeless|despairing|desperate|despondent|dejected|depressed|elated|ecstatic|euphoric|blissful|joyful|happy|sad|unhappy|miserable|wretched|wretched|pitiful|pathetic|pathetic|tragic|comic|funny|serious|solemn|grave|light|heavy|weighty|weightless|burdensome|burdenless|oppressive|liberating|freeing|constraining|restricting|limiting|unlimited|boundless|endless|finite|infinite|eternal|temporary|permanent|transient|lasting|fleeting|momentary|instant|instantaneous|immediate|delayed|postponed|deferred|put off|procrastinated|hastened|hurried|rushed|slow|fast|quick|rapid|swift|speedy|sluggish|lethargic|energetic|lively|vivacious|animated|inanimate|dead|alive|living|breathing|nonbreathing|conscious|unconscious|aware|unaware|mindful|unmindful|attentive|inattentive|focused|unfocused|concentrated|distracted|undistracted|engaged|disengaged|involved|uninvolved|participating|nonparticipating|active|inactive|passive|aggressive|assertive|unassertive|submissive|dominant|subordinate|superior|inferior|equal|unequal|same|different|similar|dissimilar|alike|unlike|identical|nonidentical|equivalent|nonequivalent|comparable|incomparable|compatible|incompatible|consistent|inconsistent|coherent|incoherent|logical|illogical|rational|irrational|reasonable|unreasonable|sensible|nonsensical|meaningful|meaningless|significant|insignificant|important|unimportant|relevant|irrelevant|pertinent|impertinent|applicable|inapplicable|appropriate|inappropriate|suitable|unsuitable|fitting|unfitting|proper|improper|correct|incorrect|right|wrong|true|false|accurate|inaccurate|precise|imprecise|exact|inexact|specific|vague|clear|unclear|obvious|subtle|overt|covert|explicit|implicit|direct|indirect|straightforward|complicated|simple|complex|easy|difficult|hard|soft|tough|gentle|rough|smooth|rough|polished|unpolished|refined|unrefined|sophisticated|unsophisticated|advanced|basic|elementary|fundamental|essential|nonessential|necessary|unnecessary|required|optional|mandatory|voluntary|compulsory|elective|forced|chosen|selected|picked|opted|decided|undecided|certain|uncertain|sure|unsure|confident|unconfident|doubtful|dubious|skeptical|trusting|faithful|faithless|loyal|disloyal|devoted|indifferent|committed|uncommitted|dedicated|undedicated|devoted|undevoted|passionate|apathetic|enthusiastic|unenthusiastic|excited|unexcited|thrilled|unthrilled|bored|interested|uninterested|curious|incurious|inquisitive|uninquisitive|wondering|unwondering|questioning|unquestioning|doubting|undoubting|believing|unbelieving|trusting|untrusting|skeptical|unskeptical|cynical|optimistic|pessimistic|hopeful|hopeless|despairing|desperate|despondent|dejected|depressed|elated|ecstatic|euphoric|blissful|joyful|happy|sad|unhappy|miserable|wretched|wretched|pitiful|pathetic|pathetic|tragic|comic|funny|serious|solemn|grave|light|heavy|weighty|weightless|burdensome|burdenless|oppressive|liberating|freeing|constraining|restricting|limiting|unlimited|boundless|endless|finite|infinite|eternal|temporary|permanent|transient|lasting|fleeting|momentary|instant|instantaneous|immediate|delayed|postponed|deferred|put off|procrastinated|hastened|hurried|rushed|slow|fast|quick|rapid|swift|speedy|sluggish|lethargic|energetic|lively|vivacious|animated|inanimate|dead|alive|living|breathing|nonbreathing|conscious|unconscious|aware|unaware|mindful|unmindful|attentive|inattentive|focused|unfocused|concentrated|distracted|undistracted|engaged|disengaged|involved|uninvolved|participating|nonparticipating|active|inactive|passive|aggressive|assertive|unassertive|submissive|dominant|subordinate|superior|inferior|equal|unequal|same|different|similar|dissimilar|alike|unlike|identical|nonidentical|equivalent|nonequivalent|comparable|incomparable|compatible|incompatible|consistent|inconsistent|coherent|incoherent|logical|illogical|rational|irrational|reasonable|unreasonable|sensible|nonsensical)\b/gi,
      // Intensity markers
      /\b(very|extremely|incredibly|really|quite|pretty|somewhat|a bit|a little|slightly|barely|hardly|scarcely|almost|nearly|completely|totally|absolutely|entirely|fully|partially|partly|mostly|mainly|primarily|chiefly|largely|mostly|mainly|primarily|chiefly|largely|mostly|mainly|primarily|chiefly|largely)\s+(happy|sad|angry|excited|nervous|anxious|worried|scared|afraid|confident|proud|ashamed|embarrassed|disappointed|frustrated|grateful|thankful|relieved|stressed|overwhelmed|calm|peaceful|content|satisfied|unsatisfied|lonely|connected|loved|hated|jealous|envious|guilty|shameful|hopeful|hopeless|optimistic|pessimistic|depressed|elated|ecstatic|miserable|terrible|awful|great|wonderful|fantastic|amazing|incredible|terrible|horrible|disgusting|revolting|nauseating|sick|ill|unwell|well|healthy|unhealthy|tired|exhausted|energetic|energized|motivated|demotivated|inspired|uninspired|creative|uncreative|productive|unproductive|busy|free|available|unavailable|present|absent|here|there|away|back|home|out|in|inside|outside|up|down|high|low|good|bad|better|worse|best|worst|fine|ok|okay|alright|all right|not bad|not good|so so|meh|whatever|indifferent|neutral|positive|negative|mixed|conflicted|torn|split|divided|united|together|apart|close|distant|near|far|warm|cold|hot|cool|comfortable|uncomfortable|safe|unsafe|secure|insecure|stable|unstable|steady|unsteady|balanced|unbalanced|centered|off center|grounded|ungrounded|rooted|uprooted|settled|unsettled|peaceful|restless|calm|anxious|relaxed|tense|loose|tight|open|closed|free|trapped|liberated|imprisoned|released|captured|caught|free|bound|unbound|tied|untied|connected|disconnected|attached|detached|linked|unlinked|joined|separated|united|divided|together|apart)\b/gi,
    ];

    const feelingMatches = feelingPatterns.filter(p => p.test(text)).length;
    if (feelingMatches > 0) {
      units.push({
        type: 'FEELING',
        content: text,
        confidence: calculateConfidence(0.75, feelingMatches, text.length),
      });
    }

    // THOUGHT patterns (cognitive, reflective) - Expanded
    const thoughtPatterns = [
      // Cognitive statements
      /\b(i|i'm|i am|i think|thinking|thought|thoughts|i believe|i realize|realized|realization|i understand|understanding|i see|i notice|noticed|i wonder|wondering|i guess|guessing|i suppose|supposing|i imagine|imagining|i consider|considering|i reflect|reflecting|reflection|insight|insights|perspective|perspectives|i'm thinking|i was thinking|i've been thinking|it seems|it appears|it looks like|it sounds like|it feels like|i figure|i reckon|i assume|i presume|i suspect|i doubt|i question|i'm wondering|i've been wondering|i'm curious|i'm intrigued|i'm puzzled|i'm confused|i'm perplexed|i'm baffled|i'm stumped|i'm stuck|i'm lost|i'm aware|i'm conscious|i'm mindful|i'm attentive|i'm observant|i'm perceptive|i'm insightful|i'm intuitive|i'm analytical|i'm logical|i'm rational|i'm reasonable|i'm sensible|i'm thoughtful|i'm considerate|i'm contemplative|i'm meditative|i'm reflective|i'm introspective|i'm self aware|i'm self conscious)\b/gi,
      // Cognitive processes
      /\b(realized|understood|comprehended|grasped|caught|got|figured out|worked out|solved|resolved|determined|decided|concluded|inferred|deduced|induced|reasoned|rationalized|justified|explained|accounted for|attributed|ascribed|credited|blamed|faulted|criticized|praised|complimented|appreciated|valued|treasured|cherished|prized|esteemed|respected|admired|chose|selected|picked|opted|settled|agreed|disagreed|argued|debated|discussed|talked|communicated)\b/gi,
    ];

    const thoughtMatches = thoughtPatterns.filter(p => p.test(text)).length;
    if (thoughtMatches > 0) {
      units.push({
        type: 'THOUGHT',
        content: text,
        confidence: calculateConfidence(0.75, thoughtMatches, text.length),
      });
    }

    // PERCEPTION patterns (beliefs, assumptions, hearsay) - Expanded
    const perceptionPatterns = [
      // Hearsay and secondhand information
      /\b(i heard|i was told|someone said|they said|people say|rumor|rumors|gossip|i believe|i assume|assuming|i suspect|suspected|i guess|i imagine|supposedly|apparently|allegedly|reportedly|according to|based on|from what i|from what|word is|the word|scuttlebutt|hearsay|secondhand|thirdhand|indirect|firsthand|eyewitness|testimony|evidence|proof|indication|sign|signal|clue|hint|tip|lead|suggestion|implication|inference|deduction|conclusion|assumption|presumption|supposition|hypothesis|theory|speculation|conjecture|guess|estimate|approximation|rough idea|ballpark)\b/gi,
      // Uncertainty markers
      /\b(might|may|could|possibly|perhaps|maybe|probably|likely|unlikely|probably not|likely not|doubtful|dubious|questionable|uncertain|unsure|not sure|not certain|not clear|unclear|ambiguous|vague|indefinite|indeterminate|undetermined|unresolved|unsettled|unfixed|unestablished|unconfirmed|unverified|unvalidated)\b/gi,
    ];

    const perceptionMatches = perceptionPatterns.filter(p => p.test(text)).length;
    if (perceptionMatches > 0) {
      units.push({
        type: 'PERCEPTION',
        content: text,
        confidence: calculateConfidence(0.65, perceptionMatches, text.length),
      });
    }

    // CLAIM patterns (factual assertions) - More specific
    const claimPatterns = [
      // Factual statements (excluding personal thoughts)
      /\b(is|are|was|were|has|have|had|does|did|will|would|can|could|should|must|always|never|every|all|none|some|many|most|few|fact|facts|true|truth|real|reality|actually|really|definitely|certainly|absolutely)\b/gi,
      // Specific facts and evidence
      /\b(according to|based on|research shows|studies indicate|evidence suggests|data shows|statistics show|results show|findings show|analysis shows|investigation reveals|examination reveals|review reveals|test reveals|experiment reveals|study reveals|research reveals|survey reveals|interview reveals)\b/gi,
    ];

    const claimMatches = claimPatterns.filter(p => p.test(text)).length;
    if (claimMatches > 0 && !lowerText.includes('i think') && !lowerText.includes('i believe') && !lowerText.includes('i feel')) {
      units.push({
        type: 'CLAIM',
        content: text,
        confidence: calculateConfidence(0.65, claimMatches, text.length),
      });
    }

    // DECISION patterns (choices, commitments, intents) - Expanded
    const decisionPatterns = [
      // Decision statements
      /\b(i|i'm|i am|i will|i'll|i'm going to|i'm gonna|i decided|decided|decision|decisions|i choose|chose|choosing|choice|choices|i plan|planning|plans|i intend|intending|intention|intentions|i commit|committing|commitment|commitments|i promise|promising|promise|promises|i'm planning to|i'm planning on|i'm about to|i'm ready to|i'm prepared to|i'm set to|i'm scheduled to)\b/gi,
      // Future commitments
      /\b(going to|gonna|will|shall|must|have to|need to|want to|plan to|intend to|aim to|try to|attempt to|strive to|seek to|endeavor to|work to|struggle to|fight to|face to|meet to|encounter to|experience to|endure to|suffer to|bear to|accept to|get to|obtain to|acquire to|gain to|earn to|win to|achieve to|accomplish to|complete to|finish to|end to|conclude to|terminate to|stop to|pause to|resume to|continue to|proceed to|go to|move to|advance to|progress to|develop to|evolve to|transform to|change to|modify to|adjust to|adapt to)\b/gi,
    ];

    const decisionMatches = decisionPatterns.filter(p => p.test(text)).length;
    if (decisionMatches > 0) {
      units.push({
        type: 'DECISION',
        content: text,
        confidence: calculateConfidence(0.75, decisionMatches, text.length),
      });
    }

    // CORRECTION patterns (revisions, retractions) - Expanded
    const correctionPatterns = [
      /\b(actually|wait|no|never mind|scratch that|ignore that|forget that|i was wrong|i made a mistake|correction|corrected|i meant|i mean|let me rephrase|let me correct|i take that back|retract|retraction|i need to correct|i should correct|i want to correct|i have to correct|i must correct|i'll correct|i'm correcting|i've corrected|i corrected|i'm going to correct|i'm about to correct|i'm ready to correct|i'm prepared to correct|i'm set to correct)\b/gi,
    ];

    const correctionMatches = correctionPatterns.filter(p => p.test(text)).length;
    if (correctionMatches > 0) {
      units.push({
        type: 'CORRECTION',
        content: text,
        confidence: calculateConfidence(0.85, correctionMatches, text.length),
      });
    }

    // If no units found, default to EXPERIENCE with low confidence
    if (units.length === 0) {
      units.push({
        type: 'EXPERIENCE',
        content: text,
        confidence: 0.4,
      });
    }

    return { units };
  }

  /**
   * Extract temporal context from text
   */
  private extractTemporalContext(text: string): Record<string, any> {
    const lowerText = text.toLowerCase();
    const context: Record<string, any> = {};

    // Past temporal markers
    if (/\b(yesterday|last (night|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|earlier (today|this week|this month)|a (day|week|month|year) ago|recently|lately|just now|a moment ago|a while ago|earlier|before|previously|in the past|once|back then)\b/.test(lowerText)) {
      context.temporal_scope = 'PAST';
    }
    // Present temporal markers
    else if (/\b(now|currently|at the moment|right now|at present|today|this (week|month|year))\b/.test(lowerText)) {
      context.temporal_scope = 'PRESENT';
    }
    // Future temporal markers
    else if (/\b(tomorrow|next (week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|soon|later|in the future|eventually|someday|one day|eventually)\b/.test(lowerText)) {
      context.temporal_scope = 'FUTURE';
    }
    // Ongoing patterns
    else if (/\b(always|often|usually|regularly|constantly|repeatedly|keep|keeps|kept|getting|get|gets)\s+\w+ed\b/.test(lowerText)) {
      context.temporal_scope = 'ONGOING';
    }

    return context;
  }

  /**
   * LLM-based extraction (for complex cases)
   * @param isAIMessage - Whether this text is from an AI response (affects extraction strategy)
   */
  private async llmExtraction(
    text: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    isAIMessage: boolean = false
  ): Promise<ExtractionResult> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `You are analyzing text to extract semantic units. Extract one or more units from the text.

${isAIMessage ? `IMPORTANT: This text is from an AI assistant response. AI responses are interpretations, not facts.
- Extract insights, connections, and questions (THOUGHT, PERCEPTION types)
- Do NOT extract EXPERIENCE units from AI responses (AI didn't experience anything)
- Mark confidence lower (0.4-0.6 range) since these are interpretations
- Note uncertainty markers (might, seems, appears, etc.)
- Extract connections and insights the AI is making` : `IMPORTANT: A single text may contain MULTIPLE distinct events or experiences. Split them when:`}
- Different activities occur (eating, watching, working, cleaning, etc.)
- Different character groups are involved
- Different locations or contexts
- Temporal markers indicate sequence (then, after, while, meanwhile)
- Different emotional contexts

Unit types:
- EXPERIENCE: Something that happened (past tense actions, events)
- FEELING: Emotional reactions or states
- THOUGHT: Cognitive processes, reflections, realizations
- PERCEPTION: Beliefs, assumptions, things heard (not directly experienced)
- CLAIM: Factual assertions or statements of fact
- DECISION: Choices, commitments, intentions, plans
- CORRECTION: Revisions, retractions, corrections of previous statements

LANGUAGE HANDLING:
- Preserve Spanish words and phrases (pozole, tia, mugroso, nadien, ayuden, etc.)
- Recognize Spanish names (Gabriel, Chava, Lourdes, etc.)
- Understand mixed English-Spanish text
- Extract Spanish terms as metadata

CHARACTER ATTRIBUTES:
- When text describes character traits (e.g., "Gabriel is a drunk", "always drinking"), extract as:
  - EXPERIENCE unit for the observation
  - Include character attributes in metadata (e.g., "drinking_problem", "between_jobs", "debt", "unemployed")
- When user mentions their own status (e.g., "I'm unemployed", "I don't have a job"), extract:
  - FEELING or THOUGHT unit for the emotional/mental state
  - Include employment_status: "unemployed" in metadata for the user entity
- Extract concerns and anxieties (e.g., "don't want to let them know" → FEELING unit with anxiety/concern)

Return JSON:
{
  "units": [
    {
      "type": "EXPERIENCE|FEELING|THOUGHT|PERCEPTION|CLAIM|DECISION|CORRECTION",
      "content": "extracted content",
      "confidence": 0.0-1.0,
      "temporal_context": {},
      "entity_ids": [],
      "metadata": {
        "spanish_terms": ["pozole", "tia", "mugroso"],
        "characters": ["Gabriel", "Chava", "Tia Lourdes"],
        "character_attributes": {"Gabriel": ["drinking_problem", "between_jobs", "debt"]}
      }
    }
  ]
}

Be precise. Split multiple events when appropriate. Preserve Spanish terms. Extract character attributes.`,
      },
    ];

    if (conversationHistory) {
      messages.push(...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })));
    }

    messages.push({
      role: 'user',
      content: `Extract semantic units from: "${text}"`,
    });

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.3,
      messages,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from LLM');
    }

    const parsed = JSON.parse(response);
    return {
      units: parsed.units || [],
    };
  }
}

export const semanticExtractionService = new SemanticExtractionService();

