import { describe, it, expect } from 'vitest';

import { FOCUSED_ENTITY_CHAT_PRESETS } from './focusedEntityChatPresets';

describe('FOCUSED_ENTITY_CHAT_PRESETS.family', () => {
  const preset = FOCUSED_ENTITY_CHAT_PRESETS.family;

  it('is a character entity so it uses the same Character Book record family classification reads from', () => {
    expect(preset.entityType).toBe('character');
    expect(preset.sourceSurface).toBe('family');
  });

  it('existingPrompt asks to confirm the family relation and update their lore, without inventing details', () => {
    const prompt = preset.existingPrompt('Aunt Carla');
    expect(prompt).toContain('Aunt Carla');
    expect(prompt).toMatch(/related to me/i);
    expect(prompt).toMatch(/family/i);
    expect(prompt).toMatch(/do not invent/i);
  });

  it('introducePrompt asks the model to create the character, mark them family, and capture the relation as described', () => {
    const prompt = preset.introducePrompt('Uncle Ray');
    expect(prompt).toContain('Uncle Ray');
    expect(prompt).toMatch(/create their Character Book entry/i);
    expect(prompt).toMatch(/mark them as family/i);
    expect(prompt).toMatch(/exactly as I describe/i);
  });

  it('introducePrompt folds in a role hint when one was decomposed from the name', () => {
    const prompt = preset.introducePrompt('Ray', { rolePhrase: "my mom's brother" });
    expect(prompt).toContain("Their role is my mom's brother.");
  });

  it('has non-empty, distinct copy for every required field', () => {
    const { copy } = preset;
    for (const [key, value] of Object.entries(copy)) {
      if (key === 'introduceVerb') continue; // optional field
      expect(value, `copy.${key} should be non-empty`).toBeTruthy();
    }
  });
});
