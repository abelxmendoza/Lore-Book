import { describe, it, expect } from 'vitest';

import { questLogInferenceService } from '../../../src/services/questLog/inference/questLogInferenceService';
import {
  isBareGenericQuestLabel,
  isConsumerToolOnlyMention,
} from '../../../src/services/questLog/inference/questLogInferenceService';
import { isBareTaskLabel } from '../../../src/services/questLog/inference/taskInferenceService';
import {
  isProjectBookEntity,
  shouldCreateProjectCardFromQuestItem,
} from '../../../src/services/questLog/inference/questProjectLinker';
import { hasProvenance } from '../../../src/services/questLog/inference/questLogProvenanceService';

function infer(text: string, extra: Parameters<typeof questLogInferenceService.inferFromMessage>[0] = {}) {
  return questLogInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findAccepted(result: ReturnType<typeof infer>, namePart: string) {
  return result.accepted.find((c) =>
    c.displayName.toLowerCase().includes(namePart.toLowerCase()),
  );
}

describe('quest log inference rules', () => {
  it('Launch LoreBook becomes quest log item', () => {
    const result = infer('I want to Launch LoreBook this quarter.');
    const item = findAccepted(result, 'Launch LoreBook');
    expect(item).toBeDefined();
    expect(item!.itemType).toBe('quest');
  });

  it('Run MVP diagnostic becomes task', () => {
    const result = infer('Next I need to Run MVP diagnostic on production.');
    const item = findAccepted(result, 'Run MVP diagnostic');
    expect(item).toBeDefined();
    expect(item!.itemType).toBe('task');
  });

  it('DATABASE_URL secret becomes task', () => {
    const result = infer('Todo: Add DATABASE_URL to GitHub secrets tonight.');
    const item = findAccepted(result, 'DATABASE_URL');
    expect(item).toBeDefined();
    expect(item!.itemType).toBe('task');
  });

  it('Response Compiler becomes feature under LoreBook', () => {
    const result = infer('Build Response Compiler for LoreBook this week.');
    const item = findAccepted(result, 'Response Compiler');
    expect(item).toBeDefined();
    expect(item!.itemType).toBe('feature');
    expect(item!.context.projectContext).toBe('LoreBook');
  });

  it('Supabase egress issue becomes blocker', () => {
    const result = infer('Supabase egress is blocking production right now.');
    const item = findAccepted(result, 'Supabase egress');
    expect(item).toBeDefined();
    expect(item!.itemType).toBe('blocker');
    expect(item!.context.statusHint).toBe('blocked');
  });

  it('Pay off debt becomes financial goal/quest', () => {
    const result = infer('My goal is to pay off debt this year.');
    const item = findAccepted(result, 'pay off debt') ?? findAccepted(result, 'Pay off debt');
    expect(item).toBeDefined();
    expect(['goal', 'quest']).toContain(item!.itemType);
    expect(item!.context.lifeArea).toBe('finance');
  });

  it('Get robotics job becomes career quest', () => {
    const result = infer("I'm trying to get robotics/AI job before summer.");
    const item = findAccepted(result, 'robotics');
    expect(item).toBeDefined();
    expect(item!.itemType).toBe('quest');
    expect(item!.context.lifeArea).toBe('career');
  });

  it('Find My app rejected', () => {
    expect(isConsumerToolOnlyMention('I used Find My app to locate my phone.', 'Find My app')).toBe(true);
    const result = infer('I used Find My app to locate my phone.');
    expect(result.accepted.some((c) => /find my/i.test(c.displayName))).toBe(false);
  });

  it('project alone rejected', () => {
    expect(isBareGenericQuestLabel('project')).toBe(true);
    const result = infer('Working on a project today.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'project')).toBe(false);
  });

  it('task alone rejected', () => {
    expect(isBareTaskLabel('task')).toBe(true);
    const result = infer('I have a task.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'task')).toBe(false);
  });

  it('feature links to parent project', () => {
    const result = infer('Ship Entity Gravity for LoreBook.');
    const item = findAccepted(result, 'Entity Gravity');
    expect(item).toBeDefined();
    expect(item!.context.projectContext).toBe('LoreBook');
  });

  it('completed item gets done status', () => {
    const result = infer('I finished built and shipped the Response Compiler.');
    const item = result.accepted.find((c) => c.context.statusHint === 'done');
    expect(item).toBeDefined();
  });

  it('blocked item gets blocked status', () => {
    const result = infer('auth is still invalid so deploy is blocked.');
    const item = findAccepted(result, 'auth');
    expect(item).toBeDefined();
    expect(item!.context.statusHint).toBe('blocked');
  });

  it('no Project card created from Quest Log item', () => {
    expect(shouldCreateProjectCardFromQuestItem('Launch LoreBook')).toBe(false);
    expect(shouldCreateProjectCardFromQuestItem('LoreBook')).toBe(true);
    expect(isProjectBookEntity('LoreBook')).toBe(true);
    const result = infer('Launch LoreBook and Run MVP diagnostic.');
    expect(result.accepted.every((c) => !shouldCreateProjectCardFromQuestItem(c.displayName))).toBe(true);
  });

  it('quest log items include provenance', () => {
    const result = infer('I need to Fix Project suggestion guard today.');
    const item = findAccepted(result, 'Fix Project suggestion guard');
    expect(item).toBeDefined();
    expect(hasProvenance(item!)).toBe(true);
    expect(item!.sourceMessageIds).toContain('msg-1');
  });
});
