import { logger } from '../logger';
import { BooleanContradiction } from '../math/booleanContradiction';
import { FactSetTheory } from '../math/factSetTheory';
import type { MemoryEntry } from '../types';

import { factCacheService } from './factCacheService';
import { factExtractionService, type ExtractedFact } from './factExtractionService';
import { memoryService } from './memoryService';
import { ruleBasedFactExtractionService } from './ruleBasedFactExtraction';
import { supabaseAdmin } from './supabaseClient';


export type VerificationStatus = 'verified' | 'unverified' | 'contradicted' | 'ambiguous';

export type EvidenceEntry = {
  entry_id: string;
  entry_date: string;
  content_snippet: string;
  similarity_score?: number;
};

export type VerificationResult = {
  status: VerificationStatus;
  confidence_score: number;
  evidence_count: number;
  contradiction_count: number;
  supporting_entries: EvidenceEntry[];
  contradicting_entries: EvidenceEntry[];
  extracted_facts: ExtractedFact[];
  verification_report: {
    facts_checked: number;
    facts_verified: number;
    facts_contradicted: number;
    facts_unverified: number;
    details: Array<{
      fact: ExtractedFact;
      status: VerificationStatus;
      evidence?: EvidenceEntry[];
      contradictions?: EvidenceEntry[];
    }>;
  };
};

class TruthVerificationService {
  /**
   * Verify an entry against existing canonical facts and related entries
   */
  async verifyEntry(userId: string, entryId: string, entry: MemoryEntry): Promise<VerificationResult> {
    try {
      // Try to get cached facts first (FREE - no API call)
      let extractionResult = await factCacheService.getCachedFactsForEntry(userId, entryId);
      
      // If not cached, use rule-based extraction (FREE - no API call)
      if (!extractionResult) {
        extractionResult = await ruleBasedFactExtractionService.extractFacts(entry.content);
        
        // Cache the extracted facts for future use
        await factCacheService.cacheFacts(entry.content, extractionResult);
        
        // Also store facts in fact_claims table for this entry
        if (extractionResult.facts.length > 0) {
          const factClaims = extractionResult.facts.map(fact => ({
            user_id: userId,
            entry_id: entryId,
            claim_type: fact.claim_type,
            subject: fact.subject,
            attribute: fact.attribute,
            value: fact.value,
            confidence: fact.confidence,
            metadata: { context: fact.context }
          }));

          await supabaseAdmin
            .from('fact_claims')
            .upsert(factClaims, {
              onConflict: 'user_id,entry_id,subject,attribute,value'
            })
            .catch(err => logger.debug({ error: err }, 'Failed to store fact claims'));
        }
      }
      
      const extractedFacts = extractionResult.facts;

      if (extractedFacts.length === 0) {
        return {
          status: 'unverified',
          confidence_score: 0.5,
          evidence_count: 0,
          contradiction_count: 0,
          supporting_entries: [],
          contradicting_entries: [],
          extracted_facts: [],
          verification_report: {
            facts_checked: 0,
            facts_verified: 0,
            facts_contradicted: 0,
            facts_unverified: 0,
            details: []
          }
        };
      }

      // Get related entries for comparison
      const relatedEntries = await this.findRelatedEntries(userId, entry, extractedFacts);

      // Verify each fact
      const factVerifications = await Promise.all(
        extractedFacts.map(fact => this.verifyFact(userId, fact, relatedEntries, entryId))
      );

      // Aggregate results
      const verifiedCount = factVerifications.filter(v => v.status === 'verified').length;
      const contradictedCount = factVerifications.filter(v => v.status === 'contradicted').length;
      const ambiguousCount = factVerifications.filter(v => v.status === 'ambiguous').length;

      // Determine overall status
      let overallStatus: VerificationStatus = 'unverified';
      if (contradictedCount > 0) {
        overallStatus = 'contradicted';
      } else if (ambiguousCount > 0 && verifiedCount === 0) {
        overallStatus = 'ambiguous';
      } else if (verifiedCount > 0) {
        overallStatus = 'verified';
      }

      // Collect all supporting and contradicting entries
      const supportingEntries = new Map<string, EvidenceEntry>();
      const contradictingEntries = new Map<string, EvidenceEntry>();

      factVerifications.forEach(verification => {
        verification.evidence?.forEach(evidence => {
          supportingEntries.set(evidence.entry_id, evidence);
        });
        verification.contradictions?.forEach(contradiction => {
          contradictingEntries.set(contradiction.entry_id, contradiction);
        });
      });

      const confidenceScore = this.calculateConfidenceScore(factVerifications, extractedFacts.length);

      return {
        status: overallStatus,
        confidence_score: confidenceScore,
        evidence_count: supportingEntries.size,
        contradiction_count: contradictingEntries.size,
        supporting_entries: Array.from(supportingEntries.values()),
        contradicting_entries: Array.from(contradictingEntries.values()),
        extracted_facts: extractedFacts,
        verification_report: {
          facts_checked: extractedFacts.length,
          facts_verified: verifiedCount,
          facts_contradicted: contradictedCount,
          facts_unverified: extractedFacts.length - verifiedCount - contradictedCount - ambiguousCount,
          details: factVerifications.map((v, i) => ({
            fact: extractedFacts[i],
            status: v.status,
            evidence: v.evidence,
            contradictions: v.contradictions
          }))
        }
      };
    } catch (error) {
      logger.error({ error, entryId }, 'Failed to verify entry');
      return {
        status: 'unverified',
        confidence_score: 0,
        evidence_count: 0,
        contradiction_count: 0,
        supporting_entries: [],
        contradicting_entries: [],
        extracted_facts: [],
        verification_report: {
          facts_checked: 0,
          facts_verified: 0,
          facts_contradicted: 0,
          facts_unverified: 0,
          details: []
        }
      };
    }
  }

