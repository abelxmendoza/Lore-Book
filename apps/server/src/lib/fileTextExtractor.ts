/**
 * Shared binary → text extraction for all file ingestion paths.
 * Used by documents, resume, and FileNormalizer — not duplicated per route.
 */

import mammoth from 'mammoth';

import { logger } from '../logger';

export type SupportedFileType = 'txt' | 'md' | 'pdf' | 'doc' | 'docx';

export function inferFileType(
  filename: string,
  mimeType?: string
): SupportedFileType | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'txt' || mimeType === 'text/plain') return 'txt';
  if (ext === 'md' || ext === 'markdown' || mimeType === 'text/markdown') return 'md';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (ext === 'doc' || mimeType === 'application/msword') return 'doc';
  return null;
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: SupportedFileType
): Promise<string> {
  if (fileType === 'txt' || fileType === 'md') {
    return buffer.toString('utf-8');
  }

  if (fileType === 'pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require('pdf-parse') as {
        PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> };
      };
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      return pdfData.text?.trim() ?? '';
    } catch (error) {
      logger.error({ error, fileType }, 'Failed to parse PDF file');
      throw new Error('Failed to parse PDF file. The file may be corrupted or encrypted.');
    }
  }

  if (fileType === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.trim() ?? '';
    } catch (error) {
      logger.error({ error, fileType }, 'Failed to parse DOCX file');
      throw new Error('Failed to parse DOCX file. The file may be corrupted.');
    }
  }

  if (fileType === 'doc') {
    throw new Error(
      'DOC format (legacy Microsoft Word) is not supported. Please convert to DOCX or PDF.'
    );
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}
