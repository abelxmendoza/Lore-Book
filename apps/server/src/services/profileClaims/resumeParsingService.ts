import { logger } from '../../logger';
import { profileClaimsService, type CreateClaimInput, type ClaimType } from './profileClaimsService';
import OpenAI from 'openai';
import { config } from '../../config';
import { supabaseAdmin } from '../supabaseClient';
import { randomUUID } from 'crypto';

const openai = new OpenAI({ apiKey: config.openAiKey });

export interface ResumeDocument {
  id: string;
  user_id: string;
  file_name: string;
  file_type: 'pdf' | 'doc' | 'docx' | 'txt';
  file_size: number;
  file_url: string | null;
  raw_text: string | null;
  parsed_data: Record<string, unknown>;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error: string | null;
  claims_generated: number;
  claims_confirmed: number;
  metadata: Record<string, unknown>;
  uploaded_at: string;
  processed_at: string | null;
}

export interface ExtractedClaim {
  claim_type: ClaimType;
  claim_text: string;
  confidence: number;
  context?: string;
}

/**
 * Resume Parsing Service
 * Parses resume documents and extracts profile claims
 */
class ResumeParsingService {
  /**
   * Extract text from a file buffer
   * Currently supports TXT. PDF/DOC support can be added later with libraries like pdf-parse, mammoth
   */
  async extractTextFromFile(
    fileBuffer: Buffer,
    fileType: 'pdf' | 'doc' | 'docx' | 'txt'
  ): Promise<string> {
    try {
      if (fileType === 'txt') {
        return fileBuffer.toString('utf-8');
      }

      // TODO: Add PDF/DOC parsing
      // For now, throw error for unsupported types
      if (fileType === 'pdf') {
        throw new Error('PDF parsing not yet implemented. Please convert to TXT first.');
      }
      if (fileType === 'doc' || fileType === 'docx') {
        throw new Error('DOC/DOCX parsing not yet implemented. Please convert to TXT first.');
      }

      throw new Error(`Unsupported file type: ${fileType}`);
    } catch (error) {
      logger.error({ error, fileType }, 'Failed to extract text from file');
      throw error;
    }
  }

  /**
   * Extract claims from resume text using AI
   */
  async extractClaimsFromResume(resumeText: string): Promise<ExtractedClaim[]> {
    try {
      const prompt = `Analyze this resume and extract all professional claims. 

Return a JSON object with a "claims" array. Each claim should have:
- claim_type: One of: role, skill, experience, achievement, education, certification, project
- claim_text: The actual claim (e.g., "3 years React experience", "Senior Software Engineer at Google", "BJJ Blue Belt", "Bachelor's in Computer Science")
- confidence: 0.0-1.0 (how confident you are this is a valid claim)
- context: Optional brief context

Extract:
- Job roles and titles with companies
- Skills and technologies
- Years of experience for specific skills/roles
- Education degrees and institutions
- Certifications
- Notable achievements or projects
- Any other professional claims

Return ONLY valid JSON object with "claims" array, no other text.

Resume text:
${resumeText.substring(0, 4000)}`;

      const response = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a resume parsing system. Extract professional claims from resumes. Return only valid JSON objects with a "claims" array.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      const claims = Array.isArray(result.claims) ? result.claims : [];

      // Filter by confidence threshold
      return claims
        .filter((c: ExtractedClaim) => c.confidence >= 0.5)
        .map((c: ExtractedClaim) => ({
          ...c,
          claim_type: this.normalizeClaimType(c.claim_type)
        }));
    } catch (error) {
      logger.error({ error }, 'Failed to extract claims from resume');
      throw error;
    }
  }

  /**
   * Normalize claim type
   */
  private normalizeClaimType(type: string): ClaimType {
    const normalized = type.toLowerCase().trim();
    const validTypes: ClaimType[] = ['role', 'skill', 'experience', 'achievement', 'education', 'certification', 'project'];
    
    if (validTypes.includes(normalized as ClaimType)) {
      return normalized as ClaimType;
    }

    // Map common variations
    const mapping: Record<string, ClaimType> = {
      'job': 'role',
      'position': 'role',
      'work': 'role',
      'employment': 'role',
      'technology': 'skill',
      'tech': 'skill',
      'tool': 'skill',
      'years': 'experience',
      'exp': 'experience',
      'degree': 'education',
      'school': 'education',
      'university': 'education',
      'cert': 'certification',
      'license': 'certification'
    };

    return mapping[normalized] || 'skill'; // Default to skill
  }

