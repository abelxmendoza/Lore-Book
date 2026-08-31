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
    tryClaimProcessing: vi.fn().mockResolvedValue(true),
    reclaimStaleProcessing: vi.fn().mockResolvedValue(false),
    updateDerivedCounts: vi.fn(),
    appendProvenanceLink: vi.fn(),
    updateMetadata: vi.fn(),
    listForUser: vi.fn().mockResolvedValue([]),
    listAllForUser: vi.fn().mockResolvedValue([]),
    getForUser: vi.fn().mockResolvedValue(null),
    deleteStoredBinary: vi.fn(),
  },
}));
vi.mock('../documentService', () => ({
  documentService: { processDocumentFromArtifact: vi.fn() },
}));
vi.mock('../profileClaims/resumeParsingService', () => ({
  resumeParsingService: {
    processResumeFromText: vi.fn(),
    getResumeDocuments: vi.fn().mockResolvedValue([]),
  },
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
    vi.mocked(userFileRegistry.listAllForUser).mockResolvedValue([]);
    vi.mocked(userFileRegistry.getForUser).mockResolvedValue(null);
    vi.mocked(resumeParsingService.getResumeDocuments).mockResolvedValue([]);
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
      documentCategory: 'journals',
    });

    expect(userFileRegistry.registerOrReuse).toHaveBeenCalledWith(
      'user-1',
      expect.any(Buffer),
      expect.objectContaining({ documentCategory: 'journals' }),
    );
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

  it('reuses an exact completed upload without reprocessing it', async () => {
    vi.mocked(userFileRegistry.registerOrReuse).mockResolvedValue({
      id: 'file-existing',
      processing_status: 'completed',
      derived_counts: { moments: 4, facts: 3, entities: 2, relationships: 0, events: 2 },
      metadata: {},
    } as any);

    const result = await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(RESUME_TEXT),
      filename: 'resume-copy.txt',
      mimeType: 'text/plain',
      kind: 'resume',
    });

    expect(result.alreadyImported).toBe(true);
    expect(result.userFileId).toBe('file-existing');
    expect(resumeParsingService.processResumeFromText).not.toHaveBeenCalled();
  });

  it('does not start a second import while the same file is still processing', async () => {
    vi.mocked(userFileRegistry.registerOrReuse).mockResolvedValue({
      id: 'file-processing',
      processing_status: 'processing',
      derived_counts: { moments: 0, facts: 0, entities: 0, relationships: 0, events: 0 },
      metadata: { processing_started_at: new Date().toISOString() },
    } as any);

    const result = await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(RESUME_TEXT),
      filename: 'resume.txt',
      mimeType: 'text/plain',
      kind: 'resume',
    });

    expect(result.processingStatus).toBe('processing');
    expect(userFileRegistry.setStatus).not.toHaveBeenCalled();
    expect(resumeParsingService.processResumeFromText).not.toHaveBeenCalled();
  });

  it('remembers a reformatted prior resume without storing a second binary or lore copy', async () => {
    const priorFile = {
      id: 'file-prior',
      user_id: 'user-1',
      filename: 'resume-original.txt',
      storage_url: 'user-1/file-prior-resume.txt',
      processing_status: 'completed',
      derived_counts: { moments: 5, facts: 4, entities: 2, relationships: 0, events: 2 },
      metadata: {},
    } as any;
    vi.mocked(userFileRegistry.listAllForUser).mockResolvedValue([priorFile]);
    vi.mocked(userFileRegistry.getForUser).mockResolvedValue({
      id: 'file-1',
      user_id: 'user-1',
      filename: 'resume-reformatted.txt',
      storage_url: 'user-1/file-1-resume.txt',
    } as any);
    vi.mocked(resumeParsingService.getResumeDocuments).mockResolvedValue([{
      id: 'resume-doc-prior',
      processing_status: 'completed',
      raw_text: RESUME_TEXT.replaceAll('\n', '   '),
      parsed_data: { source_file_id: 'file-prior' },
    } as any]);

    const result = await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(RESUME_TEXT),
      filename: 'resume-reformatted.txt',
      mimeType: 'text/plain',
      kind: 'resume',
    });

    expect(result.alreadyImported).toBe(true);
    expect(result.duplicateOfUserFileId).toBe('file-prior');
    expect(userFileRegistry.deleteStoredBinary).toHaveBeenCalledOnce();
    expect(resumeParsingService.processResumeFromText).not.toHaveBeenCalled();
    expect(resumeLorePopulationService.populate).not.toHaveBeenCalled();
  });
});

describe('unifiedFileIngestionService — caption bundling (attachment + composer prompt as one unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userFileRegistry.listAllForUser).mockResolvedValue([]);
    vi.mocked(userFileRegistry.getForUser).mockResolvedValue(null);
    vi.mocked(resumeParsingService.getResumeDocuments).mockResolvedValue([]);
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

  it('folds a caption into the document analysis pass, not just the archived copy', async () => {
    await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(GENERIC_TEXT),
      filename: 'diary_entry.txt',
      mimeType: 'text/plain',
      kind: 'document',
      caption: 'This is about my breakup, focus on that',
    });

    const [, artifact] = vi.mocked(documentService.processDocumentFromArtifact).mock.calls[0];
    expect(artifact.text).toContain('[User note: This is about my breakup, focus on that]');
    expect(artifact.text).toContain(GENERIC_TEXT);
  });

  it('omits the caption preamble entirely when none was given', async () => {
    await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(GENERIC_TEXT),
      filename: 'diary_entry.txt',
      mimeType: 'text/plain',
      kind: 'document',
    });

    const [, artifact] = vi.mocked(documentService.processDocumentFromArtifact).mock.calls[0];
    expect(artifact.text).not.toContain('[User note:');
  });

  it('folds a caption into the saved resume summary entry without corrupting the parsed resume text', async () => {
    await unifiedFileIngestionService.ingest({
      userId: 'user-1',
      buffer: bufferFor(RESUME_TEXT),
      filename: 'resume.txt',
      mimeType: 'text/plain',
      kind: 'resume',
      caption: 'Here is my updated resume',
    });

    // The heuristic/structured parser sees the resume text untouched.
    const [, parsedText] = vi.mocked(resumeParsingService.processResumeFromText).mock.calls[0];
    expect(parsedText).not.toContain('[User note:');
    expect(parsedText).toContain('Jane Doe');

    // But the saved memory entry carries the caption alongside the resume text.
    const savedEntry = vi.mocked(memoryService.saveEntry).mock.calls.find(
      ([arg]) => typeof arg.content === 'string' && arg.content.includes('[Resume:'),
    )?.[0];
    expect(savedEntry?.content).toContain('[User note: Here is my updated resume]');
    expect(savedEntry?.content).toContain('[Resume: resume.txt]');
  });
});
