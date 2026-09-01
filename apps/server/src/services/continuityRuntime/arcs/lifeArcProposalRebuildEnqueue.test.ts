import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearLifeArcProposalRefreshTimers,
  proposalMetadataAffectsSwimlanes,
  shouldAutoCreateReadyAfterApproval,
} from './lifeArcProposalRebuildEnqueue';

describe('lifeArcProposalRebuildEnqueue helpers', () => {
  afterEach(() => {
    clearLifeArcProposalRefreshTimers();
    vi.restoreAllMocks();
  });

  it('skips swimlane refresh for low-timeline ChatGPT categories', () => {
    expect(proposalMetadataAffectsSwimlanes({ category: 'preferences_habits' })).toBe(false);
    expect(proposalMetadataAffectsSwimlanes({ category: 'timeline' })).toBe(true);
    expect(proposalMetadataAffectsSwimlanes({ source: 'chatgpt_export', category: 'preferences_habits' })).toBe(true);
  });

  it('auto-creates ready bars for ChatGPT timeline imports', () => {
    expect(shouldAutoCreateReadyAfterApproval({ source: 'chatgpt_export', category: 'timeline' })).toBe(true);
    expect(shouldAutoCreateReadyAfterApproval({ category: 'preferences_habits' })).toBe(false);
  });
});
