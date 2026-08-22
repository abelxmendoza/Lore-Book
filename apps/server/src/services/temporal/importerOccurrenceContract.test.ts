import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyJournalOccurrenceFromText, resolveJournalWriteOccurrence } from './journalOccurrenceWrite';
import { occurrenceDate, parseSourceTimestamp, photoCaptureOccurrenceDate } from './explicitOccurrence';
import { resumeDatePrecision, normalizeResumeDate } from '../profileClaims/resumeDateUtils';

const NOW = new Date('2026-08-21T16:00:00.000Z');

const GUARDED_IMPORTERS = [
  'services/profileClaims/resumeLorePopulationService.ts',
  'services/onboardingService.ts',
  'services/chatGPTImportService.ts',
  'services/documentService.ts',
  'services/photoService.ts',
  'services/photoAnalysisService.ts',
  'services/ingestion/unifiedFileIngestionService.ts',
  'services/xService.ts',
  'integrations/x/xConnection.service.ts',
  'services/backwardStorytelling/entryMaterializationService.ts',
];

describe('importer occurrence contract', () => {
  it('5. ChatGPT import describing 2023 keeps 2023 occurrence', () => {
    const write = classifyJournalOccurrenceFromText(
      '[Imported from ChatGPT] In 2023 I interned at Vanguard Robotics.',
      NOW,
    );
    expect(write.occurredAt?.slice(0, 4)).toBe('2023');
    expect(write.recordedAt).toBe(NOW.toISOString());
  });

  it('6. ChatGPT import with no occurrence evidence stays unresolved', () => {
    const write = classifyJournalOccurrenceFromText(
      '[Imported from ChatGPT] Jamie and I talked about MemoVault.',
      NOW,
    );
    expect(write.occurredAt).toBeNull();
  });

  it('7. source message timestamp is mention, not occurrence by default', () => {
    const write = resolveJournalWriteOccurrence({
      content: 'Jamie and I talked about MemoVault.',
      sourceCreatedAt: '2025-01-15T09:00:00.000Z',
      now: NOW,
    });
    expect(write.mentionedAt).toBe('2025-01-15T09:00:00.000Z');
    expect(write.occurredAt).toBeNull();
    expect(write.recordedAt).toBe(NOW.toISOString());
  });

  it('ChatGPT export create_time is source time, not now', () => {
    expect(parseSourceTimestamp(1736931600)).toBe('2025-01-15T09:00:00.000Z');
    expect(parseSourceTimestamp(NOW.toISOString())).toBe(NOW.toISOString());
  });

  it('8. document upload with no dates is unresolved', () => {
    const write = classifyJournalOccurrenceFromText(
      'This MemoVault spec describes the product vision.',
      NOW,
    );
    expect(write.occurredAt).toBeNull();
    expect(occurrenceDate(undefined)).toBeUndefined();
    expect(occurrenceDate('')).toBeUndefined();
  });

  it('9. document month/year keeps precision', () => {
    const write = resolveJournalWriteOccurrence({
      explicitDate: '2024-06-01',
      occurrencePrecision: 'month',
      temporalSource: 'document_stated',
      now: NOW,
    });
    expect(write.occurredAt?.slice(0, 7)).toBe('2024-06');
    expect(write.precision).toBe('month');
  });

  it('10. photo EXIF is valid occurrence', () => {
    expect(photoCaptureOccurrenceDate({ dateTimeOriginal: '2024-03-02T15:00:00.000Z' })).toBe(
      '2024-03-02T15:00:00.000Z',
    );
  });

  it('11. photo without EXIF is unresolved', () => {
    expect(photoCaptureOccurrenceDate({})).toBeUndefined();
  });

  it('12. calendar event start remains valid occurrence', () => {
    const write = resolveJournalWriteOccurrence({
      explicitDate: '2026-08-25T14:00:00.000Z',
      temporalSource: 'document_stated',
      content: 'Team standup at Northwind Depot',
      now: NOW,
    });
    expect(write.occurredAt).toBe('2026-08-25T14:00:00.000Z');
    expect(write.temporalSource).toBe('document_stated');
  });

  it('13. social post timestamp about a past event is mention, not the trip', () => {
    const write = resolveJournalWriteOccurrence({
      content: 'Thinking about Japan last summer.',
      sourceCreatedAt: '2026-08-20T18:00:00.000Z',
      now: NOW,
    });
    expect(write.mentionedAt).toBe('2026-08-20T18:00:00.000Z');
    expect(write.occurredAt).not.toBe('2026-08-20T18:00:00.000Z');
    expect(write.precision).toBe('season');
  });

  it('resume year tokens keep year precision', () => {
    expect(normalizeResumeDate('2024')).toBe('2024-01-01');
    expect(resumeDatePrecision('2024')).toBe('year');
    expect(resumeDatePrecision('Apr 2024')).toBe('month');
  });
});

describe('static guard: no now() occurrence in importers', () => {
  it('15. guarded importers do not pass date: new Date() into saveEntry', () => {
    const srcRoot = resolve(process.cwd(), 'src');
    for (const rel of GUARDED_IMPORTERS) {
      const src = readFileSync(resolve(srcRoot, rel), 'utf8');
      expect(src, rel).not.toMatch(/saveEntry\([\s\S]{0,500}date:\s*new Date\(/);
      expect(src, rel).not.toMatch(/date:\s*new Date\(\)\.toISOString\(\)/);
      expect(src, rel).not.toMatch(/date:\s*.*\?\?\s*new Date\(/);
      expect(src, rel).not.toMatch(/date:\s*.*\|\|\s*new Date\(/);
    }
  });
});
