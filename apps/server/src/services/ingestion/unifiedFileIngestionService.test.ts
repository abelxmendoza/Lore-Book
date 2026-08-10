import { describe, it, expect, vi, beforeEach } from 'vitest';

import { unifiedFileIngestionService } from './unifiedFileIngestionService';
import { userFileRegistry } from './userFileRegistry';
import { documentService } from '../documentService';
import { resumeParsingService } from '../profileClaims/resumeParsingService';
import { resumeLorePopulationService } from '../profileClaims/resumeLorePopulationService';
import { profileClaimsService } from '../profileClaims/profileClaimsService';
import { memoryService } from '../memoryService';
import { relationshipFoundationService } from '../relationshipFoundationService';
import { eventRecoveryService } from '../eventRecoveryService';
import { supabaseAdmin } from '../supabaseClient';

vi.mock('./userFileRegistry', () => ({
  userFileRegistry: {
    registerOrReuse: vi.fn(),
    setStatus: vi.fn(),
    updateDerivedCounts: vi.fn(),
    appendProvenanceLink: vi.fn(),
  },
}));
vi.mock('../documentService', () => ({
  documentService: { processDocumentFromArtifact: vi.fn() },
}));
vi.mock('../profileClaims/resumeParsingService', () => ({
  resumeParsingService: { processResumeFromText: vi.fn() },
}));
vi.mock('../profileClaims/resumeLorePopulationService', () => ({
  resumeLorePopulationService: { populate: vi.fn() },
}));
vi.mock('../profileClaims/profileClaimsService', () => ({
  profileClaimsService: { batchCreateClaims: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../memoryService', () => ({
  memoryService: { saveEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }) },
}));
vi.mock('../relationshipFoundationService', () => ({
  relationshipFoundationService: { recoverRelationshipGraph: vi.fn().mockResolvedValue({ created: 0, updated: 0 }) },
}));
vi.mock('../eventRecoveryService', () => ({
  eventRecoveryService: { recoverMissingEvents: vi.fn().mockResolvedValue({ created: 0 }) },
}));
vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }),
        }),
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  },
}));

const RESUME_TEXT = `
Jane Doe
jane@example.com

EXPERIENCE
Senior Engineer, Acme Corp — Jan 2022 - Present
Built distributed systems.

Software Engineer, Widgets Inc — Jun 2019 - Dec 2021
Shipped the widget pipeline.

EDUCATION
B.S. Computer Science, State University, 2019

SKILLS
TypeScript, Python, AWS
`.trim();

const GENERIC_TEXT = `
Dear diary,

Today was a good day. I went for a walk and thought about my project ideas.
Nothing career-related here, just reflections on the weather and my mood.
`.trim();

function bufferFor(text: string): Buffer {
  return Buffer.from(text, 'utf-8');
}

describe('unifiedFileIngestionService — content-based resume detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userFileRegistry.registerOrReuse).mockResolvedValue({
      id: 'file-1',
      processing_status: 'pending',
    } as any);
    vi.mocked(documentService.processDocumentFromArtifact).mockResolvedValue({
      entriesCreated: 1,
      charactersCreated: 0,
      sectionsCreated: 0,
      entryIds: ['entry-generic'],
    } as any);
    vi.mocked(resumeParsingService.processResumeFromText).mockResolvedValue({
      document: { id: 'resume-doc-1', parsed_data: {} },
      claims: [],
      structured: { employment: [{ company: 'Acme Corp' }], education: [] },
    } as any);
    vi.mocked(resumeLorePopulationService.populate).mockResolvedValue({
      journalEntries: 1,
      facts: 0,
      organizations: 1,
      timelineEvents: 2,
      skills: 3,
      projectsSuggested: 0,
      roleConflicts: [],
      characterAttributes: 0,
      entryIds: [],
    } as any);
  });

  it('routes resume-shaped content through resume ingestion even when kind is "document" and the filename gives no hint', async () => {
    // This is the production bug: a real resume uploaded through the generic
    // Documents flow under any filename must still be recognized by content,
    // not silently treated as a generic journal-style document.
    await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(RESUME_TEXT),
      filename: 'my_files_2026.txt',
      mimeType: 'text/plain',
      kind: 'document',
    });

    expect(resumeParsingService.processResumeFromText).toHaveBeenCalled();
    expect(documentService.processDocumentFromArtifact).not.toHaveBeenCalled();
  });

  it('leaves genuinely non-resume content on the generic document path', async () => {
    await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(GENERIC_TEXT),
      filename: 'diary_entry.txt',
      mimeType: 'text/plain',
      kind: 'document',
    });

    expect(documentService.processDocumentFromArtifact).toHaveBeenCalled();
    expect(resumeParsingService.processResumeFromText).not.toHaveBeenCalled();
  });

  it('still honors an explicit kind: "resume" regardless of content', async () => {
    await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(GENERIC_TEXT),
      filename: 'resume.txt',
      mimeType: 'text/plain',
      kind: 'resume',
    });

    expect(resumeParsingService.processResumeFromText).toHaveBeenCalled();
    expect(documentService.processDocumentFromArtifact).not.toHaveBeenCalled();
  });
});
