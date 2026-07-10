import { describe, expect, it } from 'vitest';

import { CHARACTER_ARCHETYPE_PRESETS, inferCharacterArchetype } from './characterArchetypeService';

describe('characterArchetypeService', () => {
  it('includes crush-specific presets for complicated romantic-but-not-relationship cases', () => {
    const values = CHARACTER_ARCHETYPE_PRESETS.map((preset) => preset.value);

    expect(values).toContain('crush');
    expect(values).toContain('unrequited_crush');
    expect(values).toContain('professional');
    expect(values).toContain('confidant');
    expect(values).toContain('protector');
    expect(values).toContain('caretaker');
    expect(values).toContain('catalyst');
    expect(values).toContain('antagonist');
    expect(values).toContain('estranged');
    expect(values).toContain('public_figure');
    expect(values).not.toContain('colleague');
    expect(values).not.toContain('collaborator');
  });

  it('keeps professional work context in one archetype bucket', () => {
    const inference = inferCharacterArchetype({
      name: 'Mara',
      summary: 'My coworker from the studio. We collaborated on a project together.',
    });

    expect(inference.archetype).toBe('professional');
  });

  it('does not let a stale family signal win over unrequited crush context', () => {
    const inference = inferCharacterArchetype({
      name: 'Renna',
      summary:
        'A girl I over pursued and had a crush on before I found out she was 18 but still in high school. I thought she was maybe 20. The situation did not go well for me.',
      tags: ['family'],
      metadata: {
        relationship_type: 'family',
      },
    });

    expect(inference.archetype).toBe('unrequited_crush');
    expect(inference.reason).toMatch(/one-sided crush|overpursuit/i);
  });
});
