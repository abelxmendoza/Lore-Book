import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyCanonicalStateFromMessage,
  detectCanonicalStateTransitions,
} from '../../src/services/canonicalState';
import { projectService, type ProjectRow } from '../../src/services/projectService';

function project(id: string, name: string, overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id,
    user_id: 'synthetic-user',
    name,
    normalized_name: name.toLowerCase(),
    type: 'project',
    status: 'active',
    description: null,
    summary: null,
    tags: null,
    metadata: {},
    importance_score: 50,
    associated_character_ids: null,
    associated_location_ids: null,
    started_at: null,
    ended_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const message = 'LegacyRobot is not an active project. I haven\'t worked on it since around March. Right now I\'m mainly focused on MemoVault, Night Signal, Fitness, and getting a new job. I was detained by police.';

describe('Canonical State Engine', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('detects project, focus, and life-event transitions without inventing entities', () => {
    const detection = detectCanonicalStateTransitions(message, [
      project('legacy', 'LegacyRobot'),
      project('memory', 'MemoVault'),
      project('music', 'Night Signal'),
    ]);

    expect(detection.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'PROJECT_STATUS_CHANGED', subjectId: 'legacy', after: 'dormant' }),
      expect.objectContaining({ type: 'CURRENT_FOCUS_REPLACED' }),
      expect.objectContaining({ type: 'LIFE_EVENT_DETECTED', subject: 'Police detention' }),
    ]));
    expect(detection.transitions.find((item) => item.type === 'PROJECT_STATUS_CHANGED')?.details)
      .toEqual(expect.objectContaining({ lastActiveText: 'around March' }));
    expect(detection.focusLabels).toEqual(['MemoVault', 'Night Signal', 'Fitness', 'getting a new job']);
    expect(detection.unresolvedSubjects).toEqual(expect.arrayContaining(['Fitness', 'getting a new job']));
  });

  it('applies only resolved project state through the user-scoped project service', async () => {
    const rows = [project('legacy', 'LegacyRobot'), project('memory', 'MemoVault'), project('music', 'Night Signal')];
    vi.spyOn(projectService, 'listProjects').mockResolvedValue(rows);
    const update = vi.spyOn(projectService, 'updateProject').mockImplementation(async (userId, id, patch) => ({
      ...rows.find((row) => row.id === id)!, ...patch, user_id: userId,
    }));

    const result = await applyCanonicalStateFromMessage({
      userId: 'synthetic-user',
      sourceMessageId: 'message-1',
      text: message,
      now: '2026-08-09T20:00:00.000Z',
    });

    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls.every(([userId]) => userId === 'synthetic-user')).toBe(true);
    expect(update).toHaveBeenCalledWith('synthetic-user', 'legacy', expect.objectContaining({
      status: 'dormant',
      importance_score: 35,
      metadata: expect.objectContaining({ current_focus: false }),
    }));
    expect(update).toHaveBeenCalledWith('synthetic-user', 'memory', expect.objectContaining({
      importance_score: 85,
      metadata: expect.objectContaining({ current_focus: true }),
    }));
    expect(result.quality).toEqual(expect.objectContaining({
      stateTransitionsDetected: 3,
      stateTransitionsApplied: 2,
      canonicalProjectsReused: 1,
      unresolvedFocusLabels: 2,
      governanceAutomatic: 3,
      governanceReviewRequired: 0,
      legacyNonAtomicWrites: 3,
    }));
    expect(result.governance).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: 'ALLOW_AUTOMATIC', envelope: expect.objectContaining({ intent: 'RETIRE', category: 'PROJECT' }) }),
      expect.objectContaining({ outcome: 'ALLOW_AUTOMATIC', envelope: expect.objectContaining({ intent: 'UPDATE', category: 'CURRENT_FOCUS' }) }),
    ]));
    expect(update.mock.calls.some(([, , patch]) => JSON.stringify(patch).includes('getting a new job'))).toBe(false);
  });

  it('does not rewrite an already-current canonical state', async () => {
    const rows = [project('legacy', 'LegacyRobot', {
      status: 'dormant',
      importance_score: 35,
      metadata: {
        current_focus: false,
        canonical_state: { status: 'dormant', last_active_text: 'around March' },
      },
    })];
    vi.spyOn(projectService, 'listProjects').mockResolvedValue(rows);
    const update = vi.spyOn(projectService, 'updateProject');

    const result = await applyCanonicalStateFromMessage({
      userId: 'synthetic-user', sourceMessageId: 'message-2',
      text: 'LegacyRobot is not an active project. I have not worked on it since around March.',
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.applied).toEqual([]);
    expect(result.unchanged).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'PROJECT_STATUS_CHANGED' }),
    ]));
  });
});
