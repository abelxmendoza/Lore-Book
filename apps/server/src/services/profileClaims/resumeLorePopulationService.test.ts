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

  const resumeWithVanguardJob = (companyName = 'Vanguard Robotics'): ParsedResume => ({
    contact: {},
    summary: '',
    employment: [
      { company: companyName, title: 'Robotics Deployment Technician', startDate: '2025-01-01', endDate: '2025-12-01' },
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
});