  /**
   * Create a resume document record
   */
  async createResumeDocument(
    userId: string,
    fileData: {
      fileName: string;
      fileType: 'pdf' | 'doc' | 'docx' | 'txt';
      fileSize: number;
      fileUrl?: string | null;
    }
  ): Promise<ResumeDocument> {
    try {
      const document: ResumeDocument = {
        id: randomUUID(),
        user_id: userId,
        file_name: fileData.fileName,
        file_type: fileData.fileType,
        file_size: fileData.fileSize,
        file_url: fileData.fileUrl ?? null,
        raw_text: null,
        parsed_data: {},
        processing_status: 'pending',
        processing_error: null,
        claims_generated: 0,
        claims_confirmed: 0,
        metadata: {},
        uploaded_at: new Date().toISOString(),
        processed_at: null
      };

      const { error } = await supabaseAdmin
        .from('resume_documents')
        .insert(document);

      if (error) {
        logger.error({ error, userId }, 'Failed to create resume document');
        throw error;
      }

      logger.info({ userId, documentId: document.id }, 'Resume document created');
      return document;
    } catch (error) {
      logger.error({ error, userId }, 'Error creating resume document');
      throw error;
    }
  }

  /**
   * Process a resume file and extract claims
   */
  async processResume(
    userId: string,
    fileBuffer: Buffer,
    fileData: {
      fileName: string;
      fileType: 'pdf' | 'doc' | 'docx' | 'txt';
      fileSize: number;
      fileUrl?: string | null;
    }
  ): Promise<{ document: ResumeDocument; claims: CreateClaimInput[] }> {
    try {
      // Create document record
      const document = await this.createResumeDocument(userId, fileData);

      // Update status to processing
      await this.updateDocumentStatus(document.id, 'processing');

      try {
        // Extract text
        const rawText = await this.extractTextFromFile(fileBuffer, fileData.fileType);

        // Extract claims
        const extractedClaims = await this.extractClaimsFromResume(rawText);

        // Convert to CreateClaimInput format
        const claims: CreateClaimInput[] = extractedClaims.map((claim) => ({
          claim_type: claim.claim_type,
          claim_text: claim.claim_text,
          source: 'resume',
          source_id: document.id,
          source_detail: `Resume: ${fileData.fileName}`,
          confidence: claim.confidence,
          metadata: {
            context: claim.context,
            extracted_at: new Date().toISOString()
          }
        }));

        // Update document with parsed data
        await supabaseAdmin
          .from('resume_documents')
          .update({
            raw_text: rawText,
            parsed_data: {
              claims_extracted: extractedClaims,
              claim_count: claims.length
            },
            processing_status: 'completed',
            claims_generated: claims.length,
            processed_at: new Date().toISOString()
          })
          .eq('id', document.id);

        logger.info({ userId, documentId: document.id, claimCount: claims.length }, 'Resume processed successfully');

        return {
          document: {
            ...document,
            raw_text: rawText,
            parsed_data: { claims_extracted: extractedClaims, claim_count: claims.length },
            processing_status: 'completed',
            claims_generated: claims.length,
            processed_at: new Date().toISOString()
          },
          claims
        };
      } catch (processingError) {
        // Update document with error
        await this.updateDocumentStatus(
          document.id,
          'failed',
          processingError instanceof Error ? processingError.message : 'Unknown error'
        );
        throw processingError;
      }
    } catch (error) {
      logger.error({ error, userId }, 'Error processing resume');
      throw error;
    }
  }

  /**
   * Update document processing status
   */
  private async updateDocumentStatus(
    documentId: string,
    status: ResumeDocument['processing_status'],
    error?: string | null
  ): Promise<void> {
    try {
      const updateData: Partial<ResumeDocument> = {
        processing_status: status,
        processing_error: error ?? null
      };

      if (status === 'completed') {
        updateData.processed_at = new Date().toISOString();
      }

      const { error: updateError } = await supabaseAdmin
        .from('resume_documents')
        .update(updateData)
        .eq('id', documentId);

      if (updateError) {
        logger.error({ error: updateError, documentId }, 'Failed to update document status');
        throw updateError;
      }
    } catch (error) {
      logger.error({ error, documentId }, 'Error updating document status');
      throw error;
    }
  }

  /**
   * Get resume documents for a user
   */
  async getResumeDocuments(userId: string): Promise<ResumeDocument[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('resume_documents')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to get resume documents');
        throw error;
      }

      return (data ?? []) as ResumeDocument[];
    } catch (error) {
      logger.error({ error, userId }, 'Error getting resume documents');
      throw error;
    }
  }

  /**
   * Get a single resume document
   */
  async getResumeDocument(userId: string, documentId: string): Promise<ResumeDocument | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('resume_documents')
        .select('*')
        .eq('user_id', userId)
        .eq('id', documentId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        logger.error({ error, userId, documentId }, 'Failed to get resume document');
        throw error;
      }

      return data as ResumeDocument;
    } catch (error) {
      logger.error({ error, userId, documentId }, 'Error getting resume document');
      throw error;
    }
  }
}

export const resumeParsingService = new ResumeParsingService();
