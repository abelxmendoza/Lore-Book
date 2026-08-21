import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listProjects } = vi.hoisted(() => ({ listProjects: vi.fn() }));

vi.mock('../projectService', () => ({
  projectService: { listProjects },
}));

import { isProjectStateRecallShape, resolveProjectStateTarget } from './projectStateRecallService';

describe('projectStateRecallService intent shape', () => {
  beforeEach(() => {
    listProjects.mockReset();
  });

  it.each([
    "What's the current state of LoreBook, and what should I do next?",
    'Where are we with MemoVault and what is the next priority?',
    'How is LifeLedger progressing?',
    'What has been completed on Vanguard Robotics?',
  ])('recognizes grounded project-state language: %s', (message) => {
    expect(isProjectStateRecallShape(message)).toBe(true);
  });

  it.each([
    'I worked on LoreBook today.',
    'Tell me a story about MemoVault.',
    'What is the current state of my life?',
  ])('does not treat ordinary statements or broad life recall as project state: %s', (message) => {
    expect(isProjectStateRecallShape(message)).toBe(false);
  });

  it('requires the named target to resolve against the canonical Projects Book', async () => {
    listProjects.mockResolvedValue([
      { id: 'project-lorebook', name: 'LoreBook', normalized_name: 'lorebook', metadata: null },
      { id: 'project-other', name: 'LifeLedger', normalized_name: 'lifeledger', metadata: null },
    ]);

    await expect(resolveProjectStateTarget(
      'user-1',
      "What's the current state of LoreBook, and what should I do next?",
    )).resolves.toMatchObject({ id: 'project-lorebook', name: 'LoreBook' });
    await expect(resolveProjectStateTarget(
      'user-1',
      "What's the current state of UnknownProject, and what should I do next?",
    )).resolves.toBeNull();
  });
});