  /**
   * Verify a single fact against related entries
   */
  private async verifyFact(
    userId: string,
    fact: ExtractedFact,
    relatedEntries: MemoryEntry[],
    currentEntryId: string
  ): Promise<{
    status: VerificationStatus;
    evidence?: EvidenceEntry[];
    contradictions?: EvidenceEntry[];
  }> {
    const evidence: EvidenceEntry[] = [];
    const contradictions: EvidenceEntry[] = [];

    // Get cached facts for all related entries (FREE - database queries only)
    // Track which facts belong to which entries
    const entryFactsMap = new Map<string, ExtractedFact[]>();
    
    for (const entry of relatedEntries) {
      if (entry.id === currentEntryId) continue;

      // Try cached facts first (FREE)
      let relatedFactsResult = await factCacheService.getCachedFactsForEntry(userId, entry.id);
      
      // If not cached, try content hash cache (FREE)
      if (!relatedFactsResult) {
        relatedFactsResult = await factCacheService.getCachedFacts(entry.content);
      }
      
      // If still not cached, use rule-based extraction (FREE - no API call)
      if (!relatedFactsResult) {
        relatedFactsResult = await ruleBasedFactExtractionService.extractFacts(entry.content);
        
        // Cache for future use
        await factCacheService.cacheFacts(entry.content, relatedFactsResult);
        
        // Store in fact_claims table
        if (relatedFactsResult.facts.length > 0) {
          const factClaims = relatedFactsResult.facts.map(f => ({
            user_id: userId,
            entry_id: entry.id,
            claim_type: f.claim_type,
            subject: f.subject,
            attribute: f.attribute,
            value: f.value,
            confidence: f.confidence,
            metadata: { context: f.context }
          }));

          await supabaseAdmin
            .from('fact_claims')
            .upsert(factClaims, {
              onConflict: 'user_id,entry_id,subject,attribute,value'
            })
            .catch(err => logger.debug({ error: err }, 'Failed to store fact claims'));
        }
      }
      
      // Store facts for this entry
      entryFactsMap.set(entry.id, relatedFactsResult.facts);
    }

    // Collect all facts for efficient operations
    const allRelatedFacts: ExtractedFact[] = [];
    entryFactsMap.forEach(facts => allRelatedFacts.push(...facts));

    // Find supporting evidence using boolean logic (FAST - O(n))
    for (const [entryId, entryFacts] of entryFactsMap) {
      const supportingFact = BooleanContradiction.isSupportedBy(fact, entryFacts);
      if (supportingFact) {
        const entry = relatedEntries.find(e => e.id === entryId);
        if (entry) {
          evidence.push({
            entry_id: entry.id,
            entry_date: entry.date,
            content_snippet: entry.content.substring(0, 200),
            similarity_score: supportingFact.confidence
          });
        }
      }
    }

    // Find contradictions using boolean logic (FAST - O(n))
    for (const [entryId, entryFacts] of entryFactsMap) {
      const contradictingFact = BooleanContradiction.contradictsAny(fact, entryFacts);
      if (contradictingFact) {
        const entry = relatedEntries.find(e => e.id === entryId);
        if (entry) {
          contradictions.push({
            entry_id: entry.id,
            entry_date: entry.date,
            content_snippet: entry.content.substring(0, 200),
            similarity_score: contradictingFact.confidence
          });
        }
      }
    }

    // Also check database for existing facts (FREE - database query)
    const { data: existingFacts } = await supabaseAdmin
      .from('fact_claims')
      .select('*')
      .eq('user_id', userId)
      .eq('subject', fact.subject)
      .eq('attribute', fact.attribute)
      .neq('entry_id', currentEntryId);

    if (existingFacts && existingFacts.length > 0) {
      for (const existingFact of existingFacts) {
        const existingFactObj: ExtractedFact = {
          claim_type: existingFact.claim_type as any,
          subject: existingFact.subject,
          attribute: existingFact.attribute,
          value: existingFact.value,
          confidence: existingFact.confidence
        };

        // Check for support
        if (BooleanContradiction.supports(existingFactObj, fact)) {
          const { data: entry } = await supabaseAdmin
            .from('journal_entries')
            .select('id, date, content')
            .eq('id', existingFact.entry_id)
            .single();

          if (entry) {
            evidence.push({
              entry_id: entry.id,
              entry_date: entry.date,
              content_snippet: entry.content.substring(0, 200),
              similarity_score: existingFact.confidence
            });
          }
        }

        // Check for contradiction
        if (BooleanContradiction.contradicts(existingFactObj, fact)) {
          const { data: entry } = await supabaseAdmin
            .from('journal_entries')
            .select('id, date, content')
            .eq('id', existingFact.entry_id)
            .single();

          if (entry) {
            contradictions.push({
              entry_id: entry.id,
              entry_date: entry.date,
              content_snippet: entry.content.substring(0, 200),
              similarity_score: existingFact.confidence
            });
          }
        }
      }
    }

    // Determine status
    let status: VerificationStatus = 'unverified';
    if (contradictions.length > 0 && evidence.length === 0) {
      status = 'contradicted';
    } else if (contradictions.length > 0 && evidence.length > 0) {
      status = 'ambiguous';
    } else if (evidence.length > 0) {
      status = 'verified';
    }

    return {
      status,
      evidence: evidence.length > 0 ? evidence : undefined,
      contradictions: contradictions.length > 0 ? contradictions : undefined
    };
  }

