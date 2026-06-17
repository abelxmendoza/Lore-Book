import { extractTextFromBuffer, inferFileType, type SupportedFileType } from '../../lib/fileTextExtractor';

import type { NormalizedArtifact } from './types';

export type NormalizeInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  sourceFileId: string;
};

const DATE_PATTERNS = [
  /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+20\d{2}\b/i,
];

function detectDateFromText(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const parsed = Date.parse(match[0]);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
  }
  return null;
}

export class FileNormalizer {
  /**
   * Normalize document-like files (txt, md, pdf, docx) to text artifacts.
   */
  async normalizeDocument(input: NormalizeInput): Promise<NormalizedArtifact> {
    const fileType = inferFileType(input.filename, input.mimeType);
    if (!fileType) {
      throw new Error(`Unsupported document type: ${input.mimeType || input.filename}`);
    }

    const text = await extractTextFromBuffer(input.buffer, fileType as SupportedFileType);
    if (!text.trim()) {
      throw new Error('No extractable text found in file');
    }

    return {
      text,
      mediaRefs: [],
      detectedDate: detectDateFromText(text),
      sourceFileId: input.sourceFileId,
      mimeType: input.mimeType,
      filename: input.filename,
    };
  }

  /**
   * Normalize plain text or pre-extracted content (voice transcript, chat import).
   */
  normalizeText(
    text: string,
    input: Pick<NormalizeInput, 'sourceFileId' | 'mimeType' | 'filename'>
  ): NormalizedArtifact {
    return {
      text,
      mediaRefs: [],
      detectedDate: detectDateFromText(text),
      sourceFileId: input.sourceFileId,
      mimeType: input.mimeType,
      filename: input.filename,
    };
  }
}

export const fileNormalizer = new FileNormalizer();
