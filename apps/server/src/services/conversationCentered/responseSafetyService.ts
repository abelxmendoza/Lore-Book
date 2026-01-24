// =====================================================
// RESPONSE SAFETY SERVICE
// Purpose: Ensures responses don't amplify shame, escalate unnecessarily, or reinforce isolation
// This is the layer that makes the system safe for honest, vulnerable communication
// =====================================================

import { logger } from '../../logger';
import type { ExtractedUnit } from '../../types/conversationCentered';

export type StressSignal = {
  type: 'economic' | 'relational' | 'isolation' | 'fear' | 'shame' | 'dependency';
  intensity: 'low' | 'medium' | 'high';
  evidence: string;
  confidence: number;
};

export type ResponseSafetyContext = {
  stressSignals: StressSignal[];
  hasShameLanguage: boolean;
  hasIsolationLanguage: boolean;
  hasDependencyFear: boolean;
  hasRelationalStrain: boolean;
  shouldAvoidAdvice: boolean;
  shouldAvoidEscalation: boolean;
  recommendedTone: 'supportive' | 'neutral' | 'curious' | 'archivist';
  safetyGuidance: string;
};

/**
 * Response Safety Service
 * Analyzes messages for stress signals and provides safety guidance for response generation
 */
export class ResponseSafetyService {
  /**
   * Analyze message for stress signals and generate safety context
   */
  analyzeMessage(
    message: string,
    extractedUnits?: ExtractedUnit[]
  ): ResponseSafetyContext {
    const stressSignals: StressSignal[] = [];
    let hasShameLanguage = false;
    let hasIsolationLanguage = false;
    let hasDependencyFear = false;
    let hasRelationalStrain = false;

    const lowerMessage = message.toLowerCase();

    // Economic stress signals
    if (
      /\b(out of work|unemployed|jobless|no job|can't afford|broke|poor|financial|money|bills|expenses)\b/i.test(message)
    ) {
      const intensity = this.inferIntensity(message, 'economic');
      stressSignals.push({
        type: 'economic',
        intensity,
        evidence: this.extractEvidence(message, 'economic'),
        confidence: 0.8,
      });
    }

    // Relational strain signals
    if (
      /\b(family|mom|dad|grandma|grandpa|tia|uncle|aunt|sibling|brother|sister)\s+(making|talking|judging|criticizing|disrespecting|shaming|blaming)\b/i.test(message) ||
      /\b(feel like shit|making me feel|judging me|talking shit|disrespecting)\b/i.test(message)
    ) {
      hasRelationalStrain = true;
      const intensity = this.inferIntensity(message, 'relational');
      stressSignals.push({
        type: 'relational',
        intensity,
        evidence: this.extractEvidence(message, 'relational'),
        confidence: 0.85,
      });
    }

    // Isolation signals
    if (
      /\b(in my room|door shut|alone|isolated|hiding|avoiding|don't want them|shut myself)\b/i.test(message)
    ) {
      hasIsolationLanguage = true;
      const intensity = this.inferIntensity(message, 'isolation');
      stressSignals.push({
        type: 'isolation',
        intensity,
        evidence: this.extractEvidence(message, 'isolation'),
        confidence: 0.75,
      });
    }

    // Shame language
    if (
      /\b(feel like shit|ashamed|embarrassed|guilty|worthless|pathetic|loser|failure|not good enough)\b/i.test(message)
    ) {
      hasShameLanguage = true;
      stressSignals.push({
        type: 'shame',
        intensity: 'high',
        evidence: this.extractEvidence(message, 'shame'),
        confidence: 0.9,
      });
    }

    // Dependency fear
    if (
      /\b(if.*died|would go homeless|have to move|dependent|rely on|need them|can't survive without)\b/i.test(message)
    ) {
      hasDependencyFear = true;
      stressSignals.push({
        type: 'dependency',
        intensity: 'high',
        evidence: this.extractEvidence(message, 'dependency'),
        confidence: 0.8,
      });
    }

    // Fear signals (hypothetical scenarios, future anxiety)
    // SECURITY: Split complex regex to avoid ReDoS - check dependency pattern first with limited lookahead
    const hasDependencyPattern = /\bif\s+\w+\s+died\s+would\s+go\s+homeless\b/i.test(message);
    const hasFearKeywords = /\b(if\s+\w+\s+happened|would|might|worried|afraid|fear|anxious|scared|terrified)\b/i.test(message);
    
    if (hasFearKeywords && !hasDependencyPattern) {
      stressSignals.push({
        type: 'fear',
        intensity: this.inferIntensity(message, 'fear'),
        evidence: this.extractEvidence(message, 'fear'),
        confidence: 0.7,
      });
    }

    // Determine if advice should be avoided
    // Avoid unsolicited advice when there's high shame, isolation, or relational strain
    const shouldAvoidAdvice =
      hasShameLanguage ||
      hasIsolationLanguage ||
      (hasRelationalStrain && stressSignals.some(s => s.type === 'relational' && s.intensity === 'high'));

    // Determine if escalation should be avoided
    // Only escalate if there's explicit self-harm language (not just stress)
    const hasExplicitSelfHarm = /\b(kill myself|suicide|end it|hurt myself|cut|self harm)\b/i.test(message);
    const shouldAvoidEscalation = !hasExplicitSelfHarm;

    // Determine recommended tone
    let recommendedTone: 'supportive' | 'neutral' | 'curious' | 'archivist' = 'supportive';
    if (hasShameLanguage || hasIsolationLanguage) {
      recommendedTone = 'supportive'; // Prioritize support over curiosity
    } else if (hasRelationalStrain) {
      recommendedTone = 'curious'; // Ask gentle questions, don't assume
    } else if (stressSignals.length === 0) {
      recommendedTone = 'neutral'; // Normal conversation
    }

    // Generate safety guidance for system prompt
    const safetyGuidance = this.generateSafetyGuidance({
      stressSignals,
      hasShameLanguage,
      hasIsolationLanguage,
      hasDependencyFear,
      hasRelationalStrain,
      shouldAvoidAdvice,
      shouldAvoidEscalation,
      recommendedTone,
      safetyGuidance: '', // Will be filled below
    });

    return {
      stressSignals,
      hasShameLanguage,
      hasIsolationLanguage,
      hasDependencyFear,
      hasRelationalStrain,
      shouldAvoidAdvice,
      shouldAvoidEscalation,
      recommendedTone,
      safetyGuidance,
    };
  }

  /**
   * Generate safety guidance string for system prompt
   */
  private generateSafetyGuidance(context: ResponseSafetyContext): string {
    const parts: string[] = [];

    if (context.hasShameLanguage) {
      parts.push(
        `⚠️ SHAME DETECTED: The user is expressing shame or self-criticism. DO NOT:
- Amplify their shame by agreeing with negative self-assessments
- Give unsolicited advice about "fixing" themselves
- Minimize their feelings ("it's not that bad")
- Compare them to others ("others have it worse")
INSTEAD:
- Acknowledge their feelings without judgment
- Validate that their experience is real
- Avoid advice unless explicitly asked
- Focus on listening, not fixing`
      );
    }

    if (context.hasIsolationLanguage) {
      parts.push(
        `⚠️ ISOLATION DETECTED: The user is isolating themselves. DO NOT:
- Push them to "get out there" or "be social"
- Suggest they're "overreacting" by isolating
- Give unsolicited social advice
INSTEAD:
- Acknowledge their need for space is valid
- Don't reinforce isolation, but don't shame it either
- If they mention isolation, gently note it without pressure
- Focus on understanding why, not fixing behavior`
      );
    }

    if (context.hasRelationalStrain) {
      parts.push(
        `⚠️ RELATIONAL STRAIN DETECTED: The user is experiencing family/relationship conflict. DO NOT:
- Take sides or validate negative beliefs about others
- Suggest cutting people off or dramatic actions
- Amplify conflict by agreeing with negative interpretations
INSTEAD:
- Acknowledge their feelings about the relationship
- Remember: perceptions are stored as beliefs, not facts
- Ask gentle questions to understand, don't assume
- Focus on their experience, not others' behavior`
      );
    }

    if (context.hasDependencyFear) {
      parts.push(
        `⚠️ DEPENDENCY FEAR DETECTED: The user is expressing fear about dependency or loss. DO NOT:
- Minimize their fears ("that won't happen")
- Give unsolicited financial advice
- Suggest they're "overthinking"
INSTEAD:
- Acknowledge the fear is real and valid
- These are hypothetical scenarios, not plans
- Focus on understanding the fear, not solving it
- Don't escalate unless there's explicit self-harm language`
      );
    }

    if (context.shouldAvoidAdvice) {
      parts.push(
        `⚠️ ADVICE AVOIDANCE: The user is in a vulnerable state. DO NOT:
- Give unsolicited advice or suggestions
- Tell them what they "should" do
- Offer solutions unless explicitly asked
INSTEAD:
- Listen and acknowledge
- Ask gentle questions if appropriate
- Wait for them to ask for help before offering solutions`
      );
    }

    if (context.stressSignals.length > 0) {
      const highStressCount = context.stressSignals.filter(s => s.intensity === 'high').length;
      if (highStressCount > 0) {
        parts.push(
          `⚠️ HIGH STRESS DETECTED: Multiple stress signals present. RESPONSE PRINCIPLES:
- This is a moment of vulnerability, not a crisis (unless explicit self-harm)
- Your role is to listen and acknowledge, not diagnose or fix
- Store their experience accurately without judgment
- Don't label them ("depressed", "broken", "needs help")
- Treat this as structured memory formation, not intervention trigger`
        );
      }
    }

    // General safety principles
    parts.push(
      `✅ RESPONSE SAFETY PRINCIPLES:
- No unsolicited advice unless explicitly requested
- No crisis escalation unless explicit self-harm language
- No shame amplification (don't agree with negative self-assessments)
- No isolation reinforcement (don't validate hiding as permanent solution)
- Acknowledge feelings without judgment
- Store beliefs as beliefs, not facts
- Focus on understanding, not fixing
- Treat vulnerability as data, not pathology`
    );

    return parts.join('\n\n');
  }

  /**
   * Infer intensity of stress signal
   */
  private inferIntensity(message: string, signalType: string): 'low' | 'medium' | 'high' {
    const lowerMessage = message.toLowerCase();

    // High intensity indicators
    const highIndicators = [
      'feel like shit',
      'making me feel',
      'can\'t',
      'won\'t',
      'never',
      'always',
      'terrified',
      'desperate',
      'hopeless',
    ];

    // Medium intensity indicators
    const mediumIndicators = [
      'worried',
      'concerned',
      'stressed',
      'anxious',
      'uncomfortable',
      'difficult',
    ];

    if (highIndicators.some(indicator => lowerMessage.includes(indicator))) {
      return 'high';
    }

    if (mediumIndicators.some(indicator => lowerMessage.includes(indicator))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Extract evidence phrase from message
   */
  private extractEvidence(message: string, signalType: string): string {
    // Find the sentence or phrase that contains the signal
    const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      
      if (signalType === 'economic' && /\b(out of work|unemployed|jobless|can't afford)\b/i.test(sentence)) {
        return sentence.trim().substring(0, 100);
      }
      
      if (signalType === 'relational' && /\b(family|mom|dad|grandma|making me feel|talking shit)\b/i.test(sentence)) {
        return sentence.trim().substring(0, 100);
      }
      
      if (signalType === 'isolation' && /\b(in my room|door shut|alone|isolated)\b/i.test(sentence)) {
        return sentence.trim().substring(0, 100);
      }
      
      if (signalType === 'shame' && /\b(feel like shit|ashamed|embarrassed|guilty)\b/i.test(sentence)) {
        return sentence.trim().substring(0, 100);
      }
      
      if (signalType === 'dependency' && /\b(if.*died|would go homeless|have to move)\b/i.test(sentence)) {
        return sentence.trim().substring(0, 100);
      }
      
      if (signalType === 'fear' && /\b(if|would|worried|afraid|fear)\b/i.test(sentence)) {
        return sentence.trim().substring(0, 100);
      }
    }

    return message.substring(0, 50);
  }
}

export const responseSafetyService = new ResponseSafetyService();
