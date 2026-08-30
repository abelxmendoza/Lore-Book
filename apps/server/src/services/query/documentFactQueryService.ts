import type {
  ParsedResume,
  ResumeCertification,
  ResumeEducation,
  ResumeEmployment,
  ResumeProject,
} from '../profileClaims/resumeStructuredTypes';
import { supabaseAdmin } from '../supabaseClient';

export type DocumentFactQueryRequest = {
  query: string;
  documentId?: string;
  includePending?: boolean;
  includeEvidence?: boolean;
  limit?: number;
};

export type DocumentFactKind =
  | 'employment'
  | 'education'
  | 'degree'
  | 'skill'
  | 'project'
  | 'certification'
  | 'achievement'
  | 'language'
  | 'summary'
  | 'contact'
  | 'contact'
  | 'claim'
  | 'document_match'
  | 'filename';

export type DocumentFact = {
  kind: DocumentFactKind;
  value: string;
  fieldPath: string;
  documentId: string;
  fileId: string | null;
  filename: string;
  sourceTable: 'resume_documents' | 'profile_claims' | 'original_documents' | 'user_files';
  sourceId: string;
  excerpt: string | null;
  confidence: number | null;
  reviewState: 'confirmed' | 'pending_review' | 'unverified' | 'supported' | 'verified' | 'downgraded' | 'contradicted' | 'completed';
  observedAt: string | null;
  score: number;
};

export type DocumentFactQueryResponse = {
  query: string;
  intent: DocumentFactQueryIntent;
  facts: DocumentFact[];
  total: number;
  warnings: string[];
  diagnostics: {
    resumeDocumentsScanned: number;
    genericDocumentsScanned: number;
    claimsScanned: number;
    elapsedMs: number;
  };
};

export type DocumentFactQueryIntent =
  | 'employment'
  | 'education'
  | 'degree'
  | 'skill'
  | 'project'
  | 'certification'
  | 'achievement'
  | 'language'
  | 'summary'
  | 'contact'
  | 'claim'
  | 'generic_text'
  | 'overview';

type ResumeRow = {
  id: string;
  file_name: string;
  raw_text: string | null;
  parsed_data: Record<string, unknown>;
  processing_status: string;
  uploaded_at: string;
};

type UserFileRow = {
  id: string;
  filename: string;
  ingest_kind: string | null;
  processing_status: string;
  uploaded_at: string;
};

