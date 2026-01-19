import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import { BooleanContradiction } from '../math/booleanContradiction';

import { factExtractionService } from './factExtractionService';
import type { ExtractedFact } from './factExtractionService';
import { ruleBasedFactExtractionService } from './ruleBasedFactExtraction';
import { supabaseAdmin } from './supabaseClient';
import { truthVerificationService } from './truthVerificationService';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type ImportedFact = {
  id: string;
  text: string;
  confidence: 'high' | 'medium' | 'low';
  verificationStatus: 'unverified' | 'verified' | 'contradicted' | 'ambiguous';
  contradictions?: Array<{ entryId: string; text: string }>;
  evidence?: Array<{ entryId: string; text: string }>;
  source: string;
  extractedFact?: ExtractedFact;
};

class ChatGPTImportService {
  /**
   * Process a ChatGPT conversation and extract facts with verification
   */
  async processConversation(
    userId: string,
    conversation: string
  ): Promise<{ facts: ImportedFact[] }> {
    try {
      // Step 1: Parse ChatGPT conversation format
      const parsedConversation = this.parseChatGPTConversation(conversation);

      // Step 2: Extract facts from user messages and AI responses
      const extractedFacts: ImportedFact[] = [];

      for (const message of parsedConversation) {
        if (message.role === 'user' || message.role === 'assistant') {
          // Extract facts using rule-based extraction (free, no API calls)
          const extractionResult = await ruleBasedFactExtractionService.extractFacts(message.content);
          
          for (const fact of extractionResult.facts) {
            // Verify each fact against existing entries
            const verification = await this.verifyFact(userId, fact, message.content);

            extractedFacts.push({
              id: uuid(),
              text: this.formatFactText(fact),
              confidence: this.mapConfidence(fact.confidence),
              verificationStatus: verification.status,
              contradictions: verification.contradictions,
              evidence: verification.evidence,
              source: `${message.role === 'user' ? 'Your message' : 'ChatGPT response'}: "${message.content.substring(0, 100)}..."`,
              extractedFact: fact
            });
          }
        }
      }

      // Step 3: Use AI to extract additional contextual facts if needed
      if (extractedFacts.length === 0) {
        const aiExtracted = await this.extractFactsWithAI(conversation);
        for (const fact of aiExtracted) {
          const verification = await this.verifyFact(userId, fact, conversation);
          extractedFacts.push({
            id: uuid(),
            text: this.formatFactText(fact),
            confidence: 'medium' as const,
            verificationStatus: verification.status,
            contradictions: verification.contradictions,
            evidence: verification.evidence,
            source: 'AI-extracted from conversation',
            extractedFact: fact
          });
        }
      }

      return { facts: extractedFacts };
    } catch (error) {
      logger.error({ error }, 'Failed to process ChatGPT conversation');
      throw error;
    }
  }

  /**
   * Import verified facts into the system
   */
  async importFacts(
    userId: string,
    facts: ImportedFact[]
  ): Promise<{
    factsAdded: number;
    contradictionsFound: number;
    verified: number;
  }> {
    let factsAdded = 0;
    let contradictionsFound = 0;
    let verified = 0;

    for (const fact of facts) {
      try {
        if (fact.verificationStatus === 'contradicted') {
          contradictionsFound++;
        } else if (fact.verificationStatus === 'verified') {
          verified++;
        }

        // Create a journal entry from the fact
        const entryId = uuid();
        const entryContent = `[Imported from ChatGPT] ${fact.text}`;

        // Store the entry
        const { error: entryError } = await supabaseAdmin
          .from('journal_entries')
          .insert({
            id: entryId,
            user_id: userId,
            content: entryContent,
            date: new Date().toISOString().split('T')[0],
            source: 'chatgpt_import',
            metadata: {
              imported: true,
              originalFact: fact.extractedFact,
              verificationStatus: fact.verificationStatus,
              source: fact.source
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (entryError) {
          logger.warn({ error: entryError, fact }, 'Failed to create entry from imported fact');
          continue;
        }

        // Store fact claims if we have extracted fact
        if (fact.extractedFact) {
          const factClaim: any = {
            user_id: userId,
            entry_id: entryId,
            subject: fact.extractedFact.subject,
            attribute: fact.extractedFact.attribute,
            value: fact.extractedFact.value,
            confidence: fact.extractedFact.confidence,
            metadata: {
              imported: true,
              source: 'chatgpt',
              verificationStatus: fact.verificationStatus
            }
          };

          // Add claim_type if it exists in the fact
          if ('claim_type' in fact.extractedFact && fact.extractedFact.claim_type) {
            factClaim.claim_type = fact.extractedFact.claim_type;
          }

          await supabaseAdmin
            .from('fact_claims')
            .upsert(factClaim, {
              onConflict: 'user_id,entry_id,subject,attribute,value'
            })
            .catch(err => logger.debug({ error: err }, 'Failed to store fact claim'));
        }

        factsAdded++;
      } catch (error) {
        logger.warn({ error, fact }, 'Failed to import fact');
      }
    }

    return { factsAdded, contradictionsFound, verified };
  }

  /**
   * Parse ChatGPT conversation format
   */
  private parseChatGPTConversation(conversation: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    // Try to parse different ChatGPT formats
    // Format 1: "You: ..." / "ChatGPT: ..." or "User: ..." / "Assistant: ..."
    const format1Regex = /(?:You|User):\s*(.+?)(?=(?:ChatGPT|Assistant|You|User):|$)/gis;
    const format2Regex = /(?:ChatGPT|Assistant):\s*(.+?)(?=(?:You|User|ChatGPT|Assistant):|$)/gis;

    // Format 2: JSON-like or markdown format
    if (conversation.includes('"role"') || conversation.includes("'role'")) {
      try {
        const jsonMatch = conversation.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content || msg.text || ''
          }));
        }
      } catch (e) {
        // Fall through to text parsing
      }
    }

