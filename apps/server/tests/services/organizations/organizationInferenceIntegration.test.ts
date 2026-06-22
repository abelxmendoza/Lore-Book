import { describe, it, expect, vi, beforeEach } from 'vitest';

import { runOrganizationInferenceForMessage } from '../../../src/services/organizations/inference/organizationInferenceIntegrationService';
import { organizationInferenceService } from '../../../src/services/organizations/inference/organizationInferenceService';

vi.mock('../../../src/services/organizations/organizationSuggestionService', () => ({
  organizationSuggestionService: {
    upsertFromInference: vi.fn(async () => true),
  },
}));

const { organizationSuggestionService } = await import(
  '../../../src/services/organizations/organizationSuggestionService'
);

describe('organization inference integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs inference and upserts suggestions for employer context', async () => {
    const summary = await runOrganizationInferenceForMessage(
      'user-1',
      'I worked at Vanguard Robotics on navigation.',
      'msg-1',
    );

    expect(summary.candidatesAccepted).toBeGreaterThan(0);
    expect(summary.suggestionsUpserted).toBeGreaterThan(0);
    expect(organizationSuggestionService.upsertFromInference).toHaveBeenCalled();
  });

  it('skips empty messages', async () => {
    const summary = await runOrganizationInferenceForMessage('user-1', '  ', 'msg-1');
    expect(summary.candidatesAccepted).toBe(0);
    expect(organizationSuggestionService.upsertFromInference).not.toHaveBeenCalled();
  });

  it('rejects bare generic org labels via inference service', () => {
    const result = organizationInferenceService.inferFromMessage({
      text: 'I joined a company at school.',
      sourceMessageId: 'msg-2',
      authorRole: 'user',
    });
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'company')).toBe(false);
  });
});