type OriginalDocumentRow = {
  id: string;
  title: string;
  content: string;
  file_name: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type ClaimRow = {
  id: string;
  claim_type: string;
  claim_text: string;
  source_id: string | null;
  verified_status: string;
  confidence: number | null;
  user_confirmed: boolean;
  metadata: Record<string, unknown> | null;
  last_updated_at: string;
};

const MAX_RESUME_DOCUMENTS = 100;
const MAX_GENERIC_DOCUMENTS = 50;
const MAX_CLAIMS = 100;
const DEFAULT_LIMIT = 50;
const QUERY_STOP_WORDS = new Set([
  'a', 'about', 'all', 'and', 'are', 'does', 'for', 'have', 'i', 'in', 'is',
  'it', 'me', 'my', 'of', 'on', 'or', 'say', 'the', 'this', 'to', 'what',
  'which', 'with', 'resume', 'resumes', 'document', 'documents', 'file', 'files',
]);

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function termsFor(query: string): string[] {
  return [...new Set(normalize(query).split(/\s+/).filter((term) => term.length > 2 && !QUERY_STOP_WORDS.has(term)))];
}

function detectIntent(query: string): DocumentFactQueryIntent {
  const text = normalize(query);
  const asksEmployment = /\b(?:job|jobs|work|worked|employment|employer|career|role|roles|position|positions)\b/.test(text);
  const asksEducation = /\b(?:school|schools|college|colleges|university|universities|education|studied|degree|degrees|major)\b/.test(text);
  if (asksEmployment && asksEducation) return 'overview';
  if (asksEmployment) {
    return 'employment';
  }
  if (asksEducation) {
    return /\b(?:degree|degrees|major)\b/.test(text) ? 'degree' : 'education';
  }
  if (/\b(?:skill|skills|technology|technologies|tools|abilities|proficien)\b/.test(text)) return 'skill';
  if (/\b(?:project|projects|portfolio)\b/.test(text)) return 'project';
  if (/\b(?:certification|certifications|certificate|certificates|licensed)\b/.test(text)) return 'certification';
  if (/\b(?:achievement|achievements|award|awards)\b/.test(text)) return 'achievement';
  if (/\b(?:language|languages|speak|spoken)\b/.test(text)) return 'language';
  if (/\b(?:contact|email|phone|telephone|address|linkedin|website)\b/.test(text)) return 'contact';
  if (/\b(?:summary|profile|about me|professional summary)\b/.test(text)) return 'summary';
  if (/\b(?:claim|claims|what do you know about my profile|needs review)\b/.test(text)) return 'claim';
  if (/\b(?:document|documents|file|files|resume|resumes|cv|mention|mentions|say|says|text)\b/.test(text)) {
    return /\b(?:what does|what is in|tell me about|summarize)\b/.test(text) ? 'overview' : 'generic_text';
  }
  return 'generic_text';
}

function asParsedResume(value: unknown): ParsedResume | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ParsedResume>;
  if (!Array.isArray(candidate.employment) || !Array.isArray(candidate.education)) return null;
  return {
    contact: candidate.contact ?? {},
    summary: candidate.summary,
    employment: candidate.employment,
    education: candidate.education,
    skills: Array.isArray(candidate.skills) ? candidate.skills : [],
    projects: Array.isArray(candidate.projects) ? candidate.projects : [],
    certifications: Array.isArray(candidate.certifications) ? candidate.certifications : [],
    employmentGaps: Array.isArray(candidate.employmentGaps) ? candidate.employmentGaps : [],
    languages: Array.isArray(candidate.languages) ? candidate.languages : [],
    careerTargets: Array.isArray(candidate.careerTargets) ? candidate.careerTargets : [],
  };
}

function structuredFrom(row: ResumeRow): ParsedResume | null {
  return asParsedResume(row.parsed_data?.structured ?? row.parsed_data);
}

function excerptFor(rawText: string | null, value: string): string | null {
  if (!rawText || !value) return null;
  const haystack = normalize(rawText);
  const needle = normalize(value).slice(0, 120);
  const index = needle ? haystack.indexOf(needle) : -1;
  if (index < 0) return null;
  const start = Math.max(0, index - 100);
  return rawText.slice(start, start + 320).replace(/\s+/g, ' ').trim();
}

function structuredReviewState(includePending: boolean): DocumentFact['reviewState'] {
  return includePending ? 'pending_review' : 'completed';
}

function addStructuredFact(
  facts: DocumentFact[],
  row: ResumeRow,
  fileId: string | null,
  kind: DocumentFactKind,
  value: string,
  fieldPath: string,
  confidence: number,
  score: number,
  includePending: boolean,
): void {
  const cleanValue = value.trim();
  if (!cleanValue) return;
  facts.push({
    kind,
    value: cleanValue,
    fieldPath,
    documentId: row.id,
    fileId,
    filename: row.file_name,
    sourceTable: 'resume_documents',
    sourceId: row.id,
    excerpt: excerptFor(row.raw_text, cleanValue),
    confidence,
    reviewState: structuredReviewState(includePending),
    observedAt: row.uploaded_at,
    score,
  });
}

function employmentFacts(
  facts: DocumentFact[],
  row: ResumeRow,
  fileId: string | null,
  entries: ResumeEmployment[],
  includePending: boolean,
): void {
  entries.forEach((entry, index) => {
    const label = [entry.title, entry.company, entry.location].filter(Boolean).join(' at ');
    addStructuredFact(facts, row, fileId, 'employment', label, `structured.employment[${index}]`, 0.9, 100 - index, includePending);
  });
}

function educationFacts(
  facts: DocumentFact[],
  row: ResumeRow,
  fileId: string | null,
  entries: ResumeEducation[],
  includePending: boolean,
): void {
  entries.forEach((entry, index) => {
    const label = [entry.degree, entry.field, entry.institution].filter(Boolean).join(' · ');
    addStructuredFact(facts, row, fileId, 'education', label, `structured.education[${index}]`, 0.9, 100 - index, includePending);
    if (entry.degree) {
      addStructuredFact(facts, row, fileId, 'degree', entry.degree, `structured.education[${index}].degree`, 0.9, 102 - index, includePending);
    }
  });
}

