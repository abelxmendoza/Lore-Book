import { describe, expect, it } from 'vitest';

import { modeRouterService } from './modeRouterService';

describe('Book query mode routing', () => {
  it('routes cross-Book questions before a single Book can capture them', async () => {
    const result = await modeRouterService.routeMessage(
      'synthetic-user',
      'What skills support my active quests?',
    );
    expect(result.mode).toBe('BOOK_QUERY');
  });

  it('routes generic Documents and Life Log questions to the Book registry', async () => {
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Which documents mention MemoVault?',
    )).resolves.toMatchObject({ mode: 'BOOK_QUERY' });
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Show Life Log events with Marcus',
    )).resolves.toMatchObject({ mode: 'BOOK_QUERY' });
  });

  it('routes explicit connection questions to the graph-backed Book query mode', async () => {
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Who introduced me to Marcus?',
    )).resolves.toMatchObject({ mode: 'BOOK_QUERY' });
  });

  it('routes People Book list queries to the dedicated character handler', async () => {
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Which people need review?',
    )).resolves.toMatchObject({ mode: 'CHARACTER_QUERY' });
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Who do I know from Vanguard Robotics?',
    )).resolves.toMatchObject({ mode: 'CHARACTER_QUERY' });
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Show people in my character book',
    )).resolves.toMatchObject({ mode: 'CHARACTER_QUERY' });
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Which people look related?',
    )).resolves.toMatchObject({ mode: 'CHARACTER_QUERY' });
  });

  it('does not steal who-is recall or family-tree review into Character Book list query', async () => {
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Who is Marcus?',
    )).resolves.not.toMatchObject({ mode: 'CHARACTER_QUERY' });
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Which relatives need review?',
    )).resolves.toMatchObject({ mode: 'FAMILY_QUERY' });
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Who are the characters in my story?',
    )).resolves.toMatchObject({ mode: 'FOUNDATION_RECALL' });
  });

  it('preserves single-Book, timeline, and write precedence', async () => {
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Show my blocked quests',
    )).resolves.toMatchObject({ mode: 'QUEST_QUERY' });
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Show the timeline of MemoVault',
    )).resolves.toMatchObject({ mode: 'SUBJECT_TIMELINE' });
    await expect(modeRouterService.routeMessage(
      'synthetic-user',
      'Add MemoVault as a project',
    )).resolves.toMatchObject({ mode: 'PROJECT_WRITE' });
  });
});