    // Simple text parsing
    const lines = conversation.split('\n');
    let currentRole: 'user' | 'assistant' | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect role changes
      if (/^(You|User):/i.test(trimmed)) {
        if (currentRole && currentContent.length > 0) {
          messages.push({ role: currentRole, content: currentContent.join('\n') });
        }
        currentRole = 'user';
        currentContent = [trimmed.replace(/^(You|User):\s*/i, '')];
      } else if (/^(ChatGPT|Assistant|AI):/i.test(trimmed)) {
        if (currentRole && currentContent.length > 0) {
          messages.push({ role: currentRole, content: currentContent.join('\n') });
        }
        currentRole = 'assistant';
        currentContent = [trimmed.replace(/^(ChatGPT|Assistant|AI):\s*/i, '')];
      } else if (currentRole) {
        currentContent.push(trimmed);
      }
    }

    // Add last message
    if (currentRole && currentContent.length > 0) {
      messages.push({ role: currentRole, content: currentContent.join('\n') });
    }

    // If no structured format found, treat entire conversation as user input
    if (messages.length === 0) {
      messages.push({ role: 'user', content: conversation });
    }

    return messages;
  }

  /**
   * Verify a fact against existing entries
   */
  private async verifyFact(
    userId: string,
    fact: ExtractedFact,
    sourceText: string
  ): Promise<{
    status: 'unverified' | 'verified' | 'contradicted' | 'ambiguous';
    contradictions?: Array<{ entryId: string; text: string }>;
    evidence?: Array<{ entryId: string; text: string }>;
  }> {
    try {
      // Get related entries
      const { data: relatedEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, date')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(100);

      if (!relatedEntries || relatedEntries.length === 0) {
        return { status: 'unverified' };
      }

      // Check for contradictions and evidence
      const contradictions: Array<{ entryId: string; text: string }> = [];
      const evidence: Array<{ entryId: string; text: string }> = [];

      // Get existing fact claims
      const { data: existingFacts } = await supabaseAdmin
        .from('fact_claims')
        .select('entry_id, subject, attribute, value, confidence')
        .eq('user_id', userId)
        .eq('subject', fact.subject)
        .eq('attribute', fact.attribute);

      if (existingFacts) {
        for (const existingFact of existingFacts) {
          const existingFactObj: ExtractedFact = {
            claim_type: existingFact.claim_type as any,
            subject: existingFact.subject,
            attribute: existingFact.attribute,
            value: existingFact.value,
            confidence: existingFact.confidence
          };

          // Check for contradiction
          if (BooleanContradiction.contradicts(existingFactObj, fact)) {
            const entry = relatedEntries.find(e => e.id === existingFact.entry_id);
            if (entry) {
              contradictions.push({
                entryId: entry.id,
                text: entry.content.substring(0, 200)
              });
            }
          } else if (BooleanContradiction.supports(existingFactObj, fact)) {
            const entry = relatedEntries.find(e => e.id === existingFact.entry_id);
            if (entry) {
              evidence.push({
                entryId: entry.id,
                text: entry.content.substring(0, 200)
              });
            }
          }
        }
      }

      // Determine status
      let status: 'unverified' | 'verified' | 'contradicted' | 'ambiguous' = 'unverified';
      if (contradictions.length > 0 && evidence.length === 0) {
        status = 'contradicted';
      } else if (contradictions.length > 0 && evidence.length > 0) {
        status = 'ambiguous';
      } else if (evidence.length > 0) {
        status = 'verified';
      }

      return {
        status,
        contradictions: contradictions.length > 0 ? contradictions : undefined,
        evidence: evidence.length > 0 ? evidence : undefined
      };
    } catch (error) {
      logger.warn({ error, fact }, 'Failed to verify fact');
      return { status: 'unverified' };
    }
  }

  /**
   * Extract facts using AI as fallback
   */
  private async extractFactsWithAI(conversation: string): Promise<ExtractedFact[]> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `Extract factual claims about the user from this ChatGPT conversation. Return JSON array of facts with: claim_type, subject, attribute, value, confidence (0-1).`
          },
          {
            role: 'user',
            content: conversation.substring(0, 10000) // Limit size
          }
        ]
      });

      const response = completion.choices[0]?.message?.content || '[]';
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      return JSON.parse(jsonStr) as ExtractedFact[];
    } catch (error) {
      logger.warn({ error }, 'Failed to extract facts with AI');
      return [];
    }
  }

  /**
   * Format fact as readable text
   */
  private formatFactText(fact: ExtractedFact): string {
    return `${fact.subject} ${fact.attribute} ${fact.value}`;
  }

  /**
   * Map confidence score to confidence level
   */
  private mapConfidence(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.4) return 'medium';
    return 'low';
  }
}

export const chatGPTImportService = new ChatGPTImportService();