function resumeFactsForIntent(
  row: ResumeRow,
  fileId: string | null,
  parsed: ParsedResume,
  intent: DocumentFactQueryIntent,
  includePending: boolean,
): DocumentFact[] {
  const facts: DocumentFact[] = [];
  const add = (kind: DocumentFactKind, value: string, path: string, score = 90) =>
    addStructuredFact(facts, row, fileId, kind, value, path, 0.88, score, includePending);

  if (intent === 'employment' || intent === 'overview') employmentFacts(facts, row, fileId, parsed.employment, includePending);
  if (intent === 'education' || intent === 'degree' || intent === 'overview') educationFacts(facts, row, fileId, parsed.education, includePending);
  if (intent === 'skill' || intent === 'overview') parsed.skills.forEach((skill, index) => add('skill', skill, `structured.skills[${index}]`, 95 - index));
  if (intent === 'project' || intent === 'overview') {
    parsed.projects.forEach((project: ResumeProject, index) => {
      add('project', [project.name, project.description].filter(Boolean).join(' — '), `structured.projects[${index}]`, 95 - index);
    });
  }
  if (intent === 'certification' || intent === 'overview') {
    parsed.certifications.forEach((certification: ResumeCertification, index) => {
      add('certification', [certification.name, certification.issuer].filter(Boolean).join(' · '), `structured.certifications[${index}]`, 95 - index);
    });
  }
  if (intent === 'language' || intent === 'overview') parsed.languages.forEach((language, index) => add('language', language, `structured.languages[${index}]`, 95 - index));
  if (intent === 'contact' || intent === 'overview') {
    for (const [key, value] of Object.entries(parsed.contact)) {
      if (typeof value === 'string') add('contact', value, `structured.contact.${key}`, 92);
    }
  }
  if ((intent === 'summary' || intent === 'overview') && parsed.summary) add('summary', parsed.summary, 'structured.summary', 110);
  if (intent === 'achievement' || intent === 'overview') {
    const extractedClaims = Array.isArray(row.parsed_data.claims_extracted)
      ? row.parsed_data.claims_extracted as Array<{ claim_type?: string; claim_text?: string }>
      : [];
    const achievements = extractedClaims
      .filter((claim) => claim.claim_type === 'achievement' && claim.claim_text)
      .map((claim) => claim.claim_text as string) ?? [];
    achievements.forEach((achievement, index) => add('achievement', achievement, `claims_extracted[${index}]`, 95 - index));
  }
  return facts;
}

