import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import {
  extractRelationshipTransitions,
  organizationRelationshipStateService,
} from './organizationRelationshipStateService';
import { supabaseAdmin } from './supabaseClient';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

describe('extractRelationshipTransitions', () => {
  it('detects an application', () => {
    const statements = extractRelationshipTransitions('I applied to Rivian yesterday.');
    expect(statements).toEqual([
      expect.objectContaining({ orgName: 'Rivian yesterday', toRelationship: 'applicant' }),
    ]);
  });

  it('detects an interview', () => {
    const statements = extractRelationshipTransitions('I am interviewing with Amazon next week.');
    expect(statements[0]).toMatchObject({ toRelationship: 'interview_candidate' });
  });

  it('detects being hired, flagging started_at', () => {
    const statements = extractRelationshipTransitions('I got the offer from Amazon!');
    expect(statements[0]).toMatchObject({ toRelationship: 'employee', setStartedAt: true });
  });

  it('detects leaving, flagging ended_at', () => {
    const statements = extractRelationshipTransitions('I left Amazon last month.');
    expect(statements[0]).toMatchObject({ toRelationship: 'former_employee', setEndedAt: true });
  });

  it('returns nothing for unrelated text', () => {
    expect(extractRelationshipTransitions('I had lunch with Kelly today.')).toEqual([]);
  });
});

describe('organizationRelationshipStateService.processMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the current relationship and appends a history row for a known org', async () => {
    const updateSpy = vi.fn().mockReturnThis();
    const insertSpy = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          update: updateSpy,
          then: (resolve: any) =>
            resolve({
              data: [{ id: 'org-1', name: 'Amazon', aliases: [], user_relationship: 'applicant' }],
              error: null,
            }),
        };
      }
      if (table === 'organization_relationship_history') {
        return { insert: insertSpy };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const applied = await organizationRelationshipStateService.processMessage(
      'user-1',
      'I got the offer from Amazon!',
      'msg-1',
    );

    expect(applied).toBe(1);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_relationship: 'employee', user_relationship_started_at: expect.any(String) }),
    );
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        organization_id: 'org-1',
        from_relationship: 'applicant',
        to_relationship: 'employee',
        source_message_id: 'msg-1',
      }),
    );
  });

  it('ignores an organization that does not exist yet — never fabricates one', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
      }
      return { insert: vi.fn() };
    });

    const applied = await organizationRelationshipStateService.processMessage(
      'user-1',
      'I got the offer from Ghost Corp!',
    );
    expect(applied).toBe(0);
  });

  it('is a no-op when the relationship is already at the detected state', async () => {
    const updateSpy = vi.fn();
    const insertSpy = vi.fn();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          update: updateSpy,
          then: (resolve: any) =>
            resolve({
              data: [{ id: 'org-1', name: 'Amazon', aliases: [], user_relationship: 'employee' }],
              error: null,
            }),
        };
      }
      return { insert: insertSpy };
    });

    const applied = await organizationRelationshipStateService.processMessage(
      'user-1',
      'I got the offer from Amazon!',
    );

    expect(applied).toBe(0);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
