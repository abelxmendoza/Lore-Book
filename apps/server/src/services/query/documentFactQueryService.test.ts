import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from },
}));

import { documentFactQueryService } from './documentFactQueryService';

function builderFor(table: string) {
  const response = table === 'resume_documents'
    ? {
        data: [{
          id: 'resume-1',
          file_name: 'career-profile.pdf',
          raw_text: 'Northwind Labs Software Engineer Rio Hondo College Bachelor of Science',
          processing_status: 'completed',
          uploaded_at: '2026-08-20T00:00:00.000Z',
          parsed_data: {
            source_file_id: 'file-1',
            structured: {
              contact: {},
              summary: 'Software engineer focused on reliable systems.',
              employment: [{ company: 'Northwind Labs', title: 'Software Engineer' }],
              education: [{ institution: 'Rio Hondo College', degree: 'Bachelor of Science', field: 'Computer Science' }],
              skills: ['TypeScript'],
              projects: [],
              certifications: [],
              employmentGaps: [],
              languages: ['English'],
              careerTargets: [],
            },
          },
        }],
        error: null,
      }
    : table === 'user_files'
      ? {
          data: [{
            id: 'file-1',
            filename: 'career-profile.pdf',
            ingest_kind: 'resume',
            processing_status: 'completed',
            uploaded_at: '2026-08-20T00:00:00.000Z',
          }],
          error: null,
        }
      : { data: [], error: null };

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    textSearch: vi.fn(() => builder),
    then: (resolve: (value: typeof response) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return builder;
}

describe('DocumentFactQueryService', () => {
  beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => builderFor(table));
  });

  it('returns all employment and education facts for a combined question', async () => {
    const result = await documentFactQueryService.query('user-a', {
      query: 'What jobs have I had and schools have I been to?',
    });

    expect(result.intent).toBe('overview');
    expect(result.facts.some((fact) => fact.kind === 'employment' && fact.value.includes('Northwind Labs'))).toBe(true);
    expect(result.facts.some((fact) => fact.kind === 'education' && fact.value.includes('Rio Hondo College'))).toBe(true);
    expect(result.facts.every((fact) => fact.filename === 'career-profile.pdf')).toBe(true);
  });

  it('keeps every source query scoped to the requesting user', async () => {
    await documentFactQueryService.query('user-b', { query: 'what skills are listed on my resume?' });

    const resumeBuilder = from.mock.results.find((result) => result.value?.select)?.value;
    expect(resumeBuilder.eq).toHaveBeenCalledWith('user_id', 'user-b');
  });

  it('does not expose excerpts when evidence is disabled', async () => {
    const result = await documentFactQueryService.query('user-a', {
      query: 'what jobs have I had?',
      includeEvidence: false,
    });

    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.facts.every((fact) => fact.excerpt === null)).toBe(true);
  });

  it('bounds resume scans before ranking facts in memory', async () => {
    await documentFactQueryService.query('user-a', { query: 'what jobs have I had?', limit: 10 });

    const resumeBuilder = from.mock.results[0]?.value;
    expect(resumeBuilder.limit).toHaveBeenCalledWith(100);
  });
});
