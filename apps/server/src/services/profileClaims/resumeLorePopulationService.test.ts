import { describe, it, expect, vi, beforeEach } from 'vitest';

import { memoryService } from '../memoryService';
import { organizationService } from '../organizationService';
import { skillService } from '../skills/skillService';
import { projectSuggestionService } from '../projects/projectSuggestionService';
import { resumeCharacterEnrichmentService } from './resumeCharacterEnrichmentService';
import { resumeRoleConflictService } from './resumeRoleConflictService';
import { resumeLorePopulationService } from './resumeLorePopulationService';
import type { ParsedResume } from './resumeStructuredTypes';
import { supabaseFromMock, makeSupabaseChain } from '../../../tests/setup';

vi.mock('../memoryService', () => ({ memoryService: { saveEntry: vi.fn() } }));
vi.mock('../organizationService', () => ({ organizationService: { createOrganization: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../skills/skillService', () => ({
  skillService: { getSkills: vi.fn().mockResolvedValue([]), createSkill: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../projects/projectSuggestionService', () => ({
  projectSuggestionService: { upsertManyFromExtraction: vi.fn().mockResolvedValue(0) },
}));
vi.mock('./resumeCharacterEnrichmentService', () => ({
  resumeCharacterEnrichmentService: { enrichSelfFromResume: vi.fn().mockResolvedValue({ characterAttributes: 0 }) },
}));
vi.mock('./resumeRoleConflictService', () => ({
  resumeRoleConflictService: { detectForUser: vi.fn().mockResolvedValue([]) },
  conflictedCompanyKeys: () => new Set<string>(),
}));

type FakeEvent = { id: string; type: string; start_time: string; metadata: any; confidence: number };

/** A tiny in-memory `resolved_events` table backing find/insert/reinforce across two populate() calls. */
function installResolvedEventsStore() {
  const events: FakeEvent[] = [];
  let nextId = 0;

  supabaseFromMock.mockImplementation((table: string) => {
    if (table === 'characters') {
      return makeSupabaseChain({ data: [], error: null });
    }
    if (table !== 'resolved_events') {
      return makeSupabaseChain({ data: [], error: null });
    }

    return {
      select: (_cols: string) => {
        const filters: Record<string, unknown> = {};
        const chain: any = {
          eq: (key: string, value: unknown) => {
            filters[key] = value;
            return chain;
          },
          maybeSingle: async () => {
            const row = events.find((e) => e.id === filters.id);
            return { data: row ?? null, error: null };
          },
          then: (resolve: (v: { data: FakeEvent[]; error: null }) => void) => {
            const rows = events.filter((e) =>
              Object.entries(filters).every(([k, v]) => (e as any)[k] === v)
            );
            resolve({ data: rows, error: null });
          },
        };
        return chain;
      },
      insert: (row: Record<string, unknown>) => {
        events.push({ ...row, confidence: (row.confidence as number) ?? 0.85 } as FakeEvent);
        nextId++;
        return Promise.resolve({ error: null });
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_key: string, id: string) => {
          const row = events.find((e) => e.id === id);
          if (row) Object.assign(row, patch);
          return Promise.resolve({ error: null });
        },
      }),
    };
  });

  return events;
}

