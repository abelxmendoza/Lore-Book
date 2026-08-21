import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  occurrenceFromImportedText,
  photoCaptureOccurrence,
  mergeOccurrenceMetadata,
} from './journalOccurrenceWrite';

const IMPORTER_FILES = [
  'src/services/profileClaims/resumeLorePopulationService.ts',
  'src/services/onboardingService.ts',
  'src/services/chatGPTImportService.ts',
  'src/services/documentService.ts',
  'src/services/ingestion/unifiedFileIngestionService.ts',
  'src/services/photoService.ts',
  'src/services/photoAnalysisService.ts',
  'src/services/xService.ts',
  'src/integrations/x/xConnection.service.ts',
  'src/services/github/githubSyncManager.ts',
  'src/services/backwardStorytelling/entryMaterializationService.ts',
];

describe('journal occurrence write helpers', () => {
  it('treats EXIF DateTimeOriginal as capture occurrence and omits upload-only photos', () => {
    expect(photoCaptureOccurrence({ dateTimeOriginal: '2024-06-11T18:04:00.000Z' })).toBe(
      '2024-06-11T18:04:00.000Z',
    );
    expect(photoCaptureOccurrence({})).toBeUndefined();
  });

  it('extracts a year from imported career text without using import time', () => {
    const occ = occurrenceFromImportedText(
      'Maya started at Vanguard Robotics in 2024 as a field technician.',
    );
    expect(occ.date).toBeTruthy();
    expect(occ.date?.startsWith('2024')).toBe(true);
    expect(occ.temporalSource).toBe('relative_expression');
  });

  it('leaves profile-like text unresolved', () => {
    const occ = occurrenceFromImportedText('I work in robotics at Vanguard Robotics.');
    expect(occ.date).toBeUndefined();
    expect(occ.temporalSource).toBe('recording_fallback');
  });

  it('accepts explicit today when the source timestamp is that day', () => {
    const sourceCreatedAt = '2026-08-21T15:00:00.000Z';
    const occ = occurrenceFromImportedText('I started this job today.', { sourceCreatedAt });
    expect(occ.date).toBeTruthy();
    expect(occ.date?.startsWith('2026-08-21')).toBe(true);
  });

  it('does not treat import-day “today” as occurrence without a source timestamp', () => {
    const occ = occurrenceFromImportedText('Today was a good day at MemoVault.', {
      now: new Date('2026-08-21T18:00:00.000Z'),
    });
    expect(occ.date).toBeUndefined();
  });

  it('keeps ChatGPT 2023 evidence as occurrence', () => {
    const occ = occurrenceFromImportedText(
      'Jamie and I visited Northwind Depot in 2023.',
      { sourceCreatedAt: '2025-01-12T10:00:00.000Z' },
    );
    expect(occ.date?.startsWith('2023')).toBe(true);
  });

  it('uses a social post timestamp as mention/source time, not described-event occurrence by default', () => {
    const occ = occurrenceFromImportedText('Thinking about Japan last summer.', {
      sourceCreatedAt: '2026-08-20T14:00:00.000Z',
    });
    expect(occ.sourceCreatedAt).toBe('2026-08-20T14:00:00.000Z');
    if (occ.date) {
      expect(occ.date.startsWith('2026-08-20')).toBe(false);
    }
  });

  it('preserves mention/import clocks in metadata without inventing occurrence', () => {
    const meta = mergeOccurrenceMetadata(
      { channel: 'chatgpt_import' },
      {
        temporalSource: 'recording_fallback',
        mentionedAt: '2025-01-04T00:00:00.000Z',
        importedAt: '2026-08-21T00:00:00.000Z',
        sourceCreatedAt: '2025-01-04T00:00:00.000Z',
      },
    );
    expect(meta.occurrenceUnresolved).toBe(true);
    expect(meta.mentionedAt).toBe('2025-01-04T00:00:00.000Z');
    expect(meta.importedAt).toBe('2026-08-21T00:00:00.000Z');
    expect(meta.date).toBeUndefined();
  });
});

describe('importer call-site guard', () => {
  it('does not pass date: new Date() (or equivalent) as journal occurrence', () => {
    const leaks: string[] = [];
    const patterns = [
      /date:\s*new Date\(/,
      /date:\s*[^\n]{0,80}\?\?\s*new Date\(\)/,
      /date:\s*[^\n]{0,80}\|\|\s*new Date\(\)/,
    ];
    for (const rel of IMPORTER_FILES) {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
      for (const pattern of patterns) {
        if (pattern.test(src)) leaks.push(`${rel} matches ${pattern}`);
      }
    }
    expect(leaks).toEqual([]);
  });
});
