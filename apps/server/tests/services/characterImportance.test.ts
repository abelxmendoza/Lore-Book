import { describe, expect, it, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  computeImportance,
  computeImportanceScore,
  scoreToLevel,
  isImportancePinned,
  persistCharacterImportance,
  type ImportanceInputs,
} from '../../src/services/characters/characterImportanceService';

type Row = Record<string, unknown>;

function selectChain(data: Row | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data, error: null }),
  };
  return builder;
}

function updateChain(onUpdate: (payload: Record<string, unknown>) => void) {
  const builder = {
    update: (payload: Record<string, unknown>) => {
      onUpdate(payload);
      return builder;
    },
    eq: () => builder,
  };
  return builder;
}

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

describe('isImportancePinned', () => {
  it('is true only when metadata.importance_level_source is user_confirmed', () => {
    expect(isImportancePinned({ importance_level_source: 'user_confirmed' })).toBe(true);
    expect(isImportancePinned({ importance_level_source: 'auto' })).toBe(false);
    expect(isImportancePinned({})).toBe(false);
    expect(isImportancePinned(null)).toBe(false);
    expect(isImportancePinned(undefined)).toBe(false);
  });
});

describe('persistCharacterImportance — manual pin', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  const result = { importanceScore: 42, importanceLevel: 'supporting' as const, inputs: {} as ImportanceInputs };

  it('never writes over a character the user has pinned', async () => {
    let updateCalled = false;
    fromMock.mockImplementation((table: string) => {
      if (table === 'characters') {
        return {
          ...selectChain({ metadata: { importance_level_source: 'user_confirmed' } }),
          ...updateChain(() => {
            updateCalled = true;
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await persistCharacterImportance('user-1', 'char-1', result);
    expect(updateCalled).toBe(false);
  });

  it('writes normally when the character is not pinned', async () => {
    let updatePayload: Record<string, unknown> | null = null;
    fromMock.mockImplementation((table: string) => {
      if (table === 'characters') {
        return {
          ...selectChain({ metadata: {} }),
          ...updateChain((payload) => {
            updatePayload = payload;
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await persistCharacterImportance('user-1', 'char-1', result);
    expect(updatePayload).not.toBeNull();
    expect((updatePayload as unknown as { importance_level: string }).importance_level).toBe('supporting');
    expect((updatePayload as unknown as { importance_score: number }).importance_score).toBe(42);
  });
});
