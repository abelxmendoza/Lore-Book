import { describe, expect, it } from 'vitest';
import {
  computeImportance,
  computeImportanceScore,
  scoreToLevel,
  type ImportanceInputs,
} from '../../src/services/characters/characterImportanceService';

describe('characterImportanceService', () => {
  const base: ImportanceInputs = {
    mentionCount: 0,
    distinctMemories: 0,
    distinctEvents: 0,
    timelineAppearances: 0,
    relationshipCount: 0,
    conversationFrequency: 0,
    recencyDays: null,
    isFamily: false,
    isSelf: false,
    relationshipTypeWeight: 0.2,
  };

  it('scores Grandma Rose higher than background scene character', () => {
    const abuela = computeImportance({
      ...base,
      mentionCount: 8,
      distinctMemories: 4,
      distinctEvents: 2,
      timelineAppearances: 2,
      relationshipCount: 2,
      isFamily: true,
      relationshipTypeWeight: 0.9,
      recencyDays: 3,
    });

    const scene = computeImportance({
      ...base,
      mentionCount: 1,
      distinctMemories: 0,
    });

    expect(abuela.importanceScore).toBeGreaterThan(scene.importanceScore);
    expect(abuela.importanceLevel).toMatch(/legendary|major|supporting/);
  });

  it('assigns legendary to self', () => {
    expect(scoreToLevel(50, true)).toBe('legendary');
    expect(computeImportanceScore({ ...base, isSelf: true })).toBe(100);
  });

  it('floors structurally important family above random scene contacts', () => {
    const mom = computeImportance({
      ...base,
      mentionCount: 1,
      distinctMemories: 1,
      isFamily: true,
      relationshipTypeWeight: 1,
      structuralImportanceFloor: 65,
    });

    const sceneContact = computeImportance({
      ...base,
      mentionCount: 1,
      distinctMemories: 1,
      relationshipTypeWeight: 0.2,
    });

    expect(mom.importanceScore).toBeGreaterThanOrEqual(65);
    expect(mom.importanceScore).toBeGreaterThan(sceneContact.importanceScore);
    expect(mom.importanceLevel).toMatch(/major|legendary/);
  });

  it('is deterministic', () => {
    const inputs = { ...base, mentionCount: 5, distinctMemories: 2, isFamily: true };
    expect(computeImportance(inputs)).toEqual(computeImportance(inputs));
  });
});
