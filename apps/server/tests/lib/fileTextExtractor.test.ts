import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: 'Hello from DOCX' })),
  },
}));

import { extractTextFromBuffer, inferFileType } from '../../src/lib/fileTextExtractor';

describe('inferFileType', () => {
  it('detects pdf by extension and mime', () => {
    expect(inferFileType('resume.pdf', 'application/pdf')).toBe('pdf');
    expect(inferFileType('notes.PDF')).toBe('pdf');
  });

  it('detects docx', () => {
    expect(
      inferFileType(
        'diary.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe('docx');
  });

  it('detects txt and md', () => {
    expect(inferFileType('journal.txt', 'text/plain')).toBe('txt');
    expect(inferFileType('notes.md', 'text/markdown')).toBe('md');
  });
});

describe('extractTextFromBuffer', () => {
  it('extracts plain text without corruption', async () => {
    const buf = Buffer.from('My life story begins in Anaheim.', 'utf-8');
    await expect(extractTextFromBuffer(buf, 'txt')).resolves.toBe('My life story begins in Anaheim.');
  });

  it('extracts docx via mammoth', async () => {
    const text = await extractTextFromBuffer(Buffer.from('ignored'), 'docx');
    expect(text).toBe('Hello from DOCX');
  });

  it('rejects legacy doc format', async () => {
    await expect(extractTextFromBuffer(Buffer.from('x'), 'doc')).rejects.toThrow(/not supported/);
  });

  it('extracts text from Abel robotics reference PDF', async () => {
    const pdfPath = join(__dirname, '../fixtures/resumes/AbelMendoza_RoboticsEngineer_Resume2026-1.pdf');
    const buffer = readFileSync(pdfPath);
    const text = await extractTextFromBuffer(buffer, 'pdf');
    expect(text).toContain('Abel Mendoza');
    expect(text).toContain('RLH Industries');
    expect(text).toContain('Armstrong Robotics');
  });
});
