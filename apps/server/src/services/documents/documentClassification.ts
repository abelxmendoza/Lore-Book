import {
  categoryForMetadata,
  type DocumentCategory,
} from './documentCategories';

export type DocumentClassificationInput = {
  filename: string;
  mimeType: string;
  ingestKind: string | null | undefined;
  metadata?: Record<string, unknown> | null;
  extractedText?: string | null;
  linkedResume?: boolean;
};

export type DocumentClassification = {
  category: DocumentCategory;
  confidence: number;
  reason: string;
};

const CATEGORY_PATTERNS: Array<{
  category: DocumentCategory;
  pattern: RegExp;
  reason: string;
}> = [
  {
    category: 'resumes',
    pattern: /\b(?:resume|curriculum\s+vitae|career\s+(?:history|profile)|professional\s+experience|work\s+experience)\b/i,
    reason: 'resume wording',
  },
  {
    category: 'journals',
    pattern: /\b(?:journal|diary|daily\s+log|reflection)\b/i,
    reason: 'journal wording',
  },
  {
    category: 'autobiographies',
    pattern: /\b(?:autobiograph|my\s+life|personal\s+memoir|life\s+story)\b/i,
    reason: 'autobiography wording',
  },
  {
    category: 'biographies',
    pattern: /\b(?:biograph|life\s+of)\b/i,
    reason: 'biography wording',
  },
  {
    category: 'family_history',
    pattern: /\b(?:family\s+(?:history|tree|archive)|genealog|ancestr|obituar)\b/i,
    reason: 'family-history wording',
  },
  {
    category: 'letters_correspondence',
    pattern: /\b(?:letter|correspondence|email\s+(?:thread|archive)|message\s+thread)\b/i,
    reason: 'correspondence wording',
  },
  {
    category: 'personal_identity',
    pattern: /\b(?:passport|driver'?s?\s+licen[cs]e|identity\s+card|birth\s+certificate|social\s+security|diploma|degree\s+certificate)\b/i,
    reason: 'identity-record wording',
  },
  {
    category: 'creative_works',
    pattern: /\b(?:manuscript|screenplay|short\s+story|poem|poetry|novel|creative\s+writing)\b/i,
    reason: 'creative-work wording',
  },
  {
    category: 'records_research',
    pattern: /\b(?:research|report|transcript|record|source\s+material|whitepaper|certificate)\b/i,
    reason: 'record or research wording',
  },
];

function searchableText(input: DocumentClassificationInput): string {
  return `${input.filename.replace(/[_.-]+/g, ' ')}\n${input.extractedText ?? ''}`.slice(0, 30_000);
}

/**
 * Deterministic, privacy-preserving library classification. Image OCR may be
 * supplied by the existing photo analyzer, but this function never sends data
 * anywhere and is safe for backfilling existing registry rows.
 */
export function classifyDocument(input: DocumentClassificationInput): DocumentClassification {
  if (input.linkedResume || input.ingestKind === 'resume') {
    return { category: 'resumes', confidence: 1, reason: 'linked resume record' };
  }

  if (typeof input.metadata?.document_subtype === 'string') {
    return { category: 'personal_identity', confidence: 0.98, reason: 'recognized identity document' };
  }

  const text = searchableText(input);
  for (const candidate of CATEGORY_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return {
        category: candidate.category,
        confidence: input.extractedText ? 0.9 : 0.82,
        reason: candidate.reason,
      };
    }
  }

  if (input.mimeType.startsWith('image/') || input.ingestKind === 'photo') {
    return { category: 'photos_images', confidence: 0.75, reason: 'image file' };
  }

  return {
    category: categoryForMetadata(input.metadata),
    confidence: 0,
    reason: 'no confident match',
  };
}

export function hasManualDocumentCategory(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.document_category_source === 'manual';
}