function filterAndRankFacts(facts: DocumentFact[], query: string, intent: DocumentFactQueryIntent): DocumentFact[] {
  const terms = termsFor(query);
  const ranked = facts
    .map((fact) => {
      const searchable = normalize([fact.value, fact.filename, fact.fieldPath, fact.excerpt].join(' '));
      const matched = terms.filter((term) => searchable.includes(term));
      const intentBoost = fact.kind === intent || (intent === 'degree' && fact.kind === 'education') ? 50 : 0;
      return { fact, score: fact.score + matched.length * 12 + intentBoost };
    })
    .sort((a, b) =>
      b.score - a.score
      || (b.fact.observedAt ?? '').localeCompare(a.fact.observedAt ?? '')
      || a.fact.filename.localeCompare(b.fact.filename)
      || a.fact.fieldPath.localeCompare(b.fact.fieldPath))
    .map(({ fact, score }) => ({ ...fact, score }));
  const seen = new Set<string>();
  return ranked.filter((fact) => {
    const key = `${fact.kind}:${normalize(fact.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class DocumentFactQueryService {
  async query(userId: string, request: DocumentFactQueryRequest): Promise<DocumentFactQueryResponse> {
    const startedAt = Date.now();
    const queryText = request.query.trim();
    const intent = detectIntent(queryText);
    const limit = Math.min(100, Math.max(1, request.limit ?? DEFAULT_LIMIT));
    const includePending = request.includePending ?? false;
    const facts: DocumentFact[] = [];
    const warnings: string[] = [];
    let genericDocumentsScanned = 0;

    let resumeQuery = supabaseAdmin
      .from('resume_documents')
      .select('id, file_name, raw_text, parsed_data, processing_status, uploaded_at')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false })
      .limit(MAX_RESUME_DOCUMENTS);
    if (!includePending) resumeQuery = resumeQuery.eq('processing_status', 'completed');
    if (request.documentId) resumeQuery = resumeQuery.or(`id.eq.${request.documentId},parsed_data->>source_file_id.eq.${request.documentId}`);
    const { data: resumeData, error: resumeError } = await resumeQuery;
    if (resumeError) throw resumeError;
    const resumeRows = (resumeData ?? []) as ResumeRow[];

    if (intent !== 'generic_text' && intent !== 'claim') {
      for (const row of resumeRows) {
        const parsed = structuredFrom(row);
        if (!parsed) continue;
        const fileId = typeof row.parsed_data?.source_file_id === 'string' ? row.parsed_data.source_file_id : null;
        facts.push(...resumeFactsForIntent(row, fileId, parsed, intent, includePending));
      }
    }

    if (intent === 'claim' || intent === 'overview') {
      let claimsQuery = supabaseAdmin
        .from('profile_claims')
        .select('id, claim_type, claim_text, source_id, verified_status, confidence, user_confirmed, metadata, last_updated_at')
        .eq('user_id', userId)
        .eq('source', 'resume')
        .order('last_updated_at', { ascending: false })
        .limit(MAX_CLAIMS);
      if (!includePending) claimsQuery = claimsQuery.in('verified_status', ['supported', 'verified', 'unverified']);
      if (request.documentId) {
        const matchingResumeIds = resumeRows
          .filter((row) => row.id === request.documentId || row.parsed_data?.source_file_id === request.documentId)
          .map((row) => row.id);
        claimsQuery = claimsQuery.in('source_id', matchingResumeIds.length ? matchingResumeIds : [request.documentId]);
      }
      const { data: claimData, error: claimError } = await claimsQuery;
      if (claimError) throw claimError;
      for (const claim of (claimData ?? []) as ClaimRow[]) {
        const resume = resumeRows.find((row) => row.id === claim.source_id);
        const filename = resume?.file_name ?? 'Resume';
        if (!resume && !includePending) continue;
        facts.push({
          kind: 'claim',
          value: claim.claim_text,
          fieldPath: `profile_claims.${claim.claim_type}`,
          documentId: claim.source_id ?? claim.id,
          fileId: resume && typeof resume.parsed_data?.source_file_id === 'string' ? resume.parsed_data.source_file_id : null,
          filename,
          sourceTable: 'profile_claims',
          sourceId: claim.id,
          excerpt: typeof claim.metadata?.quote === 'string' ? claim.metadata.quote : claim.claim_text,
          confidence: claim.confidence,
          reviewState: claim.user_confirmed
            ? 'confirmed'
            : (claim.verified_status as DocumentFact['reviewState']) || 'unverified',
          observedAt: claim.last_updated_at,
          score: 85,
        });
      }
    }

    if (intent === 'generic_text' || intent === 'overview') {
      const terms = termsFor(queryText);
      for (const row of resumeRows) {
        if (!row.raw_text || (terms.length && !terms.some((term) => normalize(row.raw_text).includes(term)))) continue;
        const fileId = typeof row.parsed_data?.source_file_id === 'string' ? row.parsed_data.source_file_id : null;
        const excerpt = terms.length
          ? excerptFor(row.raw_text, terms.find((term) => normalize(row.raw_text).includes(term)) ?? '')
          : row.raw_text.slice(0, 320).replace(/\s+/g, ' ').trim();
        facts.push({
          kind: 'document_match',
          value: row.file_name,
          fieldPath: 'raw_text',
          documentId: row.id,
          fileId,
          filename: row.file_name,
          sourceTable: 'resume_documents',
          sourceId: row.id,
          excerpt,
          confidence: 0.82,
          reviewState: 'completed',
          observedAt: row.uploaded_at,
          score: terms.length ? 92 : 45,
        });
      }
      let originalQuery = supabaseAdmin
        .from('original_documents')
        .select('id, title, content, file_name, metadata, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(MAX_GENERIC_DOCUMENTS);
      if (request.documentId) {
        originalQuery = originalQuery.or(`id.eq.${request.documentId},metadata->>source_file_id.eq.${request.documentId}`);
      }
      if (terms.length) originalQuery = originalQuery.textSearch('content', terms.join(' '), { config: 'simple', type: 'plain' });
      const { data: originalData, error: originalError } = await originalQuery;
      if (originalError) throw originalError;
      const originals = (originalData ?? []) as OriginalDocumentRow[];
      genericDocumentsScanned += originals.length;
      const originalSourceIds = originals
        .map((row) => typeof row.metadata?.source_file_id === 'string' ? row.metadata.source_file_id : null)
        .filter((id): id is string => Boolean(id));
      const { data: originalSourceFiles, error: originalSourceFilesError } = originalSourceIds.length
        ? await supabaseAdmin
          .from('user_files')
          .select('id, processing_status')
          .eq('user_id', userId)
          .in('id', originalSourceIds)
        : { data: [], error: null };
      if (originalSourceFilesError) throw originalSourceFilesError;
      const sourceStatus = new Map(
        ((originalSourceFiles ?? []) as Array<{ id: string; processing_status: string }>)
          .map((file) => [file.id, file.processing_status]),
      );
      for (const row of originals) {
        const filename = row.file_name ?? row.title;
        const sourceFileId = typeof row.metadata?.source_file_id === 'string' ? row.metadata.source_file_id : null;
        if (!includePending && sourceFileId && sourceStatus.get(sourceFileId) !== 'completed') continue;
        const excerpt = excerptFor(row.content, terms.join(' ')) ?? row.content.slice(0, 320).replace(/\s+/g, ' ').trim();
        facts.push({
          kind: 'document_match',
          value: filename,
          fieldPath: 'content',
          documentId: row.id,
          fileId: typeof row.metadata?.source_file_id === 'string' ? row.metadata.source_file_id : null,
          filename,
          sourceTable: 'original_documents',
          sourceId: row.id,
          excerpt,
          confidence: 0.75,
          reviewState: 'completed',
          observedAt: row.updated_at,
          score: terms.length ? 90 : 40,
        });
      }

      let fileQuery = supabaseAdmin
        .from('user_files')
        .select('id, filename, ingest_kind, processing_status, uploaded_at')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false })
        .limit(MAX_GENERIC_DOCUMENTS);
      if (request.documentId) fileQuery = fileQuery.eq('id', request.documentId);
      if (terms.length) fileQuery = fileQuery.or(terms.map((term) => `filename.ilike.%${term}%`).join(','));
      const { data: files, error: filesError } = await fileQuery;
      if (filesError) throw filesError;
      const fileRows = (files ?? []) as UserFileRow[];
      genericDocumentsScanned += fileRows.length;
      for (const file of fileRows) {
        if (!includePending && file.processing_status !== 'completed') continue;
        facts.push({
          kind: 'filename',
          value: file.filename,
          fieldPath: 'filename',
          documentId: file.id,
          fileId: file.id,
          filename: file.filename,
          sourceTable: 'user_files',
          sourceId: file.id,
          excerpt: null,
          confidence: null,
          reviewState: file.processing_status === 'completed' ? 'completed' : 'pending_review',
          observedAt: file.uploaded_at,
          score: terms.length ? 80 : 35,
        });
      }
    }

    if (!resumeRows.length && !facts.length) warnings.push('No completed resume or document evidence was available for this query.');
    const rankedAll = filterAndRankFacts(facts, queryText, intent);
    const ranked = rankedAll.slice(0, limit);
    return {
      query: queryText,
      intent,
      facts: request.includeEvidence === false
        ? ranked.map((fact) => ({ ...fact, excerpt: null }))
        : ranked,
      total: rankedAll.length,
      warnings,
      diagnostics: {
        resumeDocumentsScanned: resumeRows.length,
        genericDocumentsScanned,
        claimsScanned: facts.filter((fact) => fact.sourceTable === 'profile_claims').length,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }
}

export const documentFactQueryService = new DocumentFactQueryService();