  /**
   * Find related entries for comparison
   */
  private async findRelatedEntries(
    userId: string,
    entry: MemoryEntry,
    extractedFacts: ExtractedFact[]
  ): Promise<MemoryEntry[]> {
    try {
      // Get entries from similar time period (±30 days)
      const entryDate = new Date(entry.date);
      const fromDate = new Date(entryDate);
      fromDate.setDate(fromDate.getDate() - 30);
      const toDate = new Date(entryDate);
      toDate.setDate(toDate.getDate() + 30);

      const relatedEntries = await memoryService.searchEntries(userId, {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        limit: 50
      });

      // Also search for entries mentioning the same subjects
      const subjects = new Set(extractedFacts.map(f => f.subject.toLowerCase()));
      const subjectEntries = await Promise.all(
        Array.from(subjects).slice(0, 5).map(subject =>
          memoryService.searchEntries(userId, {
            search: subject,
            limit: 20
          })
        )
      );

      // Combine and deduplicate
      const allEntries = [...relatedEntries, ...subjectEntries.flat()];
      const uniqueEntries = new Map<string, MemoryEntry>();
      allEntries.forEach(e => {
        if (e.id !== entry.id) {
          uniqueEntries.set(e.id, e);
        }
      });

      return Array.from(uniqueEntries.values()).slice(0, 50);
    } catch (error) {
      logger.error({ error }, 'Failed to find related entries');
      return [];
    }
  }

