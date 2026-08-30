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
vi.mock('../organizationService', () => ({
  organizationService: {
    createOrganization: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../skills/skillService', () => ({
  skillService: {
    getSkills: vi.fn().mockResolvedValue([]),
    createSkill: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../projects/projectSuggestionService', () => ({
  projectSuggestionService: {
    upsertManyFromExtraction: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock('./resumeCharacterEnrichmentService', () => ({
  resumeCharacterEnrichmentService: {
    enrichSelfFromResume: vi.fn().mockResolvedValue({ characterAttributes: 0 }),
  },
}));
vi.mock('./resumeRoleConflictService', () => ({
  resumeRoleConflictService: { detectForUser: vi.fn().mockResolvedValue([]) },
  conflictedCompanyKeys: () => new Set<string>(),
}));

type FakeEvent = {
  id: string;
  type: string;
  start_time: string;
  metadata: any;
  confidence: number;
};

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
            const rows = events.filter((e) => Object.entries(filters).every(([k, v]) => (e as any)[k] === v));
            resolve({ data: rows, error: null });
          },
        };
        return chain;
      },
      insert: (row: Record<string, unknown>) => {
        events.push({
          ...row,
          confidence: (row.confidence as number) ?? 0.85,
        } as FakeEvent);
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

  it('creates related canonical tracks for every dated resume section', async () => {
    const events = installResolvedEventsStore();
    const parsed: ParsedResume = {
      ...resumeWithVanguardJob(),
      projects: [{ name: 'Atlas Drive', startDate: '2023', endDate: '2024' }],
      certifications: [
        {
          name: 'Synthetic Flight Certificate',
          issuer: 'Test Authority',
          date: '2022-06',
        },
      ],
      employmentGaps: [
        {
          label: 'Between Meridian Test Labs and Vanguard Robotics',
          startDate: '2024-01-01',
          endDate: '2024-12-01',
        },
      ],
    };

    const result = await resumeLorePopulationService.populate('user-1', parsed, {
      sourceFileId: 'file-tracks',
      resumeDocumentId: 'doc-tracks',
      fileName: 'resume-tracks.pdf',
    });

    expect(result.timelineEvents).toBe(4);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['career', 'project', 'certification', 'career_gap'])
    );
    expect(events.find((event) => event.type === 'career')?.metadata).toMatchObject({
      source_type: 'resume',
      review_state: 'pending',
      review_required: true,
      timeline_track: 'career',
    });
    expect(events.find((event) => event.type === 'project')?.metadata.timeline_track).toBe('projects');
    expect(events.find((event) => event.type === 'certification')?.metadata.timeline_track).toBe('education');
    expect(events.find((event) => event.type === 'career_gap')?.metadata.timeline_track).toBe('career');
  });

  it('reconciles the same dated project instead of creating another event', async () => {
    const events = installResolvedEventsStore();
    const parsed: ParsedResume = {
      ...resumeWithVanguardJob(),
      employment: [],
      projects: [{ name: 'Atlas Drive', startDate: '2023', endDate: '2024' }],
    };
    await resumeLorePopulationService.populate('user-1', parsed, {
      sourceFileId: 'file-1',
      resumeDocumentId: 'doc-1',
      fileName: 'resume-a.pdf',
    });
    const result = await resumeLorePopulationService.populate('user-1', parsed, {
      sourceFileId: 'file-2',
      resumeDocumentId: 'doc-2',
      fileName: 'resume-b.pdf',
    });

    expect(events).toHaveLength(1);
    expect(result.timelineEvents).toBe(0);
    expect(result.itemsReconciled).toBe(1);
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

  it("preserves a tailored resume's distinct framing of the same job as a supplementary entry", async () => {
    const events = installResolvedEventsStore();

    await resumeLorePopulationService.populate(
      'user-1',
      resumeWithVanguardJob('Vanguard Robotics', {
        title: 'Robotics Deployment Technician',
        description: 'Focused on field deployment and hardware bring-up.',
      }),
      {
        sourceFileId: 'file-1',
        resumeDocumentId: 'doc-1',
        fileName: 'resume-a.pdf',
      }
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
      {
        sourceFileId: 'file-2',
        resumeDocumentId: 'doc-2',
        fileName: 'resume-b.pdf',
      }
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

  it('1. uses job year as occurrence, not upload time', async () => {
    installResolvedEventsStore();
    await resumeLorePopulationService.populate(
      'user-1',
      resumeWithVanguardJob('Vanguard Robotics', {
        startDate: '2024',
        endDate: '2025',
      }),
      {
        sourceFileId: 'file-1',
        resumeDocumentId: 'doc-1',
        fileName: 'resume.pdf',
      }
    );
    const jobCall = vi
      .mocked(memoryService.saveEntry)
      .mock.calls.find((call) => String(call[0].content).includes('Vanguard Robotics'));
    expect(jobCall?.[0].date).toBe('2024-01-01');
    expect(jobCall?.[0].occurrencePrecision).toBe('year');
    expect(jobCall?.[0].temporalSource).toBe('document_stated');
    expect(jobCall?.[0].date).not.toBe(new Date().toISOString());
  });

  it('2. undated resume jobs persist without an occurrence date', async () => {
    installResolvedEventsStore();
    await resumeLorePopulationService.populate(
      'user-1',
      resumeWithVanguardJob('Vanguard Robotics', {
        startDate: undefined,
        endDate: undefined,
      }),
      {
        sourceFileId: 'file-1',
        resumeDocumentId: 'doc-1',
        fileName: 'resume.pdf',
      }
    );
    const jobCall = vi
      .mocked(memoryService.saveEntry)
      .mock.calls.find((call) => String(call[0].content).includes('Vanguard Robotics'));
    expect(jobCall).toBeDefined();
    expect(jobCall?.[0].date).toBeUndefined();
  });

  it('16. tenant isolation — populate is scoped to the given userId', async () => {
    installResolvedEventsStore();
    await resumeLorePopulationService.populate('user-1', resumeWithVanguardJob(), {
      sourceFileId: 'file-1',
      resumeDocumentId: 'doc-1',
      fileName: 'resume.pdf',
    });
    for (const call of vi.mocked(memoryService.saveEntry).mock.calls) {
      expect(call[0].userId).toBe('user-1');
    }
  });
});
