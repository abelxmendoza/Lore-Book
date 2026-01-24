/**
 * Consent Tracking Service
 * 
 * Tracks consent from subjects mentioned in journal entries:
 * - Inclusion consent (can be mentioned)
 * - Publication consent (can be published)
 * - Sensitive content consent
 * - Quotes consent
 * - Photo consent
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type ConsentType = 'inclusion' | 'publication' | 'sensitive_content' | 'quotes' | 'photos';
export type ConsentStatus = 'granted' | 'denied' | 'pending' | 'revoked' | 'expired';

export interface ConsentRecord {
  id: string;
  user_id: string;
  subject_entity_id?: string;
  subject_name: string;
  consent_type: ConsentType;
  consent_status: ConsentStatus;
  consent_date?: string;
  expiration_date?: string;
  conditions?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

class ConsentTrackingService {
  /**
   * Create or update a consent record
   */
  async recordConsent(
    userId: string,
    subjectName: string,
    consentType: ConsentType,
    status: ConsentStatus,
    options?: {
      subjectEntityId?: string;
      consentDate?: string;
      expirationDate?: string;
      conditions?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ConsentRecord> {
    try {
      // Check for existing consent
      const existing = await this.getConsent(
        userId,
        subjectName,
        consentType
      );

      const record: Partial<ConsentRecord> = {
        user_id: userId,
        subject_name: subjectName,
        consent_type: consentType,
        consent_status: status,
        consent_date: options?.consentDate || (status === 'granted' ? new Date().toISOString() : undefined),
        expiration_date: options?.expirationDate,
        conditions: options?.conditions,
        metadata: options?.metadata || {},
        updated_at: new Date().toISOString(),
      };

      if (options?.subjectEntityId) {
        record.subject_entity_id = options.subjectEntityId;
      }

      let result;
      if (existing) {
        // Update existing
        const { data, error } = await supabaseAdmin
          .from('consent_records')
          .update(record)
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Create new
        const { data, error } = await supabaseAdmin
          .from('consent_records')
          .insert(record)
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return result as ConsentRecord;
    } catch (error) {
      logger.error({ err: error, userId, subjectName, consentType }, 'Failed to record consent');
      throw error;
    }
  }

  /**
   * Get consent for a subject and type
   */
  async getConsent(
    userId: string,
    subjectName: string,
    consentType: ConsentType
  ): Promise<ConsentRecord | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('consent_records')
        .select('*')
        .eq('user_id', userId)
        .eq('subject_name', subjectName)
        .eq('consent_type', consentType)
        .in('consent_status', ['granted', 'pending'])
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      // Check expiration
      if (data.expiration_date) {
        const expiration = new Date(data.expiration_date);
        if (expiration < new Date()) {
          // Consent expired
          await this.recordConsent(userId, subjectName, consentType, 'expired');
          return null;
        }
      }

      return data as ConsentRecord;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get consent');
      return null;
    }
  }

  /**
   * Check if entry can be published based on consent
   */
  async canPublishEntry(
    userId: string,
    entryId: string
  ): Promise<{
    can_publish: boolean;
    missing_consents: Array<{ subject: string; consent_type: ConsentType }>;
    warnings: string[];
  }> {
    try {
      // Get entry and extract mentioned entities
      const { data: entry, error: entryError } = await supabaseAdmin
        .from('journal_entries')
        .select('content, metadata')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (entryError || !entry) {
        return {
          can_publish: false,
          missing_consents: [],
          warnings: ['Entry not found'],
        };
      }

      // Extract character names from entry (simplified - would use entity extraction)
      const characterNames = this.extractCharacterNames(entry.content);

      const missingConsents: Array<{ subject: string; consent_type: ConsentType }> = [];
      const warnings: string[] = [];

      for (const name of characterNames) {
        // Check publication consent
        const publicationConsent = await this.getConsent(userId, name, 'publication');
        if (!publicationConsent) {
          missingConsents.push({ subject: name, consent_type: 'publication' });
        } else if (publicationConsent.consent_status === 'pending') {
          warnings.push(`${name} has pending consent for publication`);
        }

        // Check for sensitive content
        if (this.containsSensitiveContent(entry.content)) {
          const sensitiveConsent = await this.getConsent(userId, name, 'sensitive_content');
          if (!sensitiveConsent) {
            missingConsents.push({ subject: name, consent_type: 'sensitive_content' });
          }
        }
      }

      return {
        can_publish: missingConsents.length === 0,
        missing_consents: missingConsents,
        warnings,
      };
    } catch (error) {
      logger.error({ err: error, userId, entryId }, 'Failed to check publication consent');
      return {
        can_publish: false,
        missing_consents: [],
        warnings: ['Error checking consent'],
      };
    }
  }

  /**
   * Extract character names from entry (simplified)
   */
  private extractCharacterNames(content: string): string[] {
    // This is simplified - would use proper entity extraction
    const names: string[] = [];
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    const matches = content.match(namePattern);
    
    if (matches) {
      // Filter out common words
      const commonWords = ['I', 'The', 'This', 'That', 'There', 'Today', 'Yesterday'];
      names.push(...matches.filter(name => !commonWords.includes(name)));
    }

    return [...new Set(names)]; // Remove duplicates
  }

  /**
   * Check if content contains sensitive information
   */
  private containsSensitiveContent(content: string): boolean {
    const sensitivePatterns = [
      /(diagnosis|illness|disease|medical)/gi,
      /(divorce|separation|affair)/gi,
      /(salary|income|debt|financial)/gi,
      /(trauma|abuse|violence)/gi,
    ];

    return sensitivePatterns.some(pattern => pattern.test(content));
  }

  /**
   * Get all consent records for a user
   */
  async getUserConsents(
    userId: string,
    status?: ConsentStatus
  ): Promise<ConsentRecord[]> {
    try {
      let query = supabaseAdmin
        .from('consent_records')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (status) {
        query = query.eq('consent_status', status);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []) as ConsentRecord[];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get user consents');
      return [];
    }
  }

  /**
   * Revoke consent
   */
  async revokeConsent(
    userId: string,
    consentId: string
  ): Promise<ConsentRecord> {
    try {
      const { data, error } = await supabaseAdmin
        .from('consent_records')
        .update({
          consent_status: 'revoked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', consentId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as ConsentRecord;
    } catch (error) {
      logger.error({ err: error }, 'Failed to revoke consent');
      throw error;
    }
  }
}

export const consentTrackingService = new ConsentTrackingService();
