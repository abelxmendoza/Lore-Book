import { describe, it, expect } from 'vitest';

import { skillInferenceService } from '../../../src/services/skills/inference/skillInferenceService';
import {
  isBareGenericSkillWord,
  isProjectOrAppWord,
} from '../../../src/services/skills/inference/namedSkillInference';
import { isBareVerbOnly } from '../../../src/services/skills/inference/activityToSkillInference';
import { isLanguageClassNotSkill } from '../../../src/services/skills/inference/languageSkillInference';
import { hasProvenance } from '../../../src/services/skills/inference/skillProvenanceService';
import { boostConfidenceForRepeatedMentions } from '../../../src/services/skills/inference/skillPromotionGate';

function infer(text: string, extra: Parameters<typeof skillInferenceService.inferFromMessage>[0] = {}) {
  return skillInferenceService.inferFromMessage({
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

describe('skill inference rules', () => {
  it('detects Muay Thai as martial_art', () => {
    const result = infer("I'm 6-0 in Muay Thai and training hard.");
    const skill = findAccepted(result, 'Muay Thai');
    expect(skill).toBeDefined();
    expect(skill!.skillType).toBe('martial_art');
  });

  it('detects ROS2 as technical/robotics skill', () => {
    const result = infer('I have been working on ROS2 navigation at work.');
    const skill = findAccepted(result, 'ROS2');
    expect(skill).toBeDefined();
    expect(skill!.skillType).toMatch(/robotics|technical/);
  });

  it('fixing bike becomes Bike Repair', () => {
    const result = infer('I spent the afternoon fixing his bike in the garage.');
    const skill = findAccepted(result, 'Bike Repair');
    expect(skill).toBeDefined();
    expect(skill!.skillType).toBe('maintenance');
    expect(skill!.context.object).toMatch(/bike/i);
  });

  it('fixing alone is rejected', () => {
    expect(isBareGenericSkillWord('fixing')).toBe(true);
    expect(isBareVerbOnly('fixing')).toBe(true);
    const result = infer('I was fixing.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'fixing')).toBe(false);
  });

  it('gardening becomes hobby/skill candidate', () => {
    const result = infer('Gardening is my main thing on weekends.');
    const skill = findAccepted(result, 'Gardening');
    expect(skill).toBeDefined();
    expect(skill!.skillType).toMatch(/hobby|creative/);
  });

  it('ArUco calibration becomes work skill', () => {
    const result = infer('At work I was doing ArUco calibration on the robot arm.');
    const skill = findAccepted(result, 'ArUco Calibration');
    expect(skill).toBeDefined();
    expect(skill!.skillType).toBe('robotics');
    expect(skill!.context.hobbyOrPaid).toBe('paid');
  });

  it('gripper swaps becomes robot maintenance skill', () => {
    const result = infer('My shift included gripper swaps on the production line.');
    const skill = findAccepted(result, 'Gripper Maintenance');
    expect(skill).toBeDefined();
    expect(skill!.skillType).toBe('maintenance');
  });

  it('Japanese Class is group, not skill by itself', () => {
    expect(isLanguageClassNotSkill('I met friends in Japanese Class.')).toBe(true);
    const result = infer('I met friends in Japanese Class.');
    expect(result.accepted.some((c) => c.displayName === 'Japanese')).toBe(false);
    expect(result.rejected.some((r) => r.reason === 'language_class_is_group')).toBe(true);
  });

  it('Japanese language is skill', () => {
    const result = infer('I have been learning Japanese for two years.');
    const skill = findAccepted(result, 'Japanese');
    expect(skill).toBeDefined();
    expect(skill!.skillType).toBe('language');
  });

  it('used to teach boxing for money = former paid skill', () => {
    const result = infer('I used to teach boxing for money back in college.');
    const skill = findAccepted(result, 'Boxing');
    expect(skill).toBeDefined();
    expect(skill!.context.hobbyOrPaid).toBe('paid');
    expect(skill!.context.currentOrFormer).toBe('former');
    expect(skill!.context.proficiencyHint).toMatch(/taught|paid/i);
    expect(skill!.requiresReview).toBe(true);
  });

  it('learning kickboxing for 3 months = current beginner skill', () => {
    const result = infer("I've been learning kickboxing for 3 months.");
    const skill = findAccepted(result, 'Kickboxing');
    expect(skill).toBeDefined();
    expect(skill!.context.proficiencyHint).toBe('beginner');
    expect(skill!.context.currentOrFormer).toBe('current');
    expect(skill!.context.frequencyHint).toMatch(/3 months/i);
  });

  it('project/app words are not skills', () => {
    expect(isProjectOrAppWord('project')).toBe(true);
    expect(isProjectOrAppWord('app')).toBe(true);
    const result = infer('I was working on my app and project all day.');
    expect(result.accepted.some((c) => /^(project|app)$/i.test(c.displayName))).toBe(false);
  });

  it('repeated mentions increase confidence', () => {
    const base = 0.8;
    const boosted = boostConfidenceForRepeatedMentions(base, 8);
    expect(boosted).toBeGreaterThan(base);

    const result = infer('Doing ArUco calibration again today.', {
      priorMentionCounts: { 'aruco calibration': 7 },
    });
    const skill = findAccepted(result, 'ArUco');
    expect(skill).toBeDefined();
    expect(skill!.confidence).toBeGreaterThan(0.85);
  });

  it('every skill has provenance', () => {
    const result = infer('I train Muay Thai and do ArUco calibration at work.');
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const skill of result.accepted) {
      expect(hasProvenance(skill)).toBe(true);
      expect(skill.sourceMessageIds.length).toBeGreaterThan(0);
      expect(skill.evidencePhrases.length).toBeGreaterThan(0);
    }
  });

  it('assistant-generated guesses do not create skills', () => {
    const result = skillInferenceService.inferFromMessage({
      text: 'You might know ROS2 based on context.',
      authorRole: 'assistant',
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'assistant_generated')).toBe(true);
  });
});