  /**
   * Check if two fact values match (with fuzzy matching for dates/locations)
   */
  private valuesMatch(value1: string, value2: string): boolean {
    const v1 = value1.toLowerCase().trim();
    const v2 = value2.toLowerCase().trim();

    // Exact match
    if (v1 === v2) return true;

    // Date matching (allow some flexibility)
    if (this.isDate(v1) && this.isDate(v2)) {
      const d1 = new Date(v1);
      const d2 = new Date(v2);
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        const daysDiff = Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff <= 1; // Allow 1 day difference
      }
    }

    // Location matching (fuzzy)
    if (v1.includes(v2) || v2.includes(v1)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a string looks like a date
   */
  private isDate(str: string): boolean {
    return !isNaN(Date.parse(str));
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidenceScore(
    verifications: Array<{ status: VerificationStatus }>,
    totalFacts: number
  ): number {
    if (totalFacts === 0) return 0;

    let score = 0;
    verifications.forEach(v => {
      switch (v.status) {
        case 'verified':
          score += 1;
          break;
        case 'unverified':
          score += 0.5;
          break;
        case 'ambiguous':
          score += 0.3;
          break;
        case 'contradicted':
          score += 0;
          break;
      }
    });

    return score / totalFacts;
  }

  /**
   * Store verification result in database
   */
  async storeVerification(
    userId: string,
    entryId: string,
    result: VerificationResult
  ): Promise<void> {
    try {
      // Store fact claims
      if (result.extracted_facts.length > 0) {
        const factClaims = result.extracted_facts.map(fact => ({
          user_id: userId,
          entry_id: entryId,
          claim_type: fact.claim_type,
          subject: fact.subject,
          attribute: fact.attribute,
          value: fact.value,
          confidence: fact.confidence,
          metadata: { context: fact.context }
        }));

        await supabaseAdmin.from('fact_claims').upsert(factClaims, {
          onConflict: 'user_id,entry_id,subject,attribute,value'
        });
      }

      // Store entry verification
      await supabaseAdmin.from('entry_verifications').upsert({
        user_id: userId,
        entry_id: entryId,
        verification_status: result.status,
        verified_by: 'system',
        confidence_score: result.confidence_score,
        evidence_count: result.evidence_count,
        contradiction_count: result.contradiction_count,
        supporting_entries: result.supporting_entries.map(e => e.entry_id),
        contradicting_entries: result.contradicting_entries.map(e => e.entry_id),
        verification_report: result.verification_report,
        resolved: false
      }, {
        onConflict: 'user_id,entry_id'
      });

      // Update entry verification status
      await supabaseAdmin
        .from('journal_entries')
        .update({ verification_status: result.status })
        .eq('id', entryId)
        .eq('user_id', userId);
    } catch (error) {
      logger.error({ error, entryId }, 'Failed to store verification result');
    }
  }
}

export const truthVerificationService = new TruthVerificationService();