describe('resumeLorePopulationService — multi-resume reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let n = 0;
    vi.mocked(memoryService.saveEntry).mockImplementation(async () => ({ id: `entry-${++n}` }) as any);
  });

  const resumeWithVanguardJob = (
    companyName = 'Vanguard Robotics',
    overrides: Partial<ParsedResume['employment'][number]> = {}
  ): ParsedResume => ({
    contact: {},
    summary: '',
    employment: [
      {
        company: companyName,
        title: 'Robotics Deployment Technician',
        startDate: '2025-01-01',
        endDate: '2025-12-01',
        ...overrides,
      },
    ],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    employmentGaps: [],
    languages: [],
    careerTargets: [],
  });

  it('creates a fresh timeline event for a job seen for the first time', async () => {
    const events = installResolvedEventsStore();

    const result = await resumeLorePopulationService.populate('user-1', resumeWithVanguardJob(), {
      sourceFileId: 'file-1',
      resumeDocumentId: 'doc-1',
      fileName: 'resume-a.pdf',
    });

    expect(result.timelineEvents).toBe(1);
    expect(result.itemsReconciled).toBe(0);
    expect(events).toHaveLength(1);
  });

  it('reconciles instead of duplicating when a second resume lists the same job', async () => {
    const events = installResolvedEventsStore();

    await resumeLorePopulationService.populate('user-1', resumeWithVanguardJob(), {
      sourceFileId: 'file-1',
      resumeDocumentId: 'doc-1',
      fileName: 'resume-a.pdf',
    });
    expect(events).toHaveLength(1);

    // A second resume — different file, same company + same start date —
    // describing the exact same job (a robotics-focused resume vs. a
    // failure-analysis-focused resume both listing Vanguard Robotics).
    const result2 = await resumeLorePopulationService.populate('user-1', resumeWithVanguardJob(), {
      sourceFileId: 'file-2',
      resumeDocumentId: 'doc-2',
      fileName: 'resume-b.pdf',
    });

    expect(events).toHaveLength(1); // still one event, not two
    expect(result2.timelineEvents).toBe(0);
    expect(result2.itemsReconciled).toBe(1);
    expect(events[0].metadata.confirming_source_file_ids).toContain('file-2');
    // Corroboration nudges confidence up from the original 0.88.
    expect(events[0].confidence).toBeGreaterThan(0.88);
  });

  it('preserves a tailored resume\'s distinct framing of the same job as a supplementary entry', async () => {
    const events = installResolvedEventsStore();

    await resumeLorePopulationService.populate(
      'user-1',
      resumeWithVanguardJob('Vanguard Robotics', {
        title: 'Robotics Deployment Technician',
        description: 'Focused on field deployment and hardware bring-up.',
      }),
      { sourceFileId: 'file-1', resumeDocumentId: 'doc-1', fileName: 'resume-a.pdf' }
    );
    expect(events).toHaveLength(1);

    // A second, differently-tailored resume for the exact same job — same
    // company + start date, but different emphasis (failure analysis instead
    // of field deployment). The job itself should still reconcile to the
    // same event, but the distinct framing should be preserved, not dropped.
    const result2 = await resumeLorePopulationService.populate(
      'user-1',
      resumeWithVanguardJob('Vanguard Robotics', {
        title: 'Failure Analysis Technician',
        description: 'Focused on root-cause failure analysis and prototype validation.',
      }),
      { sourceFileId: 'file-2', resumeDocumentId: 'doc-2', fileName: 'resume-b.pdf' }
    );

    expect(events).toHaveLength(1); // still one timeline event
    expect(result2.itemsReconciled).toBe(1);
    expect(result2.timelineEvents).toBe(0);
    // The tailored detail was preserved as a supplementary journal entry, not discarded.
    expect(result2.journalEntries).toBe(1);
    expect(result2.entryIds).toHaveLength(1);

    const variants = events[0].metadata.resume_variants;
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      source_file_id: 'file-2',
      title: 'Failure Analysis Technician',
      description: 'Focused on root-cause failure analysis and prototype validation.',
    });
  });

  it('does not reconcile jobs at different companies even with the same start date', async () => {
    const events = installResolvedEventsStore();

    await resumeLorePopulationService.populate('user-1', resumeWithVanguardJob('Vanguard Robotics'), {
      sourceFileId: 'file-1',
      resumeDocumentId: 'doc-1',
      fileName: 'resume-a.pdf',
    });
    const result2 = await resumeLorePopulationService.populate('user-1', resumeWithVanguardJob('Meridian Test Labs'), {
      sourceFileId: 'file-2',
      resumeDocumentId: 'doc-2',
      fileName: 'resume-b.pdf',
    });

    expect(events).toHaveLength(2);
    expect(result2.itemsReconciled).toBe(0);
    expect(result2.timelineEvents).toBe(1);
  });

  it('uses the resume job year as occurrence, not upload time', async () => {
    installResolvedEventsStore();
    const saveCalls: Array<Record<string, unknown>> = [];
    vi.mocked(memoryService.saveEntry).mockImplementation(async (payload) => {
      saveCalls.push(payload as unknown as Record<string, unknown>);
      return { id: `entry-${saveCalls.length}` } as any;
    });

    await resumeLorePopulationService.populate(
      'user-maya',
      resumeWithVanguardJob('Vanguard Robotics', { startDate: '2024', endDate: '2025' }),
      { sourceFileId: 'file-resume', resumeDocumentId: 'doc-resume', fileName: 'maya-resume.pdf' }
    );

    const jobEntry = saveCalls.find((c) => String(c.content).includes('Vanguard Robotics'));
    expect(jobEntry).toBeTruthy();
    expect(String(jobEntry?.date).startsWith('2024')).toBe(true);
    expect(jobEntry?.temporalSource).toBe('document_stated');
    expect(jobEntry?.date).not.toBe(jobEntry?.importedAt);
  });

  it('leaves undated resume jobs unresolved instead of using upload time', async () => {
    installResolvedEventsStore();
    const saveCalls: Array<Record<string, unknown>> = [];
    vi.mocked(memoryService.saveEntry).mockImplementation(async (payload) => {
      saveCalls.push(payload as unknown as Record<string, unknown>);
      return { id: `entry-${saveCalls.length}` } as any;
    });

    await resumeLorePopulationService.populate(
      'user-maya',
      resumeWithVanguardJob('Vanguard Robotics', { startDate: undefined, endDate: undefined }),
      { sourceFileId: 'file-resume', resumeDocumentId: 'doc-resume', fileName: 'maya-resume.pdf' }
    );

    const jobEntry = saveCalls.find((c) => String(c.content).includes('Vanguard Robotics'));
    expect(jobEntry).toBeTruthy();
    expect(jobEntry?.date).toBeUndefined();
    expect(jobEntry?.temporalSource).toBe('recording_fallback');
  });

  it('does not stamp tenant A occurrence onto tenant B writes', async () => {
    installResolvedEventsStore();
    const saveCalls: Array<Record<string, unknown>> = [];
    vi.mocked(memoryService.saveEntry).mockImplementation(async (payload) => {
      saveCalls.push(payload as unknown as Record<string, unknown>);
      return { id: `entry-${saveCalls.length}` } as any;
    });

    await resumeLorePopulationService.populate('user-maya', resumeWithVanguardJob(), {
      sourceFileId: 'file-a',
      resumeDocumentId: 'doc-a',
      fileName: 'maya.pdf',
    });
    await resumeLorePopulationService.populate('user-jamie', resumeWithVanguardJob('Northwind Labs'), {
      sourceFileId: 'file-b',
      resumeDocumentId: 'doc-b',
      fileName: 'jamie.pdf',
    });

    expect(saveCalls.some((c) => c.userId === 'user-maya')).toBe(true);
    expect(saveCalls.some((c) => c.userId === 'user-jamie')).toBe(true);
    expect(saveCalls.every((c) => c.userId === 'user-maya' || c.userId === 'user-jamie')).toBe(true);
  });
});
