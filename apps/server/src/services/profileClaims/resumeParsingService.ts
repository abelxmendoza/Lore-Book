import { randomUUID } from 'crypto';
import { openai } from '../openaiClient';

import { config } from '../../config';
import { extractTextFromBuffer } from '../../lib/fileTextExtractor';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { profileClaimsService, type CreateClaimInput, type ClaimType } from './profileClaimsService';
import { detectEmploymentGaps } from './resumeLorePopulationService';
import { mergeParsedResume, parseResumeHeuristics } from './resumeHeuristicParser';
import type { ParsedResume, ResumeSection } from './resumeStructuredTypes';



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
  /** Resume section the claim came from — provenance for review UI. */
  section?: ResumeSection;
}

export type { ParsedResume } from './resumeStructuredTypes';

/**
 * Resume Parsing Service
 * Parses resume documents and extracts profile claims
 */
class ResumeParsingService {
  /**
   * Extract text from a file buffer (delegates to shared fileTextExtractor).
   */
  async extractTextFromFile(
    fileBuffer: Buffer,
    fileType: 'pdf' | 'doc' | 'docx' | 'txt'
  ): Promise<string> {
    return extractTextFromBuffer(fileBuffer, fileType);
  }

  /**
   * Process resume from already-extracted text (unified ingestion path).
   */
  async processResumeFromText(
    userId: string,
    rawText: string,
    fileData: {
      fileName: string;
      fileType: 'pdf' | 'doc' | 'docx' | 'txt';
      fileSize: number;
      sourceFileId?: string;
    }
  ): Promise<{ document: ResumeDocument; claims: CreateClaimInput[]; structured: ParsedResume }> {
    const document = await this.createResumeDocument(userId, fileData);

    await this.updateDocumentStatus(document.id, 'processing');

    try {
      const structured = await this.extractStructuredResume(rawText);
      structured.employmentGaps = detectEmploymentGaps(structured.employment);

      const extractedClaims = this.claimsFromStructured(structured);
      const claims: CreateClaimInput[] = extractedClaims.map((claim) => ({
        claim_type: claim.claim_type,
        claim_text: claim.claim_text,
        source: 'resume',
        source_id: document.id,
        source_detail: `Resume: ${fileData.fileName}`,
        confidence: claim.confidence,
        metadata: {
          context: claim.context,
          section: claim.section,
          quote: claim.context ?? claim.claim_text,
          extracted_at: new Date().toISOString(),
          ...(fileData.sourceFileId ? { source_file_id: fileData.sourceFileId } : {}),
        },
      }));

      await supabaseAdmin
        .from('resume_documents')
        .update({
          raw_text: rawText,
          parsed_data: {
            structured,
            claims_extracted: extractedClaims,
            claim_count: claims.length,
            source_file_id: fileData.sourceFileId,
          },
          processing_status: 'completed',
          claims_generated: claims.length,
          processed_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      return {
        document: {
          ...document,
          raw_text: rawText,
          parsed_data: {
            structured,
            claims_extracted: extractedClaims,
            claim_count: claims.length,
          },
          processing_status: 'completed',
          claims_generated: claims.length,
          processed_at: new Date().toISOString(),
        },
        claims,
        structured,
      };
    } catch (processingError) {
      await this.updateDocumentStatus(
        document.id,
        'failed',
        processingError instanceof Error ? processingError.message : 'Unknown error'
      );
      throw processingError;
    }
  }

  /**
   * Extract structured resume data using AI.
   */
  async extractStructuredResume(resumeText: string): Promise<ParsedResume> {
    const prompt = `Parse this resume into structured JSON. Extract ALL of the following:

{
  "contact": {
    "fullName": "string or null",
    "email": "string or null",
    "phone": "string or null",
    "address": "string or null",
    "website": "string or null",
    "linkedin": "string or null"
  },
  "summary": "professional summary or null",
  "employment": [
    {
      "company": "string",
      "title": "string",
      "location": "string or null",
      "startDate": "YYYY-MM or YYYY-MM-DD or YYYY",
      "endDate": "YYYY-MM or YYYY-MM-DD or null if current",
      "isCurrent": boolean,
      "description": "string or null"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string or null",
      "field": "string or null",
      "startDate": "string or null",
      "endDate": "string or null",
      "gpa": "string or null"
    }
  ],
  "skills": ["skill1", "skill2"],
  "projects": [
    {
      "name": "string",
      "description": "string or null",
      "technologies": ["tech"],
      "startDate": "string or null",
      "endDate": "string or null",
      "url": "string or null"
    }
  ],
  "certifications": [
    { "name": "string", "issuer": "string or null", "date": "string or null" }
  ],
  "languages": ["spoken/written human languages, e.g. English, Spanish"],
  "careerTargets": ["target industries or focus areas from the summary, e.g. robotics, aerospace, defense, embedded autonomy"]
}

Rules:
- List employment in reverse chronological order as on the resume.
- Use ISO-like dates when possible.
- Extract every job, school, skill, project, and contact field you can find.
- Return ONLY valid JSON matching this shape.

Resume:
${resumeText.substring(0, 12000)}`;

    try {
      const response = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a resume parser. Return only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const raw = JSON.parse(response.choices[0].message.content || '{}');
      const llmParsed: ParsedResume = {
        contact: raw.contact ?? {},
        summary: raw.summary ?? undefined,
        employment: Array.isArray(raw.employment) ? raw.employment : [],
        education: Array.isArray(raw.education) ? raw.education : [],
        skills: Array.isArray(raw.skills) ? raw.skills : [],
        projects: Array.isArray(raw.projects) ? raw.projects : [],
        certifications: Array.isArray(raw.certifications) ? raw.certifications : [],
        employmentGaps: [],
        languages: Array.isArray(raw.languages) ? raw.languages : [],
        careerTargets: Array.isArray(raw.careerTargets) ? raw.careerTargets : [],
      };
      const heuristics = parseResumeHeuristics(resumeText);
      return mergeParsedResume(llmParsed, heuristics);
    } catch (error) {
      logger.error({ error }, 'Structured resume parse failed, falling back to heuristics');
      const heuristics = parseResumeHeuristics(resumeText);
      if (heuristics.employment.length > 0 || heuristics.skills.length > 0) {
        return heuristics;
      }
      const claims = await this.extractClaimsFromResume(resumeText);
      return this.structuredFromClaims(claims);
    }
  }

  private structuredFromClaims(claims: ExtractedClaim[]): ParsedResume {
    return {
      contact: {},
      employment: claims
        .filter((c) => c.claim_type === 'role')
        .map((c) => ({ company: c.context ?? 'Unknown', title: c.claim_text, description: c.context })),
      education: claims
        .filter((c) => c.claim_type === 'education')
        .map((c) => ({ institution: c.claim_text })),
      skills: claims.filter((c) => c.claim_type === 'skill').map((c) => c.claim_text),
      projects: claims
        .filter((c) => c.claim_type === 'project')
        .map((c) => ({ name: c.claim_text })),
      certifications: claims
        .filter((c) => c.claim_type === 'certification')
        .map((c) => ({ name: c.claim_text })),
      employmentGaps: [],
      languages: [],
      careerTargets: [],
    };
  }

  claimsFromStructured(structured: ParsedResume): ExtractedClaim[] {
    const claims: ExtractedClaim[] = [];

    for (const job of structured.employment) {
      const text = `${job.title} at ${job.company}`;
      const dates = [job.startDate, job.endDate ?? (job.isCurrent ? 'Present' : null)].filter(Boolean).join(' – ');
      claims.push({
        claim_type: 'role',
        claim_text: text,
        confidence: 0.9,
        context: dates || job.description,
        section: 'employment',
      });
    }
    for (const edu of structured.education) {
      claims.push({
        claim_type: 'education',
        claim_text: [edu.degree, edu.field, edu.institution].filter(Boolean).join(' — '),
        confidence: 0.88,
        context: [edu.startDate, edu.endDate].filter(Boolean).join(' – ') || undefined,
        section: 'education',
      });
    }
    for (const skill of structured.skills) {
      claims.push({
        claim_type: 'skill',
        claim_text: skill,
        confidence: 0.85,
        section: 'skills',
      });
    }
    for (const project of structured.projects) {
      claims.push({
        claim_type: 'project',
        claim_text: project.name,
        confidence: 0.85,
        context: project.description,
        section: 'projects',
      });
    }
    for (const cert of structured.certifications) {
      claims.push({
        claim_type: 'certification',
        claim_text: cert.name,
        confidence: 0.85,
        context: cert.issuer,
        section: 'certifications',
      });
    }
    for (const language of structured.languages) {
      claims.push({
        claim_type: 'skill',
        claim_text: `Language: ${language}`,
        confidence: 0.85,
        section: 'languages',
      });
    }
    for (const target of structured.careerTargets) {
      claims.push({
        claim_type: 'experience',
        claim_text: `Career target: ${target}`,
        confidence: 0.75,
        section: 'summary',
      });
    }
    if (structured.contact.email) {
      claims.push({
        claim_type: 'experience',
        claim_text: `Email: ${structured.contact.email}`,
        confidence: 0.95,
        section: 'header',
      });
    }

    return claims.filter((c) => c.claim_text?.trim());
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
        model: config.defaultModel || 'gpt-5.4-mini',
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
      sourceFileId?: string;
    }
  ): Promise<{ document: ResumeDocument; claims: CreateClaimInput[]; structured: ParsedResume }> {
    const rawText = await this.extractTextFromFile(fileBuffer, fileData.fileType);
    return this.processResumeFromText(userId, rawText, fileData);
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
