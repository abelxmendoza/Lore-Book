import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../cognition/assertionEvidenceRepository', () => ({
  writeAssertionEvidence: vi.fn().mockResolvedValue(1),
}));

import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import { writeAssertionEvidence } from '../cognition/assertionEvidenceRepository';

import {
  createKnowledgeAssertion,
  linkAssertionEvidence,
  listAssertionsForSource,
  listAssertionsForSubject,
} from './repository';

const input = {
  subject: { kind: 'project', id: 'project-1', label: 'MemoVault' },
  predicate: 'has_status',
  objectValue: 'active',
  assertionClass: 'observation' as const,
  domain: 'project' as const,
  epistemicStance: 'direct_observation' as const,
  assertedBy: { kind: 'user' as const },
  derivationMethod: 'directly_stated' as const,
};

describe('knowledge kernel repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a valid assertion', async () => {
    mockFrom.mockReturnValue(chainableQuery({
      data: { id: 'assertion-1', user_id: 'user-1' },
      error: null,
    }));

    const result = await createKnowledgeAssertion('user-1', input);

    expect(mockFrom).toHaveBeenCalledWith('knowledge_assertions');
    expect(result).toMatchObject({ id: 'assertion-1' });
  });

  it('does not touch storage when policy rejects the assertion', async () => {
    const result = await createKnowledgeAssertion('user-1', {
      ...input,
      certainty: 4,
    });

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('routes evidence through the shared assertion evidence store', async () => {
    const count = await linkAssertionEvidence('user-1', [{
      assertionId: 'assertion-1',
      evidenceKind: 'conversation_message',
      evidenceId: 'message-1',
      relation: 'supports',
    }]);

    expect(count).toBe(1);
    expect(writeAssertionEvidence).toHaveBeenCalledWith('user-1', [
      expect.objectContaining({ targetKind: 'knowledge_assertion', relation: 'supports' }),
    ]);
  });

  it('returns an empty projection when the subject query fails', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: { message: 'missing' } }));
    await expect(listAssertionsForSubject('user-1', 'person', 'person-1')).resolves.toEqual([]);
  });

  it('finds assertions derived from a given legacy source row', async () => {
    mockFrom.mockReturnValue(chainableQuery({
      data: [{ id: 'assertion-1', source_table: 'perception_entries', source_id: 'perc-1' }],
      error: null,
    }));

    const result = await listAssertionsForSource('user-1', 'perception_entries', 'perc-1');

    expect(mockFrom).toHaveBeenCalledWith('knowledge_assertions');
    expect(result).toEqual([{ id: 'assertion-1', source_table: 'perception_entries', source_id: 'perc-1' }]);
  });

  it('returns an empty projection when the source query fails', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: { message: 'missing' } }));
    await expect(listAssertionsForSource('user-1', 'perception_entries', 'perc-1')).resolves.toEqual([]);
  });
});
